import { prisma } from '../config/index.js';
import { StockUpdateData } from './integration-index.js';
import { createMarketplaceIntegrationWithDecryption } from './integration-helper.js';
import { logger } from './logger.js';
import { MarketplaceType } from '@prisma/client';
import { runJobWithRetry, circuitBreaker, runBatchJob } from './job-wrapper.js';
import { stockRepository } from '../repositories/stock.repository.js';

/**
 * Stok değişikliklerini WooCommerce (MASTER) ve diğer marketplace'lere senkronize eder
 * 
 * DISABLED v3.1: API integrations hard reset
 */
export async function syncStockToMarketplaces(): Promise<void> {
  // v3.1 HARD RESET: Disable stock sync
  const { env } = await import('../config/env.js');
  if (env.INTEGRATIONS_DISABLED) {
    logger.info('⏸️ [v3.1] Stock sync disabled (hard reset mode)');
    return;
  }

  logger.info('🔄 Stok senkronizasyonu başladı...');

  try {
    // Get all companies with active integrations
    const companies = await prisma.company.findMany({
      where: {
        status: 'APPROVED',
        integrations: {
          some: { status: 'ACTIVE' },
        },
      },
      include: {
        integrations: {
          where: { status: 'ACTIVE' },
        },
        warehouses: {
          where: { isActive: true },
        },
      },
    });

    for (const company of companies) {
      try {
        await runJobWithRetry(
          {
            jobName: 'STOCK_SYNC',
            companyId: company.id,
            metadata: {
              companyName: company.name,
            },
          },
          () => syncCompanyStock(company),
          {
            maxRetries: 1,
            timeout: 600000, // 10 minutes
            logToDatabase: true,
          }
        );
      } catch (error) {
        logger.error(`[${company.name}] Stok sync hatası:`, error);
        // Error logging is handled by runJobWithRetry
      }
    }

    logger.info('✅ Stok senkronizasyonu tamamlandı');
  } catch (error) {
    logger.error('❌ Stok senkronizasyonu başarısız:', error);
  }
}

async function syncCompanyStock(company: any): Promise<void> {
  // Get default warehouse
  const defaultWarehouse = company.warehouses.find((w: any) => w.isDefault) || company.warehouses[0];
  if (!defaultWarehouse) {
    logger.warn(`[${company.name}] Default warehouse not found, skipping stock sync`);
    return;
  }

  // Find master marketplace (isMaster = true in settings)
  const masterIntegration = company.integrations.find((integration: any) => {
    const settings = integration.settings as Record<string, any> | undefined;
    return settings?.isMaster === true && integration.status === 'ACTIVE';
  });

  // Get all products with their total stock
  const products = await prisma.product.findMany({
    where: {
      companyId: company.id,
      isActive: true,
    },
    include: {
      stocks: {
        where: {
          warehouseId: defaultWarehouse.id,
        },
      },
      campaignSet: {
        include: {
          stocks: {
            where: {
              warehouseId: defaultWarehouse.id,
            },
          },
        },
      },
      marketplaceProducts: {
        include: {
          integration: true,
        },
      },
    },
  });

  // STOCK LEDGER: Calculate stocks from StockLog movements for all products at once
  // This is the single source of truth - stock.quantity is deprecated
  const stockMap = await stockRepository.calculateStocksFromMovements({
    warehouseId: defaultWarehouse.id,
  });

  // Calculate total stock for each product
  // Map products with their ProductSource entries for each integration
  const productSourceMap = new Map<string, Map<string, any>>(); // productId -> integrationId -> ProductSource
  
  for (const product of products) {
    const sources = await prisma.productSource.findMany({
      where: {
        productId: product.id,
        integration: {
          companyId: company.id,
          status: 'ACTIVE',
        },
      },
    });
    
    const integrationMap = new Map<string, any>();
    for (const source of sources) {
      integrationMap.set(source.integrationId, source);
    }
    productSourceMap.set(product.id, integrationMap);
  }

  // For Campaign SETs, we need to calculate from components
  // Fetch all Campaign SET items to calculate component-based stock
  const campaignSetItemsMap = new Map<string, Array<{ productId: string; variantId: string | null; quantity: number }>>();
  const campaignSetProducts = products.filter(p => p.campaignSetId);
  
  if (campaignSetProducts.length > 0) {
    const campaignSetIds = campaignSetProducts.map(p => p.campaignSetId).filter(Boolean) as string[];
    const allSetItems = await prisma.campaignSetItem.findMany({
      where: {
        campaignSetId: { in: campaignSetIds },
      },
      select: {
        campaignSetId: true,
        productId: true,
        variantId: true,
        quantity: true,
      },
    });
    
    for (const item of allSetItems) {
      if (!campaignSetItemsMap.has(item.campaignSetId)) {
        campaignSetItemsMap.set(item.campaignSetId, []);
      }
      campaignSetItemsMap.get(item.campaignSetId)!.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    }
  }

  // Pre-fetch all stock records for components (for reservedQty calculation)
  const componentProductIds = new Set<string>();
  const componentVariantIds = new Set<string>();
  for (const items of campaignSetItemsMap.values()) {
    for (const item of items) {
      componentProductIds.add(item.productId);
      if (item.variantId) componentVariantIds.add(item.variantId);
    }
  }
  
  const componentStockRecords = await prisma.stock.findMany({
    where: {
      warehouseId: defaultWarehouse.id,
      OR: [
        { productId: { in: Array.from(componentProductIds) } },
        { variantId: { in: Array.from(componentVariantIds) } },
      ],
    },
    select: {
      productId: true,
      variantId: true,
      reservedQty: true,
      quantity: true,
    },
  });
  
  // Create map for quick lookup: productId-variantId -> stock record
  const componentStockMap = new Map<string, { reservedQty: number; quantity: number }>();
  for (const record of componentStockRecords) {
    const key = `${record.productId}-${record.variantId || 'null'}`;
    componentStockMap.set(key, {
      reservedQty: record.reservedQty,
      quantity: record.quantity,
    });
  }

  // MASTER MARKETPLACE: If master exists, fetch stocks from master marketplace API
  let masterStockMap = new Map<string, number>(); // sku -> quantity from master
  
  if (masterIntegration) {
    // ✅ FIX: WooCommerce syncProducts() is disabled, use alternative method with wooCommerceId
    if (masterIntegration.type === 'WOOCOMMERCE') {
      logger.info(`[${company.name}] WooCommerce master marketplace: Fetching stocks using wooCommerceId...`);
      
      try {
        const marketplace = createMarketplaceIntegrationWithDecryption(
          masterIntegration.type as MarketplaceType,
          masterIntegration
        );
        
        // Get products with wooCommerceId
        const productsWithWooCommerceId = products.filter(p => p.wooCommerceId);
        
        if (productsWithWooCommerceId.length > 0) {
          logger.info(`[${company.name}] Fetching ${productsWithWooCommerceId.length} products from WooCommerce master...`);
          
          // Fetch stock for each product using getProduct()
          let fetchedCount = 0;
          for (const product of productsWithWooCommerceId) {
            try {
              const wcProduct = await (marketplace as any).getProduct(product.wooCommerceId!);
              if (wcProduct && product.sku) {
                const stock = wcProduct.stock_quantity || 0;
                masterStockMap.set(product.sku.trim(), stock);
                fetchedCount++;
              }
            } catch (error: any) {
              logger.warn(`[${company.name}] Failed to fetch WooCommerce stock for product ${product.sku} (ID: ${product.wooCommerceId}): ${error.message}`);
              // Continue with other products
            }
          }
          
          logger.info(`[${company.name}] WooCommerce master: ${fetchedCount}/${productsWithWooCommerceId.length} products fetched successfully`);
        } else {
          logger.warn(`[${company.name}] No products with wooCommerceId found, using local stock calculation`);
        }
      } catch (error: any) {
        logger.error(`[${company.name}] WooCommerce master stock fetch error:`, {
          error: error.message,
          stack: error.stack,
        });
        
        // ✅ Log error to SyncLog for admin visibility
        try {
          await prisma.syncLog.create({
            data: {
              type: 'STOCK_SYNC',
              marketplace: masterIntegration.type,
              status: 'FAILED',
              message: `WooCommerce master marketplace'ten stok çekilemedi: ${error.message}`,
              error: error.stack || error.message,
              companyId: company.id,
              metadata: {
                integrationId: masterIntegration.id,
                integrationName: masterIntegration.name,
                errorType: error instanceof Error ? error.name : 'UnknownError',
              },
            },
          });
        } catch (logError) {
          logger.error(`[${company.name}] SyncLog kayıt hatası:`, {
            error: logError instanceof Error ? logError.message : String(logError),
          });
        }
        
        // Continue with local stock calculation if master fetch fails
        logger.warn(`[${company.name}] WooCommerce master stock fetch failed, using local stock calculation`);
      }
    } else {
      try {
        logger.info(`[${company.name}] Master marketplace bulundu: ${masterIntegration.type} (${masterIntegration.name})`);
        logger.info(`[${company.name}] Master marketplace'ten stoklar çekiliyor...`);
        
        const marketplace = createMarketplaceIntegrationWithDecryption(
          masterIntegration.type as MarketplaceType,
          masterIntegration
        );
        
        // Fetch products from master marketplace
        const masterProducts = await marketplace.syncProducts();
        
        // Create map: sku -> stock quantity from master
        for (const masterProduct of masterProducts) {
          if (masterProduct.sku) {
            masterStockMap.set(masterProduct.sku.trim(), masterProduct.stock || 0);
          }
        }
        
        logger.info(`[${company.name}] Master marketplace'ten ${masterStockMap.size} ürün stoku çekildi`);
      } catch (masterError) {
      const errorMessage = masterError instanceof Error ? masterError.message : String(masterError);
      const errorStack = masterError instanceof Error ? masterError.stack : undefined;
      
      logger.error(`[${company.name}] Master marketplace'ten stok çekme hatası:`, {
        error: errorMessage,
        stack: errorStack,
        masterType: masterIntegration.type,
        masterIntegrationId: masterIntegration.id,
      });

      // ✅ Log error to SyncLog for admin visibility
      try {
        await prisma.syncLog.create({
          data: {
            type: 'STOCK_SYNC',
            marketplace: masterIntegration.type,
            status: 'FAILED',
            message: `Master marketplace'ten stok çekilemedi: ${errorMessage}`,
            error: errorStack || errorMessage,
            companyId: company.id,
            metadata: {
              integrationId: masterIntegration.id,
              integrationName: masterIntegration.name,
              errorType: masterError instanceof Error ? masterError.name : 'UnknownError',
            },
          },
        });
      } catch (logError) {
        logger.error(`[${company.name}] SyncLog kayıt hatası:`, {
          error: logError instanceof Error ? logError.message : String(logError),
        });
      }

      // Continue with local stock calculation if master fetch fails
      logger.warn(`[${company.name}] Master marketplace stok çekme başarısız, yerel stok hesaplamasına geçiliyor`);
      }
    }
  }

  const stockUpdates: StockUpdateData[] = products.map(product => {
    let totalStock = 0;
    let reservedQty = 0;

    // MASTER MARKETPLACE: If master exists and has stock for this product, use master stock
    if (masterIntegration && masterStockMap.has(product.sku)) {
      const masterStock = masterStockMap.get(product.sku) || 0;
      totalStock = masterStock;
      logger.debug(`[${company.name}] Product ${product.sku} using master stock: ${masterStock}`);
    } else if (product.campaignSetId && product.campaignSet) {
      // If product is a Campaign SET (using FK relation)
      // For Campaign SETs, calculate from component stocks using StockLog
      const setItems = campaignSetItemsMap.get(product.campaignSetId) || [];
      
      if (setItems.length > 0) {
        // Calculate how many sets can be made from each component
        const setsPossiblePerComponent = setItems.map(item => {
          const componentStockKey = `${item.productId}-${item.variantId || 'null'}-${defaultWarehouse.id}`;
          const componentStock = stockMap.get(componentStockKey) || 0;
          
          // Get reserved quantity for component from pre-fetched records
          const componentRecordKey = `${item.productId}-${item.variantId || 'null'}`;
          const componentStockRecord = componentStockMap.get(componentRecordKey);
          const componentReservedQty = componentStockRecord?.reservedQty || 0;
          
          // If no stock from movements, fallback to stock.quantity
          const finalComponentStock = componentStock > 0 ? componentStock : (componentStockRecord?.quantity || 0);
          const finalAvailableStock = Math.max(0, finalComponentStock - componentReservedQty);
          
          // How many sets can be made from this component?
          const setsPossible = item.quantity > 0 ? Math.floor(finalAvailableStock / item.quantity) : 0;
          
          return setsPossible;
        });
        
        // The minimum determines how many sets can be made
        const setsFromComponents = setsPossiblePerComponent.length > 0
          ? Math.min(...setsPossiblePerComponent)
          : 0;
        
        // Also check CampaignStock (pre-packaged sets)
        const setStockKey = `${product.id}-null-${defaultWarehouse.id}`;
        const setStockFromMovements = stockMap.get(setStockKey) || 0;
        const setStockRecord = product.campaignSet.stocks.find(
          (s: any) => s.warehouseId === defaultWarehouse.id
        );
        const setStock = setStockFromMovements > 0 ? setStockFromMovements : (setStockRecord?.quantity || 0);
        reservedQty = setStockRecord?.reservedQty || 0;
        
        // Total SET stock = minimum of (sets from components, pre-packaged sets)
        totalStock = Math.min(setsFromComponents, setStock);
      } else {
        // No components, use CampaignStock only
        const setStockKey = `${product.id}-null-${defaultWarehouse.id}`;
        const setStockFromMovements = stockMap.get(setStockKey) || 0;
        const setStockRecord = product.campaignSet.stocks.find(
          (s: any) => s.warehouseId === defaultWarehouse.id
        );
        totalStock = setStockFromMovements > 0 ? setStockFromMovements : (setStockRecord?.quantity || 0);
        reservedQty = setStockRecord?.reservedQty || 0;
      }
    } else {
      // For normal products, get stock from StockLog movements (LEDGER-BASED)
      const stockKey = `${product.id}-null-${defaultWarehouse.id}`;
      totalStock = stockMap.get(stockKey) || 0;
      
      // Get reserved quantity from stock table (still tracked there, not in StockLog yet)
      const stockRecord = product.stocks.find(
        (s: any) => s.warehouseId === defaultWarehouse.id && !s.variantId
      );
      reservedQty = stockRecord?.reservedQty || 0;
      
      // If no stock from movements, fallback to stock.quantity (backward compatibility for products without StockLog)
      if (totalStock === 0 && stockRecord) {
        totalStock = stockRecord.quantity;
        logger.debug(`[${company.name}] Product ${product.sku} using fallback stock.quantity: ${totalStock}`);
      }
    }

    return {
      sku: product.sku,
      quantity: Math.max(0, totalStock - reservedQty),
      marketplaceProductId: product.wooCommerceId?.toString(), // For WooCommerce backward compatibility
      barcode: product.barcode || product.gtin || undefined, // Priority: barcode > gtin > undefined
      // Internal fields for matching (not part of StockUpdateData interface)
      _productId: product.id,
      _productSourceMap: productSourceMap.get(product.id),
    } as StockUpdateData & { _productId: string; _productSourceMap: Map<string, any> | undefined };
  });

  if (stockUpdates.length === 0) {
    logger.debug(`[${company.name}] Güncellenecek stok yok`);
    return;
  }

  // Sync to each marketplace
  for (const integration of company.integrations) {
    // Status guard: Only sync ACTIVE integrations
    if (integration.status !== 'ACTIVE') {
      logger.warn(`[${company.name}][${integration.type}] Entegrasyon aktif değil (status: ${integration.status}), stok sync atlanıyor`);
      continue;
    }

    // Check if integration is read-only
    const settings = integration.settings as Record<string, any> | undefined;
    const isReadOnly = settings?.readOnly === true;
    const syncMode = settings?.syncMode || 'AUTO';
    const isMaster = settings?.isMaster === true;

    // Skip master marketplace - we read from it, don't write to it
    if (isMaster) {
      logger.debug(`[${company.name}][${integration.type}] Master marketplace atlandı (sadece okuma)`);
      continue;
    }

    if (isReadOnly) {
      logger.info(`[${company.name}][${integration.type}] Read-only mod: Stok güncellemesi atlandı`);
      continue;
    }

    // MANUAL mod: Stok güncellemesi atlanır
    if (syncMode === 'MANUAL') {
      logger.info(`[${company.name}][${integration.type}] Manuel sync modu: Stok güncellemesi atlandı`);
      continue;
    }

    // Filter products that exist in this marketplace using ProductSource
    // ✅ DÜZELTME: Use ProductSource to find marketplace product IDs properly
    const marketplaceStockUpdates: StockUpdateData[] = [];
    
    for (const update of stockUpdates) {
      const extendedUpdate = update as StockUpdateData & { _productId: string; _productSourceMap: Map<string, any> | undefined };
      const product = products.find(p => p.id === extendedUpdate._productId);
      if (!product) continue;

      let marketplaceProductId: string | undefined = undefined;

      // For WooCommerce, check wooCommerceId (backward compatibility)
      if (integration.type === 'WOOCOMMERCE') {
        marketplaceProductId = product.wooCommerceId?.toString();
      } else {
        // For other marketplaces, use ProductSource
        const productSource = extendedUpdate._productSourceMap?.get(integration.id);
        
        if (productSource) {
          marketplaceProductId = productSource.externalProductId;
        } else {
          // Fallback: check marketplace_products table (legacy)
          const marketplaceProduct = product.marketplaceProducts.find(
            mp => mp.integrationId === integration.id
          );
          if (marketplaceProduct) {
            marketplaceProductId = marketplaceProduct.marketplaceId;
          }
        }
      }

      // Only include if we found a marketplace product ID
      if (marketplaceProductId) {
        // ✅ DÜZELTME: Trendyol için barcode zorunlu - yoksa atla
        if (integration.type === 'TRENDYOL') {
          // Trendyol updateStock API'si barcode gerektirir
          const barcode = update.barcode || product.barcode || product.gtin;
          if (!barcode || barcode.trim() === '') {
            logger.warn(`[${company.name}][${integration.type}] Product ${product.sku} has no barcode, skipping stock update for Trendyol`, {
              productSku: product.sku,
              productId: product.id,
              integrationId: integration.id,
            });
            continue; // Trendyol için barcode zorunlu, atla
          }
          marketplaceStockUpdates.push({
            sku: update.sku,
            quantity: update.quantity,
            marketplaceProductId,
            barcode: barcode.trim(),
          });
        } else {
          // Diğer marketplace'ler için normal devam et
          marketplaceStockUpdates.push({
            sku: update.sku,
            quantity: update.quantity,
            marketplaceProductId,
            barcode: update.barcode,
          });
        }
      } else {
        logger.debug(`[${company.name}][${integration.type}] Product not found in marketplace, skipping stock update`, {
          productSku: update.sku,
          productId: extendedUpdate._productId,
          integrationId: integration.id,
        });
      }
    }

    // MIDDLEWARE mod: Middleware üzerinden stok güncelleme
    if (syncMode === 'MIDDLEWARE') {
      logger.info(`[${company.name}][${integration.type}] Middleware sync modu: Middleware üzerinden stok güncelleme`);
      
      if (!settings?.middlewareType || !settings?.middlewareConfig) {
        logger.error(`[${company.name}][${integration.type}] Middleware config eksik`);
        continue;
      }
      
      try {
        const { createMiddleware } = await import('./integration-middleware.js');
        const middleware = createMiddleware(settings.middlewareType, settings.middlewareConfig);
        await middleware.updateStock(marketplaceStockUpdates);
        logger.info(`[${company.name}][${integration.type}] Middleware üzerinden stok güncellendi`);
        continue;
      } catch (error: any) {
        logger.error(`[${company.name}][${integration.type}] Middleware stok güncelleme hatası:`, error);
        continue;
      }
    }

    const marketplace = createMarketplaceIntegrationWithDecryption(
      integration.type as MarketplaceType,
      integration
    );

    if (marketplaceStockUpdates.length === 0) {
      continue;
    }

    // ✅ DEBUG: WooCommerce için özel log
    if (integration.type === 'WOOCOMMERCE') {
      logger.info(`[${company.name}][WOOCOMMERCE] Stok sync başlıyor: ${marketplaceStockUpdates.length} ürün`, {
        updates: marketplaceStockUpdates.map(u => ({
          sku: u.sku,
          quantity: u.quantity,
          marketplaceProductId: u.marketplaceProductId,
          barcode: u.barcode,
        })),
      });
    }

    // Check circuit breaker
    if (circuitBreaker.isOpen(integration.id)) {
      logger.warn(`[${company.name}][${integration.type}] Circuit breaker açık, stok sync atlanıyor (ID: ${integration.id})`);
      continue;
    }

    try {
      const result = await runJobWithRetry(
        {
          jobName: 'STOCK_SYNC',
          integrationId: integration.id,
          companyId: company.id,
          metadata: {
            marketplaceType: integration.type,
            companyName: company.name,
            stockUpdateCount: marketplaceStockUpdates.length,
          },
        },
        () => marketplace.updateStock(marketplaceStockUpdates),
        {
          maxRetries: 1,
          timeout: 300000, // 5 minutes
          logToDatabase: true,
        }
      );

      // Record success
      circuitBreaker.recordSuccess(integration.id);

      logger.info(`[${company.name}][${integration.type}] Stok sync: ${result.success} başarılı, ${result.failed} hata`);
    } catch (error) {
      // Record failure
      circuitBreaker.recordFailure(integration.id);
      
      logger.error(`[${company.name}][${integration.type}] Stok sync hatası:`, error);
      // Error logging is handled by runJobWithRetry
    }
  }
}

/**
 * Düşük stok uyarılarını kontrol eder
 */
export async function checkLowStockAlerts(): Promise<void> {
  logger.info('🔍 Düşük stok kontrolü başladı...');

  try {
    const lowStockProducts = await prisma.stock.findMany({
      where: {
        quantity: {
          lte: prisma.stock.fields.minQuantity,
        },
        minQuantity: {
          gt: 0,
        },
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, companyId: true },
        },
        warehouse: {
          select: { id: true, name: true },
        },
      },
    });

    if (lowStockProducts.length > 0) {
      logger.warn(`⚠️ ${lowStockProducts.length} ürün düşük stokta`);

      // Group by company for notifications
      const byCompany = lowStockProducts.reduce((acc, stock) => {
        const companyId = stock.product.companyId;
        if (!acc[companyId]) {
          acc[companyId] = [];
        }
        acc[companyId].push({
          productName: stock.product.name,
          sku: stock.product.sku,
          warehouse: stock.warehouse.name,
          currentQty: stock.quantity,
          minQty: stock.minQuantity,
        });
        return acc;
      }, {} as Record<string, any[]>);

      // TODO: Send notifications (email, webhook, etc.)
      for (const [companyId, products] of Object.entries(byCompany)) {
        logger.info(`[Company: ${companyId}] ${products.length} ürün düşük stokta`);
      }
    }

    logger.info('✅ Düşük stok kontrolü tamamlandı');
  } catch (error) {
    logger.error('❌ Düşük stok kontrolü başarısız:', error);
  }
}

