import { prisma } from '../config/index.js';
import { OrderSyncData, MarketplaceOrderStatus, SyncMode, IntegrationSettings } from './integration-index.js';
import { createMarketplaceIntegrationWithDecryption } from './integration-helper.js';
import { productRepository } from '../repositories/product.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { generateOrderNumber } from './helpers.js';
import { logger } from './logger.js';
import { MarketplaceType, StockLogType, OrderStatus, OrderIngestionStatus, Prisma } from '@prisma/client';
import { runJobWithRetry, circuitBreaker } from './job-wrapper.js';
import { createMiddleware } from './integration-middleware.js';
import { ensureProductStockInWarehouse } from './stock-helper.js';

/**
 * Map marketplace order status to our OrderStatus enum
 * Her marketplace için özel mapping yapılır
 */
function mapMarketplaceStatusToOrderStatus(
  marketplaceStatus: MarketplaceOrderStatus,
  marketplaceType: MarketplaceType
): OrderStatus | null {
  // WooCommerce için özel mapping - Birebir aynı durumlar kullanılıyor
  if (marketplaceType === 'WOOCOMMERCE') {
    const wcMap: Partial<Record<MarketplaceOrderStatus, OrderStatus | null>> = {
      'pending': 'WC_PENDING' as OrderStatus,        // pending - Ödeme bekleniyor
      'on-hold': 'WC_ON_HOLD' as OrderStatus,        // on-hold - Beklemede (manuel onay)
      'processing': 'WC_PROCESSING' as OrderStatus,    // processing - Hazırlanıyor
      'shipped': 'WC_SHIPPED' as OrderStatus,    // shipped - Kargoya verildi (plugin)
      'delivered': 'WC_DELIVERED' as OrderStatus, // delivered - Teslim edildi (plugin)
      'completed': 'WC_COMPLETED' as OrderStatus, // completed - Tamamlandı
      'cancelled': 'WC_CANCELLED' as OrderStatus, // cancelled - İptal edildi
      'refunded': 'WC_REFUNDED' as OrderStatus,   // refunded - İade edildi
      'failed': 'WC_FAILED' as OrderStatus,    // failed - Başarısız (ödeme hatası)
      'trash': 'WC_TRASH' as OrderStatus,            // trash - Silinmiş
    };
    return wcMap[marketplaceStatus] ?? null;
  }
  
  // Trendyol için özel mapping
  if (marketplaceType === 'TRENDYOL') {
    const tyMap: Partial<Record<MarketplaceOrderStatus, OrderStatus | null>> = {
      'pending': 'NEW',        // Created - Yeni sipariş (ödeme bekleniyor)
      'processing': 'PAID',    // Picking, Repack - Ödeme tamamlandı, hazırlanıyor
      'shipped': 'SHIPPED',     // Invoiced, Shipped - Kargoya verildi
      'delivered': 'DELIVERED', // Delivered - Teslim edildi
      'cancelled': 'CANCELLED', // Cancelled, UnSupplied - İptal
      'refunded': 'RETURNED',   // Returned - İade
      'failed': 'CANCELLED',    // UnDelivered - Teslim edilemedi
      'completed': 'DELIVERED', // Tamamlandı
      'on-hold': 'NEW',         // Beklemede - Yeni sipariş
    };
    return tyMap[marketplaceStatus] ?? null;
  }
  
  // Hepsiburada için özel mapping
  if (marketplaceType === 'HEPSIBURADA') {
    const hbMap: Partial<Record<MarketplaceOrderStatus, OrderStatus | null>> = {
      'pending': 'NEW',        // Open - Yeni sipariş (ödeme bekleniyor)
      'processing': 'PAID',    // Approved, Picking, Invoiced - Ödeme tamamlandı, hazırlanıyor
      'shipped': 'SHIPPED',     // Shipped - Kargoya verildi
      'delivered': 'DELIVERED', // Delivered - Teslim edildi
      'cancelled': 'CANCELLED', // Cancelled, CancelledByMerchant, CancelledByCustomer - İptal
      'refunded': 'RETURNED',   // Returned - İade
      'failed': 'CANCELLED',    // UnDeliverable - Başarısız
      'completed': 'DELIVERED', // Tamamlandı
      'on-hold': 'NEW',         // Beklemede - Yeni sipariş
    };
    return hbMap[marketplaceStatus] ?? null;
  }
  
  // N11 için özel mapping
  if (marketplaceType === 'N11') {
    const n11Map: Partial<Record<MarketplaceOrderStatus, OrderStatus | null>> = {
      'pending': 'NEW',        // NewOrder - Yeni sipariş (ödeme bekleniyor)
      'processing': 'PAID',    // Unshipped - Ödeme tamamlandı, hazırlanıyor
      'shipped': 'SHIPPED',     // Shipped - Kargoya verildi
      'delivered': 'DELIVERED', // Delivered - Teslim edildi
      'cancelled': 'CANCELLED', // Cancelled - İptal
      'refunded': 'RETURNED',   // Returned - İade
      'failed': 'CANCELLED',    // Başarısız
      'completed': 'DELIVERED', // Tamamlandı
      'on-hold': 'NEW',         // Beklemede - Yeni sipariş
    };
    return n11Map[marketplaceStatus] ?? null;
  }
  
  // Pazarama için özel mapping
  if (marketplaceType === 'PAZARAMA') {
    const pzMap: Partial<Record<MarketplaceOrderStatus, OrderStatus | null>> = {
      'pending': 'NEW',        // NEW - Yeni sipariş (ödeme bekleniyor)
      'processing': 'PAID',    // APPROVED, PREPARING - Ödeme tamamlandı, hazırlanıyor
      'shipped': 'SHIPPED',     // SHIPPED - Kargoya verildi
      'delivered': 'DELIVERED', // DELIVERED - Teslim edildi
      'cancelled': 'CANCELLED', // CANCELLED - İptal
      'refunded': 'RETURNED',   // RETURNED - İade
      'failed': 'CANCELLED',    // FAILED - Başarısız
      'completed': 'DELIVERED', // COMPLETED - Tamamlandı
      'on-hold': 'NEW',         // Beklemede - Yeni sipariş
    };
    return pzMap[marketplaceStatus] ?? null;
  }
  
  // Amazon için özel mapping
  if (marketplaceType === 'AMAZON') {
    const amzMap: Partial<Record<MarketplaceOrderStatus, OrderStatus | null>> = {
      'pending': 'NEW',        // Pending, PendingAvailability - Yeni sipariş (ödeme bekleniyor)
      'processing': 'PAID',    // Unshipped, InvoiceUnconfirmed - Ödeme tamamlandı, hazırlanıyor
      'shipped': 'SHIPPED',     // PartiallyShipped, Shipped - Kargoya verildi
      'delivered': 'DELIVERED', // Teslim edildi
      'cancelled': 'CANCELLED', // Canceled, Cancelled - İptal
      'refunded': 'RETURNED',   // İade
      'failed': 'CANCELLED',    // Unfulfillable - Başarısız
      'completed': 'DELIVERED', // Tamamlandı
      'on-hold': 'NEW',         // Beklemede - Yeni sipariş
    };
    return amzMap[marketplaceStatus] ?? null;
  }
  
  // Fallback: Genel mapping (bilinmeyen marketplace'ler için)
  const statusMap: Partial<Record<MarketplaceOrderStatus, OrderStatus | null>> = {
    'pending': 'NEW',        // Yeni sipariş (ödeme bekleniyor)
    'processing': 'PAID',    // Ödeme tamamlandı, hazırlanıyor
    'shipped': 'SHIPPED',     // Kargoya verildi
    'delivered': 'DELIVERED', // Teslim edildi
    'completed': 'DELIVERED', // Tamamlandı
    'cancelled': 'CANCELLED', // İptal
    'refunded': 'RETURNED',   // İade
    'on-hold': 'NEW',         // Beklemede - Yeni sipariş
    'failed': 'CANCELLED',    // Başarısız
    'trash': null,            // Silinmiş
  };
  return statusMap[marketplaceStatus] ?? null;
}

/**
 * Check if order status requires stock deduction (processing statuses)
 */
function isProcessingStatus(status: OrderStatus | string): boolean {
  const statusStr = String(status);
  return statusStr === 'PROCESSING' || statusStr === 'WC_PROCESSING' || statusStr === 'PAID';
}

/**
 * Check if order status requires stock restoration (cancelled/refunded statuses)
 */
function isCancelledOrRefundedStatus(status: OrderStatus | string): boolean {
  const statusStr = String(status);
  return statusStr === 'CANCELLED' || 
         statusStr === 'WC_CANCELLED' || 
         statusStr === 'RETURNED' || 
         statusStr === 'WC_REFUNDED' || 
         statusStr === 'WC_FAILED';
}

/**
 * Deduct stock for order items (only for processing statuses)
 */
async function deductOrderStock(
  order: any,
  integration: any,
  defaultWarehouse: any,
  tx?: any
): Promise<void> {
  // Check if order status requires stock deduction
  if (!isProcessingStatus(order.status)) {
    logger.debug(`[${integration.type}] Sipariş durumu stok düşüşü gerektirmiyor: ${order.orderNumber} (${order.status})`);
    return;
  }

  const prismaClient = tx || prisma;
  logger.info(`[${integration.type}] Sipariş için stok düşüşü yapılıyor: ${order.orderNumber} (${order.status})`);

  // Get order items
  const orderWithItems = await prismaClient.order.findUnique({
    where: { id: order.id },
    include: {
      items: {
        include: {
          product: {
            include: {
              campaignSet: {
                include: {
                  items: {
                    include: {
                      product: {
                        select: { id: true, sku: true, name: true },
                      },
                      variant: {
                        select: { id: true, sku: true, name: true },
                      },
                    },
                  },
                },
              },
            },
          },
          variant: true,
        },
      },
    },
  });

  if (!orderWithItems || !orderWithItems.items || orderWithItems.items.length === 0) {
    logger.warn(`[${integration.type}] Sipariş item'ları bulunamadı: ${order.orderNumber}`);
    return;
  }

  // Process each item
  for (const item of orderWithItems.items) {
    if (!item.productId) {
      logger.debug(`[${integration.type}] Ürün ID yok, stok düşüşü atlanıyor: ${item.sku}`);
      continue;
    }

    try {
      // IDEMPOTENCY CHECK: Prevent double stock deduction
      const existingMovement = await prismaClient.stockLog.findFirst({
        where: {
          reference: order.id,
          productId: item.productId,
          variantId: item.variantId || null,
          warehouseId: defaultWarehouse.id,
          type: {
            in: ['OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT'],
          },
        },
      });

      if (existingMovement) {
        logger.debug(`[${integration.type}] Stok düşüşü zaten yapılmış: ${order.orderNumber}, product ${item.productId}. Atlanıyor.`);
        continue;
      }

      // Get product
      const product = await prismaClient.product.findUnique({
        where: { id: item.productId },
        include: {
          campaignSet: {
            include: {
              items: {
                include: {
                  product: {
                    select: { id: true, sku: true, name: true },
                  },
                  variant: {
                    select: { id: true, sku: true, name: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!product) {
        logger.warn(`[${integration.type}] Product bulunamadı: ${item.productId}, stok düşüşü atlanıyor`);
        continue;
      }

      // Check if product is a Campaign SET
      if (product.campaignSetId && product.campaignSet) {
        // Campaign SET stock movement
        const campaignStock = await prismaClient.campaignStock.findUnique({
          where: {
            campaignSetId_warehouseId_locationId: {
              campaignSetId: product.campaignSetId,
              warehouseId: defaultWarehouse.id,
              locationId: '',
            },
          },
        });

        if (campaignStock && campaignStock.quantity >= item.quantity) {
          const previousQty = campaignStock.quantity;
          const newQty = previousQty - item.quantity;

          await prismaClient.stockLog.create({
            data: {
              type: StockLogType.OUT_SET_READY,
              quantity: item.quantity,
              previousQty,
              newQty,
              productId: item.productId,
              warehouseId: defaultWarehouse.id,
              note: `Sipariş stok düşüşü: ${order.orderNumber} (${order.status})`,
              reference: order.id,
            },
          });

          logger.info(`[${integration.type}] Campaign SET stok düşüşü: ${item.sku} -${item.quantity} (${previousQty} -> ${newQty})`);
        } else {
          // Create movements for component stocks
          for (const setItem of product.campaignSet.items) {
            const requiredQty = setItem.quantity * item.quantity;
            
            const componentStock = await prismaClient.stock.findFirst({
              where: {
                productId: setItem.productId,
                warehouseId: defaultWarehouse.id,
                variantId: setItem.variantId || null,
              },
            });

            if (componentStock && componentStock.quantity >= requiredQty) {
              const previousQty = componentStock.quantity;
              const newQty = previousQty - requiredQty;

              await prismaClient.stockLog.create({
                data: {
                  type: StockLogType.OUT_SET_COMPONENT,
                  quantity: requiredQty,
                  previousQty,
                  newQty,
                  productId: setItem.productId,
                  variantId: setItem.variantId || null,
                  warehouseId: defaultWarehouse.id,
                  note: `Campaign SET component çıkışı: ${product.sku} (${item.quantity} adet SET) - Order: ${order.orderNumber}`,
                  reference: order.id,
                },
              });

              logger.info(`[${integration.type}] Component stok düşüşü: ${setItem.productId} -${requiredQty} (${previousQty} -> ${newQty})`);
            } else {
              logger.warn(`[${integration.type}] Yetersiz component stok: ${setItem.productId}. Mevcut: ${componentStock?.quantity || 0}, Gerekli: ${requiredQty}`);
            }
          }
        }
      } else {
        // Normal product stock movement
        let stock = await prismaClient.stock.findFirst({
          where: {
            productId: item.productId,
            warehouseId: defaultWarehouse.id,
            variantId: item.variantId || null,
          },
        });

        if (!stock) {
          stock = await ensureProductStockInWarehouse(
            item.productId,
            defaultWarehouse.id,
            item.variantId || undefined,
            undefined
          );
        }

        if (stock && stock.quantity >= item.quantity) {
          const previousQty = stock.quantity;
          const newQty = previousQty - item.quantity;

          await prismaClient.stockLog.create({
            data: {
              type: StockLogType.OUT,
              quantity: item.quantity,
              previousQty,
              newQty,
              note: `Sipariş stok düşüşü: ${order.orderNumber} (${order.status})`,
              reference: order.id,
              productId: item.productId,
              variantId: item.variantId || null,
              warehouseId: defaultWarehouse.id,
            },
          });

          logger.info(`[${integration.type}] Stok düşüşü: ${item.sku} -${item.quantity} (${previousQty} -> ${newQty})`);
        } else {
          logger.warn(`[${integration.type}] Yetersiz stok: ${product.name}. Mevcut: ${stock?.quantity || 0}, Gerekli: ${item.quantity}`);
        }
      }
    } catch (error: any) {
      logger.error(`[${integration.type}] Stok düşüşü hatası: ${item.sku}`, {
        error: error?.message || String(error),
        productId: item.productId,
        quantity: item.quantity,
      });
    }
  }

  logger.info(`[${integration.type}] Sipariş stok düşüşü tamamlandı: ${order.orderNumber}`);
}

/**
 * Handle order cancellation/refund - restore stock
 */
async function handleOrderCancellation(
  order: any,
  integration: any,
  defaultWarehouse: any
): Promise<void> {
  logger.info(`[${integration.type}] Sipariş iptal edildi, stok iadesi yapılıyor: ${order.orderNumber}`);
  
  // Get order items
  const orderWithItems = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
    },
  });
  
  if (!orderWithItems || !orderWithItems.items) {
    logger.warn(`[${integration.type}] Sipariş item'ları bulunamadı: ${order.orderNumber}`);
    return;
  }
  
  // Restore stock for each item
  for (const item of orderWithItems.items) {
    if (!item.productId) {
      logger.debug(`[${integration.type}] Ürün ID yok, stok iadesi atlanıyor: ${item.sku}`);
      continue;
    }
    
    const warehouseId = order.warehouseId || defaultWarehouse?.id;
    if (!warehouseId) {
      logger.warn(`[${integration.type}] Depo bulunamadı, stok iadesi atlanıyor: ${item.sku}`);
      continue;
    }
    
    try {
      // Find existing stock
      const existingStock = await prisma.stock.findFirst({
        where: {
          productId: item.productId,
          variantId: item.variantId || null,
          warehouseId: warehouseId,
        },
      });
      
      if (existingStock) {
        // Update existing stock - add back the quantity
        const newQuantity = existingStock.quantity + item.quantity;
        
        await prisma.stock.update({
          where: { id: existingStock.id },
          data: { quantity: newQuantity },
        });
        
        // Create stock log for the return
        await prisma.stockLog.create({
          data: {
            type: StockLogType.RETURN,
            quantity: item.quantity,
            previousQty: existingStock.quantity,
            newQty: newQuantity,
            note: `Sipariş iptali: ${order.orderNumber} (${integration.type})`,
            reference: order.orderNumber,
            productId: item.productId,
            variantId: item.variantId || null,
            warehouseId: warehouseId,
          },
        });
        
        logger.info(`[${integration.type}] Stok iade edildi: ${item.sku} +${item.quantity} (${existingStock.quantity} -> ${newQuantity})`);
      } else {
        // Create new stock record if doesn't exist
        await prisma.stock.create({
          data: {
            productId: item.productId,
            variantId: item.variantId || null,
            warehouseId: warehouseId,
            quantity: item.quantity,
          },
        });
        
        // Create stock log
        await prisma.stockLog.create({
          data: {
            type: StockLogType.RETURN,
            quantity: item.quantity,
            previousQty: 0,
            newQty: item.quantity,
            note: `Sipariş iptali: ${order.orderNumber} (${integration.type})`,
            reference: order.orderNumber,
            productId: item.productId,
            variantId: item.variantId || null,
            warehouseId: warehouseId,
          },
        });
        
        logger.info(`[${integration.type}] Stok oluşturuldu ve iade edildi: ${item.sku} +${item.quantity}`);
      }
    } catch (error: any) {
      logger.error(`[${integration.type}] Stok iadesi hatası: ${item.sku}`, {
        error: error?.message || String(error),
        productId: item.productId,
        quantity: item.quantity,
      });
    }
  }
  
  logger.info(`[${integration.type}] Sipariş iptali tamamlandı: ${order.orderNumber}`);
  
  // Anlık stok güncellemesi: İade edilen stokları WooCommerce'e gönder
  try {
    await syncComponentStocksToMarketplace(integration, orderWithItems.items);
  } catch (syncError: any) {
    logger.warn(`[${integration.type}] İptal sonrası stok sync hatası: ${syncError.message}`);
  }
}

/**
 * Sipariş işlendikten sonra component stoklarını marketplace'e gönder
 * SET ürünü satıldığında component stokları düşer, bu stokları hemen marketplace'e sync eder
 */
async function syncComponentStocksToMarketplace(integration: any, orderItems: any[]): Promise<void> {
  // Collect all product IDs that need stock sync
  const productIdsToSync = new Set<string>();
  
  for (const item of orderItems) {
    if (!item.productId) continue;
    
    // Get product with campaign set info
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: {
        campaignSet: {
          include: {
            items: {
              include: {
                product: { select: { id: true, sku: true } },
              },
            },
          },
        },
      },
    });
    
    if (!product) continue;
    
    // If this is a Campaign SET, add all component product IDs
    if (product.campaignSetId && product.campaignSet) {
      for (const setItem of product.campaignSet.items) {
        productIdsToSync.add(setItem.productId);
      }
      logger.debug(`[${integration.type}] Campaign SET component'leri sync listesine eklendi: ${product.sku}`);
    } else {
      // Normal product - add its ID
      productIdsToSync.add(item.productId);
    }
  }
  
  if (productIdsToSync.size === 0) {
    return;
  }
  
  logger.info(`[${integration.type}] ${productIdsToSync.size} ürün için anlık stok sync başlatılıyor...`);
  
  // Get current stock for all products
  const stockUpdates: Array<{ sku: string; quantity: number; marketplaceProductId?: string }> = [];
  
  for (const productId of productIdsToSync) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        stocks: true,
        marketplaceProducts: {
          where: { integrationId: integration.id },
        },
      },
    });
    
    if (!product) continue;
    
    // Calculate total available stock
    const totalStock = product.stocks.reduce(
      (sum, stock) => sum + stock.quantity - stock.reservedQty,
      0
    );
    
    stockUpdates.push({
      sku: product.sku,
      quantity: Math.max(0, totalStock),
      marketplaceProductId: product.wooCommerceId?.toString() || product.marketplaceProducts[0]?.marketplaceId,
    });
  }
  
  if (stockUpdates.length === 0) {
    return;
  }
  
  // Send stock updates to marketplace
  try {
    const marketplace = createMarketplaceIntegrationWithDecryption(
      integration.type as MarketplaceType,
      integration
    );
    
    const result = await marketplace.updateStock(stockUpdates);
    
    logger.info(`[${integration.type}] Anlık stok sync tamamlandı: ${result.success} başarılı, ${result.failed} başarısız`, {
      products: stockUpdates.map(s => `${s.sku}: ${s.quantity}`),
    });
  } catch (error: any) {
    logger.error(`[${integration.type}] Anlık stok sync hatası:`, {
      error: error.message,
      products: stockUpdates.map(s => s.sku),
    });
    throw error;
  }
}

/**
 * Marketplace'lerden siparişleri çeker ve sisteme kaydeder
 * 
 * DISABLED v3.1: API integrations hard reset
 */
export async function syncOrders(): Promise<void> {
  // v3.1 HARD RESET: Disable order sync
  const { env } = await import('../config/env.js');
  if (env.INTEGRATIONS_DISABLED) {
    logger.info('⏸️ [v3.1] Order sync disabled (hard reset mode)');
    return;
  }

  logger.info('🔄 Sipariş senkronizasyonu başladı...');

  try {
    // Get all active integrations
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: { status: 'ACTIVE' },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    });

    if (integrations.length === 0) {
      logger.warn('🔄 Aktif entegrasyon bulunamadı, sipariş sync atlanıyor');
      return;
    }

    logger.info(`🔄 ${integrations.length} aktif entegrasyon bulundu, sipariş sync başlatılıyor...`);

    for (const integration of integrations) {
      // Status guard: Only sync ACTIVE integrations
      if (integration.status !== 'ACTIVE') {
        logger.warn(`[${integration.type}] Entegrasyon aktif değil (status: ${integration.status}), sync atlanıyor`);
        continue;
      }

      // Check circuit breaker
      if (circuitBreaker.isOpen(integration.id)) {
        logger.warn(`[${integration.type}] Circuit breaker açık, sync atlanıyor (ID: ${integration.id})`);
        continue;
      }

      try {
        await runJobWithRetry(
          {
            jobName: 'ORDER_SYNC',
            integrationId: integration.id,
            companyId: integration.companyId,
            metadata: {
              marketplaceType: integration.type,
              companyName: integration.company?.name,
            },
          },
          () => syncIntegrationOrders(integration),
          {
            maxRetries: 1, // Integration level already has retry
            timeout: 600000, // 10 minutes
            logToDatabase: true,
          }
        );
        
        // Record success
        circuitBreaker.recordSuccess(integration.id);
      } catch (error) {
        // Record failure
        circuitBreaker.recordFailure(integration.id);
        
        logger.error(`[${integration.type}] Sipariş sync hatası:`, error);
        // Error logging is handled by runJobWithRetry
      }
    }

    logger.info('✅ Sipariş senkronizasyonu tamamlandı');
  } catch (error) {
    logger.error('❌ Sipariş senkronizasyonu başarısız:', error);
  }
}

export async function syncIntegrationOrders(integration: any): Promise<void> {
  logger.info(`[${integration.type}] Senkronizasyon başlatılıyor...`, {
    integrationId: integration.id,
    companyId: integration.companyId,
    status: integration.status,
    hasApiUrl: !!integration.apiUrl,
    hasApiKey: !!integration.apiKey,
    hasApiSecret: !!integration.apiSecret,
    lastSyncAt: integration.lastSyncAt?.toISOString() || 'null',
  });
  
  const settings = integration.settings as IntegrationSettings | undefined;
  const syncMode = settings?.syncMode || SyncMode.AUTO;
  
  // MANUAL mod: Sadece mevcut siparişleri göster, yeni sync yapma
  if (syncMode === SyncMode.MANUAL) {
    logger.info(`[${integration.type}] Manuel sync modu: Otomatik sync atlandı`);
    return;
  }
  
  // MIDDLEWARE mod: Middleware üzerinden sync
  if (syncMode === SyncMode.MIDDLEWARE) {
    logger.info(`[${integration.type}] Middleware sync modu: Middleware üzerinden sync yapılıyor`);
    
    if (!settings?.middlewareType || !settings?.middlewareConfig) {
      logger.error(`[${integration.type}] Middleware config eksik`);
      throw new Error('Middleware config eksik');
    }
    
    // Validate middleware config has required fields
    if (!settings.middlewareConfig.apiUrl) {
      logger.error(`[${integration.type}] Middleware config apiUrl eksik`);
      throw new Error('Middleware config apiUrl eksik');
    }
    
    try {
      const safeConfig = {
        apiUrl: settings.middlewareConfig.apiUrl ?? '',
        apiKey: settings.middlewareConfig.apiKey ?? '',
        apiSecret: settings.middlewareConfig.apiSecret ?? '',
      };
      const middleware = createMiddleware(settings.middlewareType, safeConfig);
      const orders = await middleware.fetchOrders();
      
      // Process orders (same logic as AUTO mode below)
      // This is a simplified version - full processing should be done
      logger.info(`[${integration.type}] Middleware'den ${orders.length} sipariş alındı`);
      
      // Update lastSyncAt
      await prisma.marketplaceIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });
      
      // TODO: Process orders from middleware (same as AUTO mode)
      // For now, just log and return
      logger.info(`[${integration.type}] Middleware sync tamamlandı (işleme eklenecek)`);
      return;
    } catch (error: any) {
      logger.error(`[${integration.type}] Middleware sync hatası:`, error);
      throw error;
    }
  }
  
  // AUTO mod: Normal API sync (mevcut kod)
  try {
    const marketplace = createMarketplaceIntegrationWithDecryption(
      integration.type as MarketplaceType,
      integration
    );
    
    logger.info(`[${integration.type}] Marketplace integration oluşturuldu`);

    // ✅ YENİ: Her zaman son 1 ayın tüm siparişlerini gerçek durumlarıyla çek
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Son 30 gün (1 ay)
    
    logger.info(`[${integration.type}] Siparişler çekiliyor...`, {
      startDate: startDate.toISOString(),
      reason: 'Son 1 ayın tüm siparişleri çekiliyor (gerçek durumlarıyla)',
      lastSyncAt: integration.lastSyncAt ? integration.lastSyncAt.toISOString() : 'null (tüm durumlar çekiliyor)',
    });
    
    let orders: any[];
    try {
      orders = await marketplace.fetchOrders(startDate, undefined);
    } catch (fetchError: any) {
      logger.error(`[${integration.type}] fetchOrders hatası:`, {
        error: fetchError?.message || String(fetchError),
        stack: fetchError?.stack,
      });
      throw fetchError;
    }
    
    logger.info(`[${integration.type}] fetchOrders sonucu:`, {
      ordersCount: orders?.length || 0,
      ordersType: typeof orders,
      isArray: Array.isArray(orders),
      firstOrderSample: orders?.[0] ? {
        orderNumber: orders[0].orderNumber,
        marketplaceOrderId: orders[0].marketplaceOrderId,
        itemsCount: orders[0].items?.length || 0,
        hasItems: !!orders[0].items && orders[0].items.length > 0,
      } : null,
    });
    
    if (!orders || orders.length === 0) {
      logger.warn(`[${integration.type}] Çekilecek yeni sipariş yok veya fetchOrders boş döndü`);
      // Still update lastSyncAt even if no orders
      await prisma.marketplaceIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });
      
      // Create sync log even when no orders found
      await prisma.syncLog.create({
        data: {
          type: 'ORDER_SYNC',
          marketplace: integration.type,
          status: 'SUCCESS',
          message: 'Yeni sipariş bulunamadı',
          recordsProcessed: 0,
          recordsFailed: 0,
          companyId: integration.companyId,
        },
      });
      
      logger.info(`[${integration.type}] Sipariş sync tamamlandı: 0 sipariş bulundu`);
      return;
    }
    
    logger.info(`[${integration.type}] ${orders.length} sipariş bulundu, işleniyor...`, {
      totalOrders: orders.length,
      ordersWithItems: orders.filter(o => o.items && o.items.length > 0).length,
      ordersWithoutItems: orders.filter(o => !o.items || o.items.length === 0).length,
    });

  let processed = 0;
  let failed = 0;
  let statusUpdated = 0;
  let statusMapFailed = 0;  // Map edilemeyen durumlar
  let statusSame = 0;       // Durum aynı olan siparişler
  let statusMissing = 0;    // API'den durum gelmeyen siparişler

  // Get default warehouse for the company
  const defaultWarehouse = await warehouseRepository.findDefaultByCompany(integration.companyId);
  
  if (!defaultWarehouse) {
    logger.error(`[${integration.type}] Varsayılan depo bulunamadı! Şirket ID: ${integration.companyId}`);
    throw new Error(`Varsayılan depo bulunamadı. Lütfen şirket için varsayılan bir depo oluşturun.`);
  }
  
  logger.info(`[${integration.type}] Varsayılan depo: ${defaultWarehouse.name} (${defaultWarehouse.code})`);

  for (const orderData of orders) {
    try {
      // Check if order already exists
      const existingOrder = await prisma.order.findFirst({
        where: {
          companyId: integration.companyId,
          marketplaceOrderId: orderData.marketplaceOrderId,
        },
      });

      if (existingOrder) {
        // ✅ ÇÖPE TAŞINMIŞ SİPARİŞLER: WooCommerce'te trash durumundaki siparişleri sil
        if (orderData.status === 'trash') {
          logger.info(`[${integration.type}] 🗑️ Sipariş çöpe taşınmış (WooCommerce), siliniyor: ${existingOrder.orderNumber}`, {
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            marketplaceOrderId: orderData.marketplaceOrderId,
          });
          
          // ✅ TOPLAMA DALGASI KONTROLÜ: Siparişin bağlı olduğu dalgayı kaydet
          const pickingWaveId = existingOrder.pickingWaveId;
          
          // Siparişi sil (cascade delete ile order items ve order sources da silinir)
          await prisma.order.delete({
            where: { id: existingOrder.id },
          });
          
          logger.info(`[${integration.type}] ✅ Sipariş silindi: ${existingOrder.orderNumber}`);
          
          // ✅ DALGA GÜNCELLEMESİ: Eğer sipariş bir dalgaya bağlıysa, dalgayı kontrol et
          if (pickingWaveId) {
            try {
              const wave = await prisma.pickingWave.findUnique({
                where: { id: pickingWaveId },
                include: {
                  orders: true,
                },
              });
              
              if (wave) {
                // Dalgadaki kalan sipariş sayısını kontrol et (silinen sipariş hariç)
                const remainingOrders = wave.orders.filter(o => o.id !== existingOrder.id);
                
                // Aktif siparişleri filtrele (SHIPPED, DELIVERED, CANCELLED hariç)
                const activeOrders = remainingOrders.filter(o => 
                  o.status !== 'SHIPPED' && 
                  o.status !== 'DELIVERED' && 
                  o.status !== 'CANCELLED'
                );
                
                if (activeOrders.length === 0) {
                  // Dalgada aktif sipariş yok - dalgayı iptal et veya sil
                  if (wave.status === 'CREATED' || wave.status === 'PENDING') {
                    // Henüz başlamamış dalga - sil
                    await prisma.pickingWave.delete({
                      where: { id: pickingWaveId },
                    });
                    logger.info(`[${integration.type}] ✅ Boş dalga silindi: ${wave.code}`, {
                      waveId: pickingWaveId,
                      waveCode: wave.code,
                      reason: 'Dalgada aktif sipariş kalmadı',
                    });
                  } else if (wave.status === 'IN_PROGRESS' || wave.status === 'PICKING' || wave.status === 'PACKING') {
                    // Devam eden dalga - iptal et
                    await prisma.pickingWave.update({
                      where: { id: pickingWaveId },
                      data: {
                        status: 'CANCELLED',
                        closedAt: new Date(),
                      },
                    });
                    logger.info(`[${integration.type}] ✅ Devam eden dalga iptal edildi: ${wave.code}`, {
                      waveId: pickingWaveId,
                      waveCode: wave.code,
                      reason: 'Dalgada aktif sipariş kalmadı',
                    });
                  }
                } else {
                  // Dalgada hala aktif siparişler var - sadece totalOrders sayısını güncelle
                  await prisma.pickingWave.update({
                    where: { id: pickingWaveId },
                    data: {
                      totalOrders: activeOrders.length,
                    },
                  });
                  logger.info(`[${integration.type}] ✅ Dalga güncellendi: ${wave.code}`, {
                    waveId: pickingWaveId,
                    waveCode: wave.code,
                    remainingActiveOrders: activeOrders.length,
                    totalRemainingOrders: remainingOrders.length,
                  });
                }
              }
            } catch (waveError: any) {
              logger.warn(`[${integration.type}] ⚠️ Dalga güncelleme hatası: ${waveError.message}`, {
                waveId: pickingWaveId,
                orderId: existingOrder.id,
                error: waveError?.message || String(waveError),
              });
              // Hata olsa bile sipariş silme işlemi devam etsin
            }
          }
          
          continue;
        }
        
        // ✅ API ÖNCELİKLİ: API'den gelen durum her zaman kabul edilir
        if (orderData.status) {
          const newStatus = mapMarketplaceStatusToOrderStatus(orderData.status, integration.type);
          const currentStatus = existingOrder.status;
          
          // ✅ SORUN TESPİTİ: Durum mapping sonucunu detaylı logla
          logger.info(`[${integration.type}] Durum kontrolü: ${existingOrder.orderNumber}`, {
            marketplaceOrderId: orderData.marketplaceOrderId,
            apiStatus: orderData.status,
            marketplaceType: integration.type,
            mappedStatus: newStatus || 'MAP_EDİLEMEDİ',
            currentStatus: currentStatus,
            willUpdate: newStatus && newStatus !== currentStatus,
            statusChanged: newStatus !== currentStatus,
            statusMapping: `${orderData.status} (${integration.type}) -> ${newStatus || 'MAP_EDİLEMEDİ'}`,
          });
          
          // ✅ DEBUG: Eğer durum map edilemediyse detaylı log
          if (!newStatus) {
            logger.warn(`[${integration.type}] ⚠️ Durum map edilemedi: ${existingOrder.orderNumber}`, {
              apiStatus: orderData.status,
              marketplaceType: integration.type,
              currentStatus: currentStatus,
              reason: 'mapMarketplaceStatusToOrderStatus fonksiyonu bu durumu tanımıyor veya null döndü',
            });
          }
          
          // ✅ API ÖNCELİKLİ: API'den geçerli bir durum geldiyse her zaman güncelle (durum farklıysa)
          if (newStatus) {
            if (newStatus !== currentStatus) {
              logger.info(`[${integration.type}] ✅ Sipariş durumu güncellenecek (API öncelikli): ${existingOrder.orderNumber}`, {
                oldStatus: currentStatus,
                newStatus: newStatus,
                marketplaceStatus: orderData.status,
                reason: 'API\'den gelen durum mevcut durumdan farklı',
              });
              
              // Handle stock movements based on status changes
              const wasProcessing = isProcessingStatus(currentStatus);
              const isNowProcessing = isProcessingStatus(newStatus);
              const wasCancelledOrRefunded = isCancelledOrRefundedStatus(currentStatus);
              const isNowCancelledOrRefunded = isCancelledOrRefundedStatus(newStatus);

              // Scenario 1: Status changed to processing - deduct stock
              if (isNowProcessing && !wasProcessing) {
                logger.info(`[${integration.type}] Durum 'hazırlanıyor'a geçti, stok düşüşü yapılıyor: ${existingOrder.orderNumber} (${currentStatus} -> ${newStatus})`);
                await deductOrderStock(existingOrder, integration, defaultWarehouse);
              }
              
              // Scenario 2: Status changed from processing to cancelled/refunded - restore stock
              if (wasProcessing && isNowCancelledOrRefunded) {
                logger.info(`[${integration.type}] Durum 'iptal/iade'ye geçti, stok geri ekleniyor: ${existingOrder.orderNumber} (${currentStatus} -> ${newStatus})`);
                await handleOrderCancellation(existingOrder, integration, defaultWarehouse);
              }
              
              // Scenario 3: Status changed from cancelled/refunded to processing - deduct stock
              if (wasCancelledOrRefunded && isNowProcessing) {
                logger.info(`[${integration.type}] Durum 'iptal/iade'den 'hazırlanıyor'a geçti, stok düşüşü yapılıyor: ${existingOrder.orderNumber} (${currentStatus} -> ${newStatus})`);
                await deductOrderStock(existingOrder, integration, defaultWarehouse);
              }
              
              // ✅ API'den gelen durum her zaman uygulanır
              await prisma.order.update({
                where: { id: existingOrder.id },
                data: { 
                  status: newStatus,
                  updatedAt: new Date(),
                },
              });
              
              statusUpdated++;
              logger.info(`[${integration.type}] ✅ Sipariş durumu güncellendi: ${existingOrder.orderNumber} (${currentStatus} -> ${newStatus})`);
            } else {
              // Durum aynı - güncelleme gerekmez ama log'la
              statusSame++;
              logger.debug(`[${integration.type}] ℹ️ Durum aynı - güncelleme yok: ${existingOrder.orderNumber}`, {
                status: currentStatus,
                apiStatus: orderData.status,
              });
            }
          } else {
            // ✅ SORUN TESPİTİ: Durum map edilemedi
            statusMapFailed++;
            logger.warn(`[${integration.type}] ⚠️ SORUN: Durum map edilemedi - ${existingOrder.orderNumber}`, {
              apiStatus: orderData.status,
              currentStatus: currentStatus,
              reason: 'mapMarketplaceStatusToOrderStatus fonksiyonu bu durumu tanımıyor',
              action: 'mapMarketplaceStatusToOrderStatus fonksiyonuna bu durum eklenmeli',
            });
          }
        } else {
          // ✅ SORUN TESPİTİ: API'den durum gelmedi
          statusMissing++;
          logger.warn(`[${integration.type}] ⚠️ SORUN: API'den durum bilgisi gelmedi - ${existingOrder.orderNumber}`, {
            orderNumber: existingOrder.orderNumber,
            currentStatus: existingOrder.status,
            orderDataKeys: Object.keys(orderData),
            reason: 'orderData.status undefined veya null',
          });
        }
        continue;
      }

      logger.info(`[${integration.type}] Yeni sipariş işleniyor: ${orderData.orderNumber} (${orderData.marketplaceOrderId})`, {
        itemsCount: orderData.items?.length || 0,
        hasItems: !!orderData.items && orderData.items.length > 0,
      });

      // ✅ ÇÖPE TAŞINMIŞ SİPARİŞLER: Yeni sipariş oluşturulurken trash durumundaki siparişleri atla
      if (orderData.status === 'trash') {
        logger.info(`[${integration.type}] ⏭️ Yeni sipariş çöpe taşınmış (WooCommerce), atlanıyor: ${orderData.orderNumber}`, {
          orderNumber: orderData.orderNumber,
          marketplaceOrderId: orderData.marketplaceOrderId,
        });
        continue;
      }

      // Check if order has items
      if (!orderData.items || orderData.items.length === 0) {
        logger.warn(`[${integration.type}] Sipariş ${orderData.orderNumber} için item yok - sipariş atlanıyor`);
        failed++;
        continue;
      }

      // Map order items to products using ProductResolverService
      // ✅ ARCHITECTURAL CHANGE: ProductResolverService is SINGLE SOURCE OF TRUTH
      // Products are NEVER created during order sync - only resolved
      const { productResolverService } = await import('../services/product-resolver.service.js');
      const { stockRepository } = await import('../repositories/stock.repository.js');
      
      const orderItems: any[] = [];
      let hasUnresolvedItems = false;
      let hasErrors = false;

      for (const item of orderData.items) {
        try {
          // Check if SKU matches a CampaignSet (for metadata only, NOT for bypassing resolver)
          const campaignSet = await prisma.campaignSet.findFirst({
            where: {
              companyId: integration.companyId,
              sku: item.sku,
              isActive: true,
            },
          });

          // ✅ Use ProductResolverService.resolve() - SINGLE SOURCE OF TRUTH
          // CampaignSet may provide metadata, but identity resolution MUST go through resolver
          
          let resolverResult;
          
          // SKU-FIRST MATCHING: If barcode is missing, try SKU match first (for all marketplaces)
          if ((!item.barcode || item.barcode.trim() === '') && item.sku) {
            try {
              const productBySku = await productRepository.findBySkuCaseInsensitive(
                integration.companyId,
                item.sku.trim()
              );
              
              if (productBySku) {
                // Direct SKU match found - create resolver result manually
                resolverResult = {
                  status: 'RESOLVED' as const,
                  product: {
                    id: productBySku.id,
                    sku: productBySku.sku,
                    barcode: productBySku.barcode,
                    name: productBySku.name,
                    companyId: productBySku.companyId,
                  },
                  resolutionType: 'SKU_CASE_INSENSITIVE' as const,
                  warnings: [],
                  errors: [],
                  metadata: {
                    matchedProductId: productBySku.id,
                    resolutionTime: 0,
                    queriesExecuted: 1,
                  },
                };
                
                logger.debug(`[${integration.type}] Product matched by SKU (barcode missing): SKU=${item.sku}`, {
                  productId: productBySku.id,
                  productSku: productBySku.sku,
                });
              } else {
                // SKU not found - continue with normal resolver
                resolverResult = await productResolverService.resolve({
                  companyId: integration.companyId,
                  barcode: item.barcode || null,
                  sku: item.sku || null,
                  name: item.name || (campaignSet ? campaignSet.name : null),
                  source: 'ORDER_IMPORT',
                  campaignSetId: campaignSet?.id || null,
                  options: {
                    allowCreate: false, // STRICT: Orders must NEVER create products
                    strictBarcode: true,
                    validateUniqueness: true,
                  },
                });
              }
            } catch (skuMatchError) {
              // If SKU match fails, fall back to normal resolver
              logger.warn(`[${integration.type}] SKU match failed, using resolver: ${item.sku}`, {
                error: skuMatchError instanceof Error ? skuMatchError.message : String(skuMatchError),
              });
              resolverResult = await productResolverService.resolve({
                companyId: integration.companyId,
                barcode: item.barcode || null,
                sku: item.sku || null,
                name: item.name || (campaignSet ? campaignSet.name : null),
                source: 'ORDER_IMPORT',
                campaignSetId: campaignSet?.id || null,
                options: {
                  allowCreate: false, // STRICT: Orders must NEVER create products
                  strictBarcode: true,
                  validateUniqueness: true,
                },
              });
            }
          } else {
            // Normal flow when barcode exists
            resolverResult = await productResolverService.resolve({
              companyId: integration.companyId,
              barcode: item.barcode || null,
              sku: item.sku || null,
              name: item.name || (campaignSet ? campaignSet.name : null),
              source: 'ORDER_IMPORT',
              campaignSetId: campaignSet?.id || null,
              options: {
                allowCreate: false, // STRICT: Orders must NEVER create products
                strictBarcode: true,
                validateUniqueness: true,
              },
            });
          }

          // Handle resolver result
          if (resolverResult.status === 'RESOLVED' && resolverResult.product) {
            // CASE A: Product resolved successfully
            const product = resolverResult.product;

            logger.debug(`[${integration.type}] Product resolved: SKU=${item.sku}, Method=${resolverResult.resolutionType}`, {
              productId: product.id,
              barcode: product.barcode,
              resolutionType: resolverResult.resolutionType,
            });

            // Log warnings if any
            if (resolverResult.warnings.length > 0) {
              logger.warn(`[${integration.type}] Product resolution warnings for SKU=${item.sku}`, {
                warnings: resolverResult.warnings,
              });
            }

            // ✅ Ensure stock record exists (auto-create if missing)
            // Only for resolved products
            if (defaultWarehouse?.id && product.id) {
              await stockRepository.findOrCreateStock(
                product.id,
                defaultWarehouse.id,
                undefined // variantId - not used for order items currently
              );
            }

            // Use product's barcode if item doesn't have one
            const barcode = item.barcode || product.barcode || null;

            // Fetch full product to get taxRate (resolver only returns basic fields)
            const fullProduct = await productRepository.findById(product.id);
            const productTaxRate = fullProduct ? Number(fullProduct.taxRate) : 20;

            orderItems.push({
              productId: product.id,
              sku: product.sku,
              barcode: barcode || null,
              name: product.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate || productTaxRate,
              discount: 0,
              total: item.unitPrice * item.quantity,
            });

            // ✅ NOTE: MarketplaceProduct link creation moved to transaction (line ~1140)
            // ✅ NOTE: CampaignSet linking moved to transaction (line ~1170)

          } else if (resolverResult.status === 'UNRESOLVED') {
            // CASE B: Product could not be resolved (creation not allowed)
            hasUnresolvedItems = true;

            logger.info(`[${integration.type}] Product unresolved: SKU=${item.sku}, Barcode=${item.barcode || 'N/A'}`, {
              warnings: resolverResult.warnings,
            });

            // Preserve unresolved product identifiers
            orderItems.push({
              productId: null, // NULL indicates unresolved product
              sku: item.sku,
              barcode: item.barcode || null,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate || 20,
              discount: 0,
              total: item.unitPrice * item.quantity,
              // Note: unresolvedSku, unresolvedBarcode, unresolvedName are preserved in sku, barcode, name fields
            });

          } else if (resolverResult.status === 'DUPLICATE_BARCODE' || resolverResult.status === 'DUPLICATE_SKU' || resolverResult.status === 'ERROR') {
            // CASE C: Data integrity error or system error
            hasErrors = true;
            hasUnresolvedItems = true; // Treat as unresolved for order processing

            logger.error(`[${integration.type}] Product resolution error: SKU=${item.sku}`, {
              status: resolverResult.status,
              errors: resolverResult.errors,
              warnings: resolverResult.warnings,
              duplicateBarcodeProducts: resolverResult.metadata.duplicateBarcodeProducts,
              duplicateSkuProducts: resolverResult.metadata.duplicateSkuProducts,
            });

            // Skip stock operations, but save order item for manual resolution
            orderItems.push({
              productId: null, // NULL indicates unresolved product
              sku: item.sku,
              barcode: item.barcode || null,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate || 20,
              discount: 0,
              total: item.unitPrice * item.quantity,
            });

          } else {
            // Unexpected status
            logger.error(`[${integration.type}] Unexpected resolver status: ${resolverResult.status}`, {
              sku: item.sku,
              barcode: item.barcode,
            });

            hasUnresolvedItems = true;
            orderItems.push({
              productId: null,
              sku: item.sku,
              barcode: item.barcode || null,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate || 20,
              discount: 0,
              total: item.unitPrice * item.quantity,
            });
          }

        } catch (error: any) {
          // Unexpected error during resolution
          logger.error(`[${integration.type}] Unexpected error during product resolution: SKU=${item.sku}`, {
            error: error?.message || String(error),
            stack: error?.stack,
            barcode: item.barcode,
          });
          
          hasUnresolvedItems = true;
          // Continue with order creation even if product resolution fails (productId will be null)
          orderItems.push({
            productId: null,
            sku: item.sku,
            barcode: item.barcode || null,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate || 20,
            discount: 0,
            total: item.unitPrice * item.quantity,
          });
        }
      }

      // ✅ İPTAL EDİLMİŞ SİPARİŞLERİ FİLTRELE: İptal edilmiş siparişler yeni olarak oluşturulmamalı
      const mappedStatus = mapMarketplaceStatusToOrderStatus(orderData.status, integration.type);
      if (mappedStatus && isCancelledOrRefundedStatus(mappedStatus)) {
        logger.info(`[${integration.type}] ⏭️ İptal edilmiş sipariş atlandı (yeni sipariş oluşturulmayacak): ${orderData.orderNumber}`, {
          marketplaceOrderId: orderData.marketplaceOrderId,
          apiStatus: orderData.status,
          mappedStatus: mappedStatus,
          reason: 'İptal edilmiş siparişler yeni olarak oluşturulmaz, sadece mevcut siparişlerin durumu güncellenir',
        });
        // İptal edilmiş siparişleri atla - yeni sipariş oluşturma
        continue;
      }

      // Log if no items found after processing
      if (orderItems.length === 0) {
        logger.warn(`[${integration.type}] Sipariş ${orderData.orderNumber} için hiç item işlenemedi`, {
          originalItemsCount: orderData.items?.length || 0,
          marketplaceOrderId: orderData.marketplaceOrderId,
        });
        // Skip this order if no items - cannot create order without items
        failed++;
        logger.error(`[${integration.type}] Sipariş atlandı: Hiç item işlenemedi - ${orderData.marketplaceOrderId}`);
        continue;
      }

      // Create order
      logger.debug(`[${integration.type}] Sipariş transaction başlatılıyor: ${orderData.orderNumber}`, {
        itemsCount: orderItems.length,
        warehouseId: defaultWarehouse.id,
        hasUnresolvedItems,
        hasErrors,
      });
      
      // Determine order status based on resolution results
      // If any items are unresolved, order status should be NEW (yeni sipariş, henüz işlenemez)
      // Note: PENDING_RESOLUTION enum value will be added in future schema migration
      // For now, using NEW for unresolved items (yeni sipariş, çözülmesi gereken ürünler var)
      // mappedStatus zaten yukarıda hesaplandı
      const orderStatus = hasUnresolvedItems ? 'NEW' : (mappedStatus || 'NEW');
      
      // ✅ DEBUG: Yeni sipariş durumunu logla
      logger.info(`[${integration.type}] Yeni sipariş durumu belirleniyor: ${orderData.orderNumber}`, {
        marketplaceOrderId: orderData.marketplaceOrderId,
        apiStatus: orderData.status,
        marketplaceType: integration.type,
        mappedStatus: mappedStatus || 'MAP_EDİLEMEDİ',
        hasUnresolvedItems,
        finalStatus: orderStatus,
        statusMapping: `${orderData.status} (${integration.type}) -> ${mappedStatus || 'MAP_EDİLEMEDİ'} -> ${orderStatus}`,
      });
      
      if (hasUnresolvedItems) {
        logger.warn(`[${integration.type}] Order has unresolved products: ${orderData.orderNumber}`, {
          unresolvedCount: orderItems.filter(item => !item.productId).length,
          totalItems: orderItems.length,
        });
      }
      
      // ✅ DEBUG: Eğer durum map edilemediyse uyarı ver
      if (!mappedStatus && !hasUnresolvedItems) {
        logger.warn(`[${integration.type}] ⚠️ Yeni sipariş için durum map edilemedi: ${orderData.orderNumber}`, {
          apiStatus: orderData.status,
          marketplaceType: integration.type,
          reason: 'mapMarketplaceStatusToOrderStatus fonksiyonu bu durumu tanımıyor',
          fallbackStatus: 'NEW',
        });
      }
      
      let createdOrderId: string | undefined;
      let ingestionId: string | undefined;
      const marketplace = integration.type as MarketplaceType;
      const externalOrderId = orderData.marketplaceOrderId;
      
      if (!externalOrderId) {
        throw new Error(`External order ID is required for idempotency check: ${orderData.orderNumber}`);
      }
      
      try {
        const orderResult = await prisma.$transaction(async (tx) => {
        // ✅ IDEMPOTENCY LAYER: Check OrderIngestion INSIDE transaction
        
        if (!externalOrderId) {
          throw new Error(`External order ID is required for idempotency check: ${orderData.orderNumber}`);
        }

        // STEP 1: Check for COMPLETED OrderIngestion (idempotent replay)
        const completedIngestion = await tx.orderIngestion.findUnique({
          where: {
            companyId_marketplace_externalOrderId_status: {
              companyId: integration.companyId,
              marketplace,
              externalOrderId,
              status: OrderIngestionStatus.COMPLETED,
            },
          },
        });

        if (completedIngestion && completedIngestion.internalOrderId) {
          logger.info(`[${integration.type}] ✅ Idempotent replay: Sipariş zaten işlenmiş: ${orderData.orderNumber}`, {
            marketplaceOrderId: externalOrderId,
            internalOrderId: completedIngestion.internalOrderId,
            completedAt: completedIngestion.completedAt,
          });
          
          // Return existing order (idempotent replay)
          const existingOrder = await tx.order.findUnique({
            where: { id: completedIngestion.internalOrderId },
            include: { items: true },
          });
          
          if (existingOrder) {
            return existingOrder;
          } else {
            // Order was deleted but ingestion record exists - this is a data inconsistency
            logger.error(`[${integration.type}] ⚠️ Data inconsistency: OrderIngestion points to non-existent order`, {
              ingestionId: completedIngestion.id,
              internalOrderId: completedIngestion.internalOrderId,
            });
            throw new Error(`Order ${completedIngestion.internalOrderId} not found but ingestion record exists`);
          }
        }

        // STEP 2: Check for PROCESSING OrderIngestion (concurrent request)
        const processingIngestion = await tx.orderIngestion.findUnique({
          where: {
            companyId_marketplace_externalOrderId_status: {
              companyId: integration.companyId,
              marketplace,
              externalOrderId,
              status: OrderIngestionStatus.PROCESSING,
            },
          },
        });

        if (processingIngestion) {
          logger.warn(`[${integration.type}] ⚠️ Concurrent request detected: Sipariş başka bir worker tarafından işleniyor: ${orderData.orderNumber}`, {
            marketplaceOrderId: externalOrderId,
            ingestionId: processingIngestion.id,
            attempt: processingIngestion.attempt,
            createdAt: processingIngestion.createdAt,
          });
          throw new Error(`Order ingestion already in progress for ${externalOrderId}. Please retry later.`);
        }

        // STEP 3: Calculate attempt number (for retries after FAILED)
        const maxAttempt = await tx.orderIngestion.findFirst({
          where: {
            companyId: integration.companyId,
            marketplace,
            externalOrderId,
          },
          orderBy: {
            attempt: 'desc',
          },
          select: {
            attempt: true,
          },
        });

        const attempt = (maxAttempt?.attempt || 0) + 1;

        // STEP 4: Create OrderIngestion record (status = PROCESSING)
        const ingestion = await tx.orderIngestion.create({
          data: {
            companyId: integration.companyId,
            marketplace,
            externalOrderId,
            status: OrderIngestionStatus.PROCESSING,
            attempt,
          },
        });

        ingestionId = ingestion.id; // Store for error handling

        logger.info(`[${integration.type}] 🔄 OrderIngestion oluşturuldu (PROCESSING): ${orderData.orderNumber}`, {
          ingestionId: ingestion.id,
          attempt,
          marketplaceOrderId: externalOrderId,
        });

        // STEP 5: Create Order (with all items)
        const order = await tx.order.create({
          data: {
            orderNumber: orderData.orderNumber || generateOrderNumber(), // Use WooCommerce order number if available
            marketplaceOrderId: orderData.marketplaceOrderId,
            status: orderStatus,
            customerName: orderData.customerName,
            customerEmail: orderData.customerEmail,
            customerPhone: orderData.customerPhone,
            shippingAddress: orderData.shippingAddress,
            shippingCity: orderData.shippingCity,
            shippingDistrict: orderData.shippingDistrict,
            shippingPostalCode: orderData.shippingPostalCode,
            subtotal: orderData.subtotal,
            taxAmount: orderData.taxAmount,
            shippingCost: orderData.shippingCost,
            discount: orderData.discount,
            total: orderData.total,
            customerNote: orderData.customerNote,
            // Navlungo metadata (read-only from WooCommerce) - backward compatibility
            externalTrackingNumber: orderData.externalTrackingNumber || null,
            externalShipmentId: orderData.externalShipmentId || null,
            shippingProvider: orderData.shippingProvider || null,
            integrationId: integration.id,
            warehouseId: defaultWarehouse?.id,
            companyId: integration.companyId,
            // Use marketplace order creation date instead of sync date
            createdAt: orderData.createdAt || new Date(),
            items: {
              create: orderItems.map(item => {
                const itemData: any = {
                  sku: item.sku,
                  name: item.name,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  taxRate: item.taxRate,
                  discount: item.discount || 0,
                  total: item.total,
                };
                
                // Use product connect if productId exists, otherwise omit (Prisma will set to null)
                if (item.productId) {
                  itemData.product = {
                    connect: { id: item.productId }
                  };
                }
                // ✅ FIX: Don't set productId: null - Prisma doesn't allow this in nested create
                // If productId is null, simply omit the field and Prisma will handle it
                
                // Add variant if exists
                if (item.variantId) {
                  itemData.variant = {
                    connect: { id: item.variantId }
                  };
                }
                
                return itemData;
              }),
            },
          },
          include: {
            items: true, // Include items to verify they were created
          },
        });

        // Create or update OrderSource record
        await tx.orderSource.upsert({
          where: {
            orderId_integrationId: {
              orderId: order.id,
              integrationId: integration.id,
            },
          },
          update: {
            externalStatus: orderData.marketplaceOrderId ? 'pending' : null, // WooCommerce status could be extracted if available
            shippingProvider: orderData.shippingProvider || null,
            shippingBarcode: orderData.shippingBarcode || null,
            shippingTrackingUrl: orderData.shippingTrackingUrl || null,
            lastSyncAt: new Date(),
          },
          create: {
            orderId: order.id,
            integrationId: integration.id,
            externalOrderId: orderData.marketplaceOrderId,
            externalStatus: 'pending', // Default status, could be extracted from orderData if available
            shippingProvider: orderData.shippingProvider || null,
            shippingBarcode: orderData.shippingBarcode || null,
            shippingTrackingUrl: orderData.shippingTrackingUrl || null,
            lastSyncAt: new Date(),
          },
        });

        // ✅ Create MarketplaceProduct links for resolved products (inside transaction)
        // This ensures links are created atomically with order creation
        for (let i = 0; i < orderItems.length; i++) {
          const item = orderItems[i];
          const createdItem = order.items[i];
          
          if (!item.productId || !createdItem) continue;

          try {
            // Try to get marketplace product ID from ProductSource first
            const productSource = await tx.productSource.findFirst({
              where: {
                productId: item.productId,
                integrationId: integration.id,
              },
              select: {
                externalProductId: true,
              },
            });

            // Use externalProductId from ProductSource, or fallback to SKU
            const marketplaceId = productSource?.externalProductId || item.sku;

            // Create or update MarketplaceProduct link
            await tx.marketplaceProduct.upsert({
              where: {
                integrationId_marketplaceId: {
                  integrationId: integration.id,
                  marketplaceId: marketplaceId,
                },
              },
              create: {
                productId: item.productId,
                integrationId: integration.id,
                marketplaceId: marketplaceId,
                isActive: productSource ? true : false, // Active if ProductSource exists, inactive if using SKU (needs validation)
                price: item.unitPrice || null,
              },
              update: {
                productId: item.productId,
                isActive: productSource ? true : false, // Update active status
                price: item.unitPrice || null,
              },
            });
          } catch (linkError) {
            // Non-critical error - log but don't fail transaction
            logger.warn(`[${integration.type}] Failed to create MarketplaceProduct link in transaction`, {
              error: linkError instanceof Error ? linkError.message : String(linkError),
              productId: item.productId,
              integrationId: integration.id,
              sku: item.sku,
            });
          }
        }

        // ✅ Link products to CampaignSet (inside transaction for safety)
        // Process CampaignSet linking for resolved products
        for (const item of orderItems) {
          if (!item.productId) continue;

          // Check if this product should be linked to a CampaignSet
          // (This was determined earlier during product resolution)
          const campaignSet = await prisma.campaignSet.findFirst({
            where: {
              companyId: integration.companyId,
              sku: item.sku,
              isActive: true,
            },
          });

          if (campaignSet) {
            try {
              // Fetch full product to check current values
              const fullProduct = await tx.product.findUnique({
                where: { id: item.productId },
                select: {
                  name: true,
                  price: true,
                  campaignSetId: true,
                },
              });

              if (!fullProduct) continue;

              // Only update if not already linked
              if (!fullProduct.campaignSetId) {
                const updateData: any = {
                  campaignSetId: campaignSet.id,
                  type: 'SET',
                };
                
                // Only update name/price if product has default values
                if (fullProduct.name === 'Unnamed Product' && campaignSet.name) {
                  updateData.name = campaignSet.name;
                }
                if (Number(fullProduct.price) === 0 && campaignSet.price) {
                  updateData.price = campaignSet.price;
                }
                
                await tx.product.update({
                  where: { id: item.productId },
                  data: updateData,
                });
                
                logger.debug(`[${integration.type}] Product linked to CampaignSet in transaction: ${item.productId} -> ${campaignSet.id}`);
              }
            } catch (linkError) {
              // Non-critical error - log but don't fail transaction
              logger.warn(`[${integration.type}] Failed to link product to CampaignSet in transaction`, {
                error: linkError instanceof Error ? linkError.message : String(linkError),
                productId: item.productId,
                campaignSetId: campaignSet.id,
              });
            }
          }
        }

        // ✅ STOK DÜŞÜŞÜ KALDIRILDI: Stok düşüşü artık sipariş oluşturulduktan sonra durum kontrolü ile yapılıyor
        // Transaction içinde stok düşüşü yapılmıyor - sipariş oluşturulduktan sonra deductOrderStock() çağrılıyor
        // Sadece "hazırlanıyor" durumunda (PROCESSING, WC_PROCESSING, PAID) stok düşecek

        // STEP 7: Update OrderIngestion to COMPLETED
        await tx.orderIngestion.update({
          where: { id: ingestion.id },
          data: {
            status: OrderIngestionStatus.COMPLETED,
            internalOrderId: order.id,
            completedAt: new Date(),
          },
        });

        logger.info(`[${integration.type}] ✅ OrderIngestion tamamlandı (COMPLETED): ${orderData.orderNumber}`, {
          ingestionId: ingestion.id,
          internalOrderId: order.id,
          attempt,
        });
        
        createdOrderId = order.id;
        return order;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      } catch (transactionError: any) {
        // ✅ ERROR HANDLING: Mark OrderIngestion as FAILED if transaction fails
        if (ingestionId) {
          try {
            await prisma.orderIngestion.update({
              where: { id: ingestionId },
              data: {
                status: OrderIngestionStatus.FAILED,
                errorMessage: transactionError?.message || String(transactionError),
              },
            });
            logger.error(`[${integration.type}] ❌ OrderIngestion FAILED olarak işaretlendi: ${orderData.orderNumber}`, {
              ingestionId,
              error: transactionError?.message || String(transactionError),
              marketplaceOrderId: externalOrderId,
            });
          } catch (updateError) {
            // If we can't update, log but don't fail - transaction already rolled back
            logger.error(`[${integration.type}] ⚠️ OrderIngestion FAILED güncellenemedi: ${orderData.orderNumber}`, {
              ingestionId,
              updateError: updateError instanceof Error ? updateError.message : String(updateError),
              originalError: transactionError?.message || String(transactionError),
            });
          }
        }
        
        // Re-throw the original error
        throw transactionError;
      }

      // ✅ YENİ: Sipariş oluşturulduktan sonra durum kontrolü yap ve stok düşüşü yap
      // Sadece "hazırlanıyor" durumunda stok düş
      if (!createdOrderId) {
        logger.error(`[${integration.type}] Sipariş ID oluşturulamadı: ${orderData.orderNumber}`);
        throw new Error('Sipariş ID oluşturulamadı');
      }
      
      const createdOrder = await prisma.order.findUnique({
        where: { id: createdOrderId },
        include: {
          items: true,
        },
      });

      if (createdOrder && isProcessingStatus(createdOrder.status)) {
        logger.info(`[${integration.type}] Yeni sipariş 'hazırlanıyor' durumunda, stok düşüşü yapılıyor: ${orderData.orderNumber} (${createdOrder.status})`);
        await deductOrderStock(createdOrder, integration, defaultWarehouse);
      } else if (createdOrder) {
        logger.debug(`[${integration.type}] Yeni sipariş 'hazırlanıyor' durumunda değil, stok düşüşü yapılmıyor: ${orderData.orderNumber} (${createdOrder.status})`);
      }

      processed++;
      logger.info(`[${integration.type}] Sipariş başarıyla kaydedildi: ${orderData.orderNumber} (${orderData.marketplaceOrderId})`, {
        itemsCount: orderItems.length,
        total: orderData.total,
        status: createdOrder?.status,
        stockDeducted: createdOrder && isProcessingStatus(createdOrder.status),
      });

      // Anlık stok güncellemesi: Component stokları değiştiyse WooCommerce'e gönder
      // Bu sayede set siparişi geldiğinde component stokları hemen güncellenir
      try {
        await syncComponentStocksToMarketplace(integration, orderItems);
      } catch (syncError: any) {
        // Stok sync hatası sipariş işlemeyi etkilememeli
        logger.warn(`[${integration.type}] Anlık stok sync hatası (sipariş işlendi ama stok sync başarısız): ${syncError.message}`);
      }
    } catch (error: any) {
      failed++;
      logger.error(`[${integration.type}] Sipariş kayıt hatası: ${orderData.marketplaceOrderId}`, {
        error: error?.message || String(error),
        stack: error?.stack,
        orderNumber: orderData.orderNumber,
        marketplaceOrderId: orderData.marketplaceOrderId,
        itemsCount: orderData.items?.length || 0,
      });
    }
  }

  // Update last sync time
  await prisma.marketplaceIntegration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date() },
  });

  // ✅ DETAYLI ÖZET: Senkronizasyon sonuçları (sorun tespiti için)
  logger.info(`[${integration.type}] 📊 Senkronizasyon özeti (sorun tespiti)`, {
    totalOrders: orders.length,
    processed: processed,
    failed: failed,
    statusUpdated: statusUpdated,
    statusSame: statusSame,
    statusMapFailed: statusMapFailed,
    statusMissing: statusMissing,
    newOrders: orders.length - (statusUpdated + statusSame + statusMapFailed + statusMissing),
    summary: {
      güncellenen: statusUpdated,
      aynıKalan: statusSame,
      mapEdilemeyen: statusMapFailed,
      durumGelmeyen: statusMissing,
    },
  });

  // Create sync log
  const syncStatus = failed > 0 ? (processed > 0 || statusUpdated > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS';
  const syncMessage = [
    processed > 0 ? `${processed} yeni sipariş` : null,
    statusUpdated > 0 ? `${statusUpdated} durum güncellendi` : null,
    failed > 0 ? `${failed} hata` : null,
  ].filter(Boolean).join(', ') || 'Değişiklik yok';
  
  await prisma.syncLog.create({
    data: {
      type: 'ORDER_SYNC',
      marketplace: integration.type,
      status: syncStatus,
      message: syncMessage,
      recordsProcessed: processed + statusUpdated,
      recordsFailed: failed,
      companyId: integration.companyId,
      error: failed > 0 && processed === 0 && statusUpdated === 0 ? 'Hiç sipariş işlenemedi - detaylar için log\'ları kontrol edin' : null,
    },
  });

  logger.info(`[${integration.type}] Sipariş sync tamamlandı`, {
    status: syncStatus,
    totalOrders: orders.length,
    newOrders: processed,
    statusUpdates: statusUpdated,
    failed,
  });
  } catch (error: any) {
    logger.error(`[${integration.type}] Senkronizasyon hatası:`, error);
    throw error; // Re-throw to be caught by controller
  }
}

