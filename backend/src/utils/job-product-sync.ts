import { prisma } from '../config/index.js';
import { createMarketplaceIntegrationWithDecryption } from './integration-helper.js';
import { productRepository } from '../repositories/product.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { logger } from './logger.js';
import { MarketplaceType, StockLogType } from '@prisma/client';
import { runJobWithRetry, circuitBreaker } from './job-wrapper.js';
import { SyncMode, IntegrationSettings } from './integration-index.js';
import { ensureProductStockInWarehouse, createProductStock, updateProductStock } from './stock-helper.js';

/**
 * Marketplace'lerden ürünleri çeker ve sisteme kaydeder
 */
export async function syncProducts(): Promise<void> {
  logger.info('🔄 Ürün senkronizasyonu başladı...');

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
            jobName: 'PRODUCT_SYNC',
            integrationId: integration.id,
            companyId: integration.companyId,
            metadata: {
              marketplaceType: integration.type,
              companyName: integration.company?.name,
            },
          },
          () => syncIntegrationProducts(integration),
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
        
        logger.error(`[${integration.type}] Ürün sync hatası:`, error);
        // Error logging is handled by runJobWithRetry
      }
    }

    logger.info('✅ Ürün senkronizasyonu tamamlandı');
  } catch (error) {
    logger.error('❌ Ürün senkronizasyonu başarısız:', error);
  }
}

export async function syncIntegrationProducts(integration: any): Promise<void> {
  logger.info(`[${integration.type}] Ürün senkronizasyonu başlatılıyor...`);
  
  const settings = integration.settings as IntegrationSettings | undefined;
  const syncMode = settings?.syncMode || SyncMode.AUTO;
  const isReadOnly = settings?.readOnly === true;
  
  // Read-only kontrolü: Sadece okuma yapılır, değişiklik yapılmaz
  if (isReadOnly) {
    logger.info(`[${integration.type}] Read-only mod: Ürün senkronizasyonu atlandı (sadece okuma)`);
    return;
  }
  
  // MANUAL mod: Otomatik sync atlanır
  if (syncMode === SyncMode.MANUAL) {
    logger.info(`[${integration.type}] Manuel sync modu: Otomatik ürün sync atlandı`);
    return;
  }
  
  // MIDDLEWARE mod: Middleware üzerinden sync
  if (syncMode === SyncMode.MIDDLEWARE) {
    logger.info(`[${integration.type}] Middleware sync modu: Middleware üzerinden ürün sync`);
    
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
      const { createMiddleware } = await import('./integration-middleware.js');
      const safeConfig = {
        apiUrl: settings.middlewareConfig.apiUrl ?? '',
        apiKey: settings.middlewareConfig.apiKey ?? '',
        apiSecret: settings.middlewareConfig.apiSecret ?? '',
      };
      const middleware = createMiddleware(settings.middlewareType, safeConfig);
      const products = await middleware.syncProducts();
      
      logger.info(`[${integration.type}] Middleware'den ${products.length} ürün alındı`);
      // TODO: Process products from middleware (same as AUTO mode)
      logger.info(`[${integration.type}] Middleware ürün sync tamamlandı (işleme eklenecek)`);
      return;
    } catch (error: any) {
      logger.error(`[${integration.type}] Middleware ürün sync hatası:`, error);
      throw error;
    }
  }
  
  // AUTO mod: Normal API sync (mevcut kod)
  try {
    const marketplace = createMarketplaceIntegrationWithDecryption(
      integration.type as MarketplaceType,
      integration
    );

    logger.info(`[${integration.type}] Ürünler çekiliyor...`);
    const products = await marketplace.syncProducts();
    
    if (!products || products.length === 0) {
      logger.info(`[${integration.type}] Çekilecek ürün yok`);
      return;
    }
    
    logger.info(`[${integration.type}] ${products.length} ürün bulundu, işleniyor...`);

    // ✅ FIX: Separate parent products and variations to ensure parents are processed first
    const parentProducts = products.filter(p => !p.parentId);
    const variations = products.filter(p => p.parentId);
    
    logger.info(`[${integration.type}] Ürün dağılımı: ${parentProducts.length} ana ürün, ${variations.length} varyasyon`);

    let processed = 0;
    let failed = 0;
    let created = 0;
    let updated = 0;
    let stocksUpdated = 0;

    // Get default warehouse for stock updates - REQUIRED for marketplace syncs
    const defaultWarehouse = await warehouseRepository.findDefaultByCompany(integration.companyId);
    
    if (!defaultWarehouse) {
      logger.error(`[${integration.type}] Varsayılan depo bulunamadı! Marketplace stok senkronizasyonu için varsayılan depo zorunludur. Şirket ID: ${integration.companyId}`);
      // Skip this integration if no default warehouse - cannot sync stock without it
      return;
    }
    
    logger.info(`[${integration.type}] Varsayılan depo kullanılıyor: ${defaultWarehouse.name} (${defaultWarehouse.code})`);

    // ✅ FIX: Process parent products first
    for (const productData of parentProducts) {
      try {
        // ✅ DÜZELTME: Use unified product matcher
        const { matchMarketplaceProduct, upsertProductSource } = await import('./product-matcher.js');

        if (!productData.marketplaceId) {
          logger.warn(`[${integration.type}] Ürün marketplaceId yok, atlanıyor: ${productData.sku}`);
          continue;
        }

        // Use unified matcher with priority: marketplaceProductId > sku > barcode > gtin
        const matchResult = await matchMarketplaceProduct({
          marketplace: integration.type,
          marketplaceProductId: productData.marketplaceId,
          sku: productData.sku,
          barcode: productData.barcode,
          gtin: productData.gtin,
          companyId: integration.companyId,
          integrationId: integration.id,
        });

        let product = matchResult?.product || null;
        let productSource = matchResult?.productSource || null;

        // If product was matched, ensure ProductSource exists/updated
        if (product && matchResult) {
          if (!productSource) {
            // Create or update ProductSource
            productSource = await upsertProductSource(
              product.id,
              integration.id,
              String(productData.marketplaceId),
              productData.sku || null,
              productData.barcode || null,
              productData.price || null
            );
            logger.info(`[${integration.type}] ProductSource ${matchResult.matchMethod === 'marketplaceProductId' ? 'found' : 'created'} (${matchResult.matchMethod}): ${product.sku} -> ${integration.type} ID: ${productData.marketplaceId}`);
          } else {
            // Update existing ProductSource if needed
            if (productSource.externalProductId !== String(productData.marketplaceId) ||
                productSource.externalSku !== (productData.sku || null) ||
                productSource.externalBarcode !== (productData.barcode || null)) {
              productSource = await upsertProductSource(
                product.id,
                integration.id,
                String(productData.marketplaceId),
                productData.sku || null,
                productData.barcode || null,
                productData.price || null
              );
              logger.debug(`[${integration.type}] ProductSource updated: ${product.sku}`);
            }
          }
        }

        // IMPORTANT: If we found product by ProductSource but SKU is different,
        // this means WooCommerce SKU changed - update the product SKU, don't create duplicate
        if (product && productSource && product.sku !== productData.sku) {
          logger.info(`[${integration.type}] Ürün SKU değişikliği tespit edildi: ${product.sku} → ${productData.sku} (WooCommerce ID: ${productData.marketplaceId})`);
          // Update SKU to match WooCommerce
          await prisma.product.update({
            where: { id: product.id },
            data: { sku: productData.sku },
          });
        }

        // If product was found by SKU/barcode (fallback) but ProductSource doesn't exist, create it
        // This ensures future syncs will use WooCommerce ID as primary key
        if (product && !productSource && productData.marketplaceId) {
          logger.info(`[${integration.type}] ProductSource oluşturuluyor: Ürün ${product.sku} (WooCommerce ID: ${productData.marketplaceId})`);
          productSource = await prisma.productSource.create({
            data: {
              productId: product.id,
              integrationId: integration.id,
              externalProductId: String(productData.marketplaceId),
              externalSku: productData.sku || null,
              externalBarcode: productData.barcode || null,
              externalPrice: productData.price || null,
              lastSyncAt: new Date(),
            },
          });
        }

        // ✅ YENİ: Varyasyon kontrolü - eğer parentId varsa bu bir varyasyon
        if (productData.parentId) {
          // Bu bir varyasyon - ProductVariant olarak kaydet
          const parentProduct = await prisma.product.findFirst({
            where: {
              companyId: integration.companyId,
              wooCommerceId: parseInt(productData.parentId),
            },
          });

          if (!parentProduct) {
            logger.warn(`[${integration.type}] Parent ürün bulunamadı: ${productData.parentId}, varyasyon atlandı: ${productData.sku}`);
            failed++;
            continue;
          }

          // Varyasyonu oluştur veya güncelle
          const variant = await prisma.productVariant.upsert({
            where: {
              productId_sku: {
                productId: parentProduct.id,
                sku: productData.sku,
              },
            },
            create: {
              productId: parentProduct.id,
              sku: productData.sku,
              barcode: (productData.barcode && productData.barcode.trim() !== '') ? productData.barcode.trim() : null,
              name: productData.name,
              attributes: productData.attributes || [],
              price: productData.price,
              imageUrl: productData.imageUrl || null,
              isActive: true,
            },
            update: {
              name: productData.name,
              barcode: (productData.barcode && productData.barcode.trim() !== '') ? productData.barcode.trim() : null,
              attributes: productData.attributes || [],
              price: productData.price,
              imageUrl: productData.imageUrl || null,
            },
          });

          // Varyasyon stokunu güncelle
          if (productData.stock !== undefined && productData.stock !== null) {
            const marketplaceStockQty = Math.max(0, Math.floor(productData.stock));
            
            // Varyasyon için stok kaydını kontrol et
            let variantStock = await prisma.stock.findFirst({
              where: {
                productId: parentProduct.id,
                variantId: variant.id,
                warehouseId: defaultWarehouse.id,
              },
            });

            if (variantStock) {
              // Mevcut stok ile karşılaştır
              if (variantStock.quantity !== marketplaceStockQty) {
                await updateProductStock({
                  productId: parentProduct.id,
                  warehouseId: defaultWarehouse.id,
                  variantId: variant.id,
                  quantity: marketplaceStockQty,
                  note: `Marketplace sync: ${integration.type}`,
                });
                stocksUpdated++;
                logger.debug(`[${integration.type}] Varyasyon stok güncellendi: ${productData.sku} (${variantStock.quantity} → ${marketplaceStockQty})`);
              } else {
                logger.debug(`[${integration.type}] Varyasyon stok aynı - Ürün: ${productData.sku}, Stok: ${marketplaceStockQty} (güncelleme atlandı)`);
              }
            } else {
              // Yeni stok kaydı oluştur
              await createProductStock({
                productId: parentProduct.id,
                warehouseId: defaultWarehouse.id,
                variantId: variant.id,
                quantity: marketplaceStockQty,
                note: `Marketplace sync: ${integration.type}`,
              });
              stocksUpdated++;
              logger.debug(`[${integration.type}] Varyasyon stok oluşturuldu: ${productData.sku} (${marketplaceStockQty})`);
            }
          }

          // ProductSource oluştur/güncelle (varyasyon için)
          if (productData.marketplaceId) {
            await prisma.productSource.upsert({
              where: {
                productId_integrationId: {
                  productId: parentProduct.id,
                  integrationId: integration.id,
                },
              },
              create: {
                productId: parentProduct.id,
                integrationId: integration.id,
                externalProductId: String(productData.marketplaceId),
                externalSku: productData.sku || null,
                externalBarcode: productData.barcode || null,
                externalPrice: productData.price || null,
                lastSyncAt: new Date(),
              },
              update: {
                externalProductId: String(productData.marketplaceId),
                externalSku: productData.sku || null,
                externalBarcode: productData.barcode || null,
                externalPrice: productData.price || null,
                lastSyncAt: new Date(),
              },
            });
          }

          processed++;
          logger.debug(`[${integration.type}] Varyasyon işlendi: ${productData.sku} (Parent: ${parentProduct.sku})`);
          continue; // Varyasyon işlendi, ana ürün işleme atla
        }

        // Ensure barcode is never null - use empty string if not provided
        const barcodeValue = productData.barcode && productData.barcode.trim() !== '' 
          ? productData.barcode.trim() 
          : '';

        // ✅ DEBUG: Barkod bilgisini logla
        if (productData.barcode && productData.barcode.trim() !== '') {
          logger.info(`[${integration.type}] Ürün ${productData.sku} için barkod geldi: ${productData.barcode}`);
        } else {
          logger.warn(`[${integration.type}] Ürün ${productData.sku} için barkod GELMEDİ! (barcode: ${productData.barcode || 'undefined'})`);
        }
        
        // ✅ KRİTİK: GTIN bilgisini logla
        if (productData.gtin && productData.gtin.trim() !== '') {
          logger.info(`[${integration.type}] ✅ Ürün ${productData.sku} için GTIN geldi: "${productData.gtin}"`);
        } else {
          logger.warn(`[${integration.type}] ⚠️ Ürün ${productData.sku} için GTIN GELMEDİ! (gtin: ${productData.gtin || 'undefined'})`);
        }

        if (product) {
          // Note: ProductSyncData doesn't include updatedAt, so we skip this check
          // Products are always synced from WooCommerce
          
          // Check if any product data has changed
          const currentBarcode = (product.barcode || '').trim();
          const newBarcode = barcodeValue.trim();
          const currentPrice = Number(product.price || 0);
          const newPrice = Number(productData.price || 0);
          
          // ✅ DEBUG: Barkod karşılaştırması
          if (currentBarcode !== newBarcode) {
            logger.info(`[${integration.type}] Ürün ${product.sku} barkod değişikliği: "${currentBarcode}" → "${newBarcode}"`);
          }
          
          // ✅ KRİTİK: GTIN karşılaştırması - hem undefined hem de null durumlarını kontrol et
          const currentGtin = (product.gtin || '').trim();
          const newGtin = (productData.gtin || '').trim();
          const gtinChanged = currentGtin !== newGtin;
          
          // ✅ DEBUG: GTIN karşılaştırması
          if (gtinChanged) {
            logger.info(`[${integration.type}] 🔄 Ürün ${product.sku} GTIN değişikliği: "${currentGtin || '(yok)'}" → "${newGtin || '(yok)'}"`);
          }
          
          const hasChanges = 
            product.name !== productData.name ||
            currentPrice !== newPrice ||
            currentBarcode !== newBarcode ||
            gtinChanged ||
            (product.description || '') !== (productData.description || '') ||
            (product.imageUrl || '') !== (productData.imageUrl || '');

          // Check if SKU matches a CampaignSet and product is not already linked
          let campaignSetId = product.campaignSetId;
          let productType = product.type;
          if (!campaignSetId) {
            const campaignSet = await prisma.campaignSet.findFirst({
              where: {
                companyId: integration.companyId,
                sku: productData.sku,
                isActive: true,
              },
            });
            if (campaignSet) {
              campaignSetId = campaignSet.id;
              productType = 'SET';
              logger.info(`[${integration.type}] Mevcut ürün CampaignSet'e bağlanıyor: ${productData.sku} -> ${campaignSet.name}`);
            }
          }

          // Check if campaignSet link changed
          const campaignSetChanged = product.campaignSetId !== campaignSetId;

          if (hasChanges || campaignSetChanged) {
            // Log what changed for debugging
            const changes: string[] = [];
            if (product.name !== productData.name) changes.push(`isim: "${product.name}" → "${productData.name}"`);
            if (currentPrice !== newPrice) changes.push(`fiyat: ${currentPrice} → ${newPrice}`);
            if (currentBarcode !== newBarcode) changes.push(`barkod: "${currentBarcode}" → "${newBarcode}"`);
            if (gtinChanged) {
              changes.push(`GTIN: "${currentGtin || '(yok)'}" → "${newGtin || '(yok)'}"`);
              // ✅ DEBUG: GTIN değişikliğini özellikle logla
              logger.info(`[${integration.type}] 🔄 GTIN değişikliği tespit edildi: "${currentGtin || '(yok)'}" → "${newGtin || '(yok)'}" (SKU: ${product.sku})`);
            }
            if (campaignSetChanged) changes.push(`CampaignSet bağlantısı eklendi`);
            
            logger.info(`[${integration.type}] Ürün değişiklik tespit edildi: ${product.sku} - ${changes.join(', ')}`);
            
            // Update existing product
            // ✅ SAFE UPDATE: Never overwrite existing values with undefined/null
            // Only update gtin/barcode if a valid non-empty value exists
            const updateData: any = {
              name: productData.name,
              price: productData.price,
              description: productData.description || null,
              imageUrl: productData.imageUrl || null,
              campaignSetId: campaignSetId || null,
              type: productType,
            };

            // ✅ SAFE: Only update barcode if we have a valid value
            if (barcodeValue && barcodeValue.trim() !== '') {
              updateData.barcode = barcodeValue.trim();
              logger.debug(`[${integration.type}] 🔄 Barcode güncelleniyor: "${updateData.barcode}" (SKU: ${product.sku})`);
            } else if (barcodeValue === '') {
              // Empty string means explicitly cleared in WooCommerce
              updateData.barcode = null;
              logger.debug(`[${integration.type}] 🔄 Barcode temizleniyor (WooCommerce'te silinmiş) (SKU: ${product.sku})`);
            }
            // If barcodeValue is undefined/null, don't update (preserve existing value)

            // ✅ DÜZELTME: GTIN güncelleme mantığı
            // Eğer GTIN değişikliği tespit edildiyse, yeni değere göre güncelle veya temizle
            if (gtinChanged) {
              if (productData.gtin && productData.gtin.trim() !== '') {
                // Yeni GTIN değeri var - güncelle
                updateData.gtin = productData.gtin.trim();
                logger.debug(`[${integration.type}] 🔄 GTIN güncelleniyor: "${updateData.gtin}" (SKU: ${product.sku})`);
              } else {
                // GTIN WooCommerce'ten gelmiyorsa veya boşsa, temizle
                updateData.gtin = null;
                logger.debug(`[${integration.type}] 🔄 GTIN temizleniyor (WooCommerce'te yok/silinmiş) (SKU: ${product.sku})`);
              }
            } else {
              // GTIN değişikliği yoksa, sadece yeni değer varsa güncelle
              if (productData.gtin && productData.gtin.trim() !== '') {
                updateData.gtin = productData.gtin.trim();
                logger.debug(`[${integration.type}] 🔄 GTIN güncelleniyor: "${updateData.gtin}" (SKU: ${product.sku})`);
              }
              // undefined/null ise hiçbir şey yapma (mevcut değeri koru)
            }

            // ✅ 5️⃣ DEBUG: Prisma update payload'unu logla
            console.log(`[PRISMA UPDATE PAYLOAD] Product ID: ${product.id}, SKU: ${product.sku}`, JSON.stringify(updateData, null, 2));
            console.log(`[PRISMA UPDATE PAYLOAD DETAILS]`, {
              productId: product.id,
              sku: product.sku,
              currentGtin: product.gtin,
              currentBarcode: product.barcode,
              newGtin: updateData.gtin,
              newBarcode: updateData.barcode,
              productDataGtin: productData.gtin,
              productDataBarcode: productData.barcode,
              barcodeValue,
            });

            const updatedProduct = await prisma.product.update({
              where: { id: product.id },
              data: updateData,
            });
            
            // ✅ 5️⃣ DEBUG: Prisma update sonucunu logla
            console.log(`[PRISMA UPDATED RESULT] Product ID: ${updatedProduct.id}`, {
              id: updatedProduct.id,
              sku: updatedProduct.sku,
              gtin: updatedProduct.gtin,
              barcode: updatedProduct.barcode,
              gtinBefore: product.gtin,
              barcodeBefore: product.barcode,
            });
            updated++;
          } else {
            logger.debug(`[${integration.type}] Ürün değişiklik yok, atlandı: ${product.sku}`);
          }
        } else {
          // Create new product
          // Find or create a default category
          const defaultCategory = await prisma.category.findFirst({
            where: { companyId: integration.companyId },
          });

          // Check if SKU matches a CampaignSet - if so, link the product to it
          const campaignSet = await prisma.campaignSet.findFirst({
            where: {
              companyId: integration.companyId,
              sku: productData.sku,
              isActive: true,
            },
          });

          if (campaignSet) {
            logger.info(`[${integration.type}] CampaignSet ile eşleşen ürün oluşturuluyor: ${productData.sku} -> CampaignSet: ${campaignSet.name}`);
          }

          // ✅ DEBUG: GTIN değerini logla
          if (productData.gtin) {
            logger.info(`[${integration.type}] ✅ Yeni ürün oluşturuluyor - GTIN: "${productData.gtin}" (SKU: ${productData.sku})`);
          } else {
            logger.debug(`[${integration.type}] ⚠️ Yeni ürün oluşturuluyor - GTIN yok (SKU: ${productData.sku})`);
          }

          // ✅ SAFE CREATE: Only set gtin/barcode if valid values exist
          product = await prisma.product.create({
            data: {
              sku: productData.sku,
              name: productData.name,
              price: productData.price,
              costPrice: productData.price * 0.6, // Default cost price
              barcode: (barcodeValue && barcodeValue.trim() !== '') ? barcodeValue.trim() : null,
              gtin: (productData.gtin && productData.gtin.trim() !== '') ? productData.gtin.trim() : null,
              description: productData.description || null,
              imageUrl: productData.imageUrl || null,
              taxRate: 20, // Default tax rate
              categoryId: defaultCategory?.id,
              companyId: integration.companyId,
              // Link to CampaignSet if SKU matches
              campaignSetId: campaignSet?.id || null,
              type: campaignSet ? 'SET' : 'PRODUCT',
            },
          });
          
          if (campaignSet) {
            logger.info(`[${integration.type}] CampaignSet'e bağlı ürün oluşturuldu: ${productData.sku} (Product ID: ${product.id})`);
          }
          
          // ✅ YENİ: Varyasyonlu ürün ise stok güncelleme atla (varyasyonlarda stok var)
          if (isVariableProduct) {
            logger.info(`[${integration.type}] Varyasyonlu ana ürün oluşturuldu: ${productData.sku} (stok varyasyonlarda)`);
            created++;
            continue; // Varyasyonlu ürün için stok güncelleme yok
          }
          
          created++;
        }

        // Update stock - ALWAYS use default warehouse for marketplace syncs
        // This ensures all marketplace stock goes to MAIN warehouse only
        // ✅ YENİ: Varyasyonlu ürün kontrolü - ana ürünün stoku yok
        if (!productData.isVariable && productData.stock !== undefined && productData.stock !== null) {
          const marketplaceStockQty = Math.max(0, Math.floor(productData.stock));
          
          // ✅ Check if this product is a CampaignSet component
          // If so, skip stock update from marketplace (DepoPanel is master for component stocks)
          const isSetComponent = await prisma.campaignSetItem.findFirst({
            where: {
              productId: product.id,
              campaignSet: {
                companyId: integration.companyId,
                isActive: true,
              },
            },
          });
          
          if (isSetComponent) {
            // Skip stock update for components - DepoPanel manages these stocks
            // WooCommerce'den gelen stok değeri yok sayılır, DepoPanel'deki değer korunur
            logger.info(`[${integration.type}] ⏭️ Component stok güncelleme atlandı (DepoPanel master): ${product.sku}`);
          } else {
            // IMPORTANT: Only search for stock in the default warehouse
            // Marketplace stock should NEVER be synced to other warehouses
            let stock = await prisma.stock.findFirst({
              where: {
                productId: product.id,
                warehouseId: defaultWarehouse.id, // ALWAYS use default warehouse
                variantId: null,
              },
            });

            if (stock) {
              // Compare marketplace stock with system stock
              const systemStockQty = stock.quantity;
              
              // TRENDYOL: Max stock mantığı (en yüksek stok değerini kullan)
              if (integration.type === 'TRENDYOL') {
                const maxStock = Math.max(systemStockQty, marketplaceStockQty);
                
                if (stock.quantity !== maxStock) {
                  // Use stock helper to update stock with proper logging
                  await prisma.$transaction(async (tx) => {
                    await updateProductStock(tx, {
                      productId: product.id,
                      warehouseId: defaultWarehouse.id,
                      quantity: maxStock,
                      note: `Marketplace senkronizasyonu: ${integration.type} (Max stock: Sistem=${systemStockQty}, Marketplace=${marketplaceStockQty}, Final=${maxStock})`,
                    });
                  });
                  
                  logger.info(`[${integration.type}] Max stock uygulandı - Ürün: ${product.sku}, Sistem: ${systemStockQty}, Marketplace: ${marketplaceStockQty}, Final: ${maxStock}`);
                  stocksUpdated++;
                } else {
                  logger.debug(`[${integration.type}] Stok aynı (Max stock) - Ürün: ${product.sku}, Stok: ${maxStock} (güncelleme atlandı)`);
                }
              } else {
                // Diğer marketplace'ler için mevcut mantık (marketplace stoku üzerine yazar)
                // Only update if stocks are different
                if (systemStockQty !== marketplaceStockQty) {
                  logger.info(`[${integration.type}] Stok farkı tespit edildi - Ürün: ${product.sku}, Sistem: ${systemStockQty}, Marketplace: ${marketplaceStockQty}`);
                  
                  // Use stock helper to update stock with proper logging
                  await prisma.$transaction(async (tx) => {
                    await updateProductStock(tx, {
                      productId: product.id,
                      warehouseId: defaultWarehouse.id,
                      quantity: marketplaceStockQty,
                      note: `Marketplace senkronizasyonu: ${integration.type} (Marketplace'ten güncellendi)`,
                    });
                  });
                  stocksUpdated++;
                } else {
                  logger.debug(`[${integration.type}] Stok aynı - Ürün: ${product.sku}, Stok: ${systemStockQty} (güncelleme atlandı)`);
                }
              }
            } else {
              // Create new stock entry in DEFAULT warehouse only
              // Marketplace stock must always go to the default warehouse
              // Use stock helper to ensure proper logging
              await prisma.$transaction(async (tx) => {
                const result = await createProductStock(tx, {
                  productId: product.id,
                  warehouseId: defaultWarehouse.id,
                  quantity: marketplaceStockQty,
                  note: `Marketplace senkronizasyonu: ${integration.type}`,
                });
                if (result.log) {
                  stocksUpdated++;
                }
              });
            }
          }
        }

        // Link product to marketplace (legacy MarketplaceProduct table)
        if (productData.marketplaceId) {
          await prisma.marketplaceProduct.upsert({
            where: {
              integrationId_marketplaceId: {
                integrationId: integration.id,
                marketplaceId: productData.marketplaceId,
              },
            },
            update: {
              price: productData.price,
              lastSyncAt: new Date(),
              syncError: null,
            },
            create: {
              marketplaceId: productData.marketplaceId,
              productId: product.id,
              integrationId: integration.id,
              price: productData.price,
              lastSyncAt: new Date(),
            },
          });
        }

        // Create or update ProductSource record
        // IMPORTANT: externalProductId (WooCommerce product_id) is the PRIMARY KEY and should never change
        if (productData.marketplaceId) {
          const existingProductSource = await prisma.productSource.findUnique({
            where: {
              productId_integrationId: {
                productId: product.id,
                integrationId: integration.id,
              },
            },
          });

          // Check if externalProductId matches (it should always match, but verify for safety)
          if (existingProductSource && existingProductSource.externalProductId !== String(productData.marketplaceId)) {
            logger.warn(`[${integration.type}] ProductSource externalProductId uyumsuz! Ürün: ${product.sku}, Mevcut: ${existingProductSource.externalProductId}, Yeni: ${productData.marketplaceId}. Güncelleniyor...`);
          }

          const productSourceHasChanges = !existingProductSource ||
            existingProductSource.externalProductId !== String(productData.marketplaceId) ||
            existingProductSource.externalSku !== (productData.sku || null) ||
            existingProductSource.externalBarcode !== (productData.barcode || null) ||
            Number(existingProductSource.externalPrice || 0) !== Number(productData.price || 0);

          if (productSourceHasChanges || !existingProductSource) {
            await prisma.productSource.upsert({
              where: {
                productId_integrationId: {
                  productId: product.id,
                  integrationId: integration.id,
                },
              },
              update: {
                // Always update externalProductId to ensure it matches WooCommerce (shouldn't change, but safety)
                externalProductId: String(productData.marketplaceId),
                externalSku: productData.sku || null,
                externalBarcode: productData.barcode || null,
                externalPrice: productData.price ? productData.price : null,
                lastSyncAt: new Date(),
              },
              create: {
                productId: product.id,
                integrationId: integration.id,
                externalProductId: String(productData.marketplaceId), // PRIMARY KEY: WooCommerce product_id
                externalSku: productData.sku || null,
                externalBarcode: productData.barcode || null,
                externalPrice: productData.price ? productData.price : null,
                lastSyncAt: new Date(),
              },
            });
          } else {
            // Just update lastSyncAt if no changes
            await prisma.productSource.update({
              where: {
                productId_integrationId: {
                  productId: product.id,
                  integrationId: integration.id,
                },
              },
              data: {
                lastSyncAt: new Date(),
              },
            });
          }
        }

        processed++;
      } catch (error) {
        logger.error(`[${integration.type}] Ürün işleme hatası: ${productData.sku}`, error);
        failed++;
      }
    }

    // ✅ FIX: Process variations AFTER all parent products are processed
    logger.info(`[${integration.type}] Varyasyonlar işleniyor: ${variations.length} varyasyon...`);
    for (const productData of variations) {
      try {
        // ✅ DÜZELTME: Use unified product matcher
        const { matchMarketplaceProduct, upsertProductSource } = await import('./product-matcher.js');

        if (!productData.marketplaceId) {
          logger.warn(`[${integration.type}] Varyasyon marketplaceId yok, atlanıyor: ${productData.sku}`);
          failed++;
          continue;
        }

        // ✅ DEBUG: Log variation data received from WooCommerce
        logger.info(`[${integration.type}] 🔍 Varyasyon verisi alındı: ${productData.sku}`, {
          marketplaceId: productData.marketplaceId,
          parentId: productData.parentId,
          stock: productData.stock,
          price: productData.price,
          barcode: productData.barcode,
          gtin: productData.gtin,
          name: productData.name,
        });

        // Bu bir varyasyon - ProductVariant olarak kaydet
        const parentProduct = await prisma.product.findFirst({
          where: {
            companyId: integration.companyId,
            wooCommerceId: parseInt(productData.parentId!),
          },
        });

        if (!parentProduct) {
          logger.warn(`[${integration.type}] ⚠️ Parent ürün bulunamadı: ${productData.parentId}, varyasyon atlandı: ${productData.sku}`);
          failed++;
          continue;
        }

        // Varyasyonu oluştur veya güncelle
        const variant = await prisma.productVariant.upsert({
          where: {
            productId_sku: {
              productId: parentProduct.id,
              sku: productData.sku,
            },
          },
          create: {
            productId: parentProduct.id,
            sku: productData.sku,
            barcode: (productData.barcode && productData.barcode.trim() !== '') ? productData.barcode.trim() : null,
            name: productData.name,
            attributes: productData.attributes || [],
            price: productData.price,
            imageUrl: productData.imageUrl || null,
            isActive: true,
          },
          update: {
            name: productData.name,
            barcode: (productData.barcode && productData.barcode.trim() !== '') ? productData.barcode.trim() : null,
            attributes: productData.attributes || [],
            price: productData.price,
            imageUrl: productData.imageUrl || null,
          },
        });

        logger.info(`[${integration.type}] ✅ Varyasyon kaydedildi: ${productData.sku}`, {
          variantId: variant.id,
          barcode: variant.barcode,
          price: variant.price,
          parentSku: parentProduct.sku,
        });

        // Varyasyon stokunu güncelle
        if (productData.stock !== undefined && productData.stock !== null) {
          const marketplaceStockQty = Math.max(0, Math.floor(productData.stock));
          
          // Varyasyon için stok kaydını kontrol et
          let variantStock = await prisma.stock.findFirst({
            where: {
              productId: parentProduct.id,
              variantId: variant.id,
              warehouseId: defaultWarehouse.id,
            },
          });

          if (variantStock) {
            // Mevcut stok ile karşılaştır
            if (variantStock.quantity !== marketplaceStockQty) {
              await updateProductStock({
                productId: parentProduct.id,
                warehouseId: defaultWarehouse.id,
                variantId: variant.id,
                quantity: marketplaceStockQty,
                note: `Marketplace sync: ${integration.type}`,
              });
              stocksUpdated++;
              logger.info(`[${integration.type}] ✅ Varyasyon stok güncellendi: ${productData.sku} (${variantStock.quantity} → ${marketplaceStockQty})`);
            } else {
              logger.debug(`[${integration.type}] Varyasyon stok aynı - Ürün: ${productData.sku}, Stok: ${marketplaceStockQty} (güncelleme atlandı)`);
            }
          } else {
            // Yeni stok kaydı oluştur
            await createProductStock({
              productId: parentProduct.id,
              warehouseId: defaultWarehouse.id,
              variantId: variant.id,
              quantity: marketplaceStockQty,
              note: `Marketplace sync: ${integration.type}`,
            });
            stocksUpdated++;
            logger.info(`[${integration.type}] ✅ Varyasyon stok oluşturuldu: ${productData.sku} (${marketplaceStockQty})`);
          }
        } else {
          logger.warn(`[${integration.type}] ⚠️ Varyasyon stok bilgisi yok: ${productData.sku}`);
        }

        // ProductSource oluştur/güncelle (varyasyon için)
        if (productData.marketplaceId) {
          await prisma.productSource.upsert({
            where: {
              productId_integrationId: {
                productId: parentProduct.id,
                integrationId: integration.id,
              },
            },
            create: {
              productId: parentProduct.id,
              integrationId: integration.id,
              externalProductId: String(productData.marketplaceId),
              externalSku: productData.sku || null,
              externalBarcode: productData.barcode || null,
              externalPrice: productData.price || null,
              lastSyncAt: new Date(),
            },
            update: {
              externalProductId: String(productData.marketplaceId),
              externalSku: productData.sku || null,
              externalBarcode: productData.barcode || null,
              externalPrice: productData.price || null,
              lastSyncAt: new Date(),
            },
          });
        }

        processed++;
        logger.info(`[${integration.type}] ✅ Varyasyon tamamlandı: ${productData.sku} (Parent: ${parentProduct.sku})`);
      } catch (error: any) {
        logger.error(`[${integration.type}] ❌ Varyasyon işleme hatası: ${productData.sku}`, {
          error: error?.message || String(error),
          stack: error?.stack,
          productData: {
            sku: productData.sku,
            marketplaceId: productData.marketplaceId,
            parentId: productData.parentId,
            stock: productData.stock,
            price: productData.price,
            barcode: productData.barcode,
          },
        });
        failed++;
      }
    }

    // Log sync result
    await prisma.syncLog.create({
      data: {
        type: 'PRODUCT_SYNC',
        marketplace: integration.type,
        status: failed > 0 ? 'PARTIAL' : 'SUCCESS',
        message: `${processed} işlendi (${created} yeni, ${updated} güncellendi, ${stocksUpdated} stok güncellendi), ${failed} hata`,
        recordsProcessed: processed,
        recordsFailed: failed,
        companyId: integration.companyId,
      },
    });

    logger.info(`[${integration.type}] Ürün sync tamamlandı: ${processed} işlendi (${created} yeni, ${updated} güncellendi, ${stocksUpdated} stok güncellendi), ${failed} hata`);
  } catch (error) {
    logger.error(`[${integration.type}] Ürün sync hatası:`, error);
    throw error;
  }
}

