import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger.js';

const prisma = new PrismaClient();

/**
 * Duplicate ürünleri temizle
 * Aynı WooCommerce product_id'ye sahip ürünleri bulup birleştirir
 */
async function cleanupDuplicateProducts() {
  logger.info('🔄 Duplicate ürün temizliği başlıyor...');

  try {
    // Tüm aktif entegrasyonları al
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const integration of integrations) {
      logger.info(`[${integration.type}] Entegrasyon kontrol ediliyor: ${integration.name}`);

      // Bu entegrasyon için tüm ProductSource kayıtlarını al
      const productSources = await prisma.productSource.findMany({
        where: {
          integrationId: integration.id,
        },
        include: {
          product: true,
        },
      });

      // externalProductId'ye göre grupla (aynı WooCommerce product_id)
      const groupedByWooId = new Map<string, typeof productSources>();

      for (const ps of productSources) {
        const wooId = ps.externalProductId;
        if (!groupedByWooId.has(wooId)) {
          groupedByWooId.set(wooId, []);
        }
        groupedByWooId.get(wooId)!.push(ps);
      }

      // Her WooCommerce ID için duplicate kontrolü yap
      for (const [wooId, sources] of groupedByWooId.entries()) {
        if (sources.length > 1) {
          logger.warn(`[${integration.type}] Duplicate bulundu! WooCommerce ID: ${wooId}, ${sources.length} adet ürün`);

          // En eski ürünü master olarak seç (ilk oluşturulan)
          const sortedSources = sources.sort((a, b) => 
            a.product.createdAt.getTime() - b.product.createdAt.getTime()
          );
          const masterSource = sortedSources[0];
          const masterProduct = masterSource.product;
          const duplicates = sortedSources.slice(1);

          logger.info(`[${integration.type}] Master ürün: ${masterProduct.sku} (ID: ${masterProduct.id})`);

          // Duplicate ürünleri birleştir
          for (const duplicateSource of duplicates) {
            const duplicateProduct = duplicateSource.product;
            
            logger.info(`[${integration.type}] Duplicate ürün birleştiriliyor: ${duplicateProduct.sku} (ID: ${duplicateProduct.id}) → ${masterProduct.sku}`);

            await prisma.$transaction(async (tx) => {
              // 1. Stock'ları master ürüne taşı
              const duplicateStocks = await tx.stock.findMany({
                where: { productId: duplicateProduct.id },
              });

              for (const stock of duplicateStocks) {
                const masterStock = await tx.stock.findFirst({
                  where: {
                    productId: masterProduct.id,
                    warehouseId: stock.warehouseId,
                    variantId: stock.variantId,
                  },
                });

                if (masterStock) {
                  // Master stock varsa, miktarları birleştir
                  await tx.stock.update({
                    where: { id: masterStock.id },
                    data: {
                      quantity: masterStock.quantity + stock.quantity,
                    },
                  });

                  // Stock log oluştur
                  await tx.stockLog.create({
                    data: {
                      type: 'ADJUSTMENT',
                      quantity: stock.quantity,
                      previousQty: masterStock.quantity,
                      newQty: masterStock.quantity + stock.quantity,
                      note: `Duplicate ürün birleştirme: ${duplicateProduct.sku} → ${masterProduct.sku}`,
                      productId: masterProduct.id,
                      warehouseId: stock.warehouseId,
                    },
                  });

                  // Duplicate stock'u sil
                  await tx.stock.delete({ where: { id: stock.id } });
                } else {
                  // Master stock yoksa, duplicate stock'u master'a taşı
                  await tx.stock.update({
                    where: { id: stock.id },
                    data: { productId: masterProduct.id },
                  });
                }
              }

              // 2. OrderItem'ları master ürüne taşı
              await tx.orderItem.updateMany({
                where: { productId: duplicateProduct.id },
                data: { productId: masterProduct.id },
              });

              // 3. Duplicate ProductSource'u sil (master zaten var)
              await tx.productSource.delete({
                where: { id: duplicateSource.id },
              });

              // 4. MarketplaceProduct kayıtlarını master'a taşı
              await tx.marketplaceProduct.updateMany({
                where: { productId: duplicateProduct.id },
                data: { productId: masterProduct.id },
              });

              // 5. Diğer ilişkili kayıtları master'a taşı
              // StockLog
              await tx.stockLog.updateMany({
                where: { productId: duplicateProduct.id },
                data: { productId: masterProduct.id },
              });

              // InventoryCountItem
              await tx.inventoryCountItem.updateMany({
                where: { productId: duplicateProduct.id },
                data: { productId: masterProduct.id },
              });

              // ProductLocationAssignment
              await tx.productLocationAssignment.updateMany({
                where: { productId: duplicateProduct.id },
                data: { productId: masterProduct.id },
              });

              // 6. Duplicate ürünü sil
              await tx.product.delete({
                where: { id: duplicateProduct.id },
              });

              logger.info(`[${integration.type}] ✅ Duplicate ürün birleştirildi: ${duplicateProduct.sku} → ${masterProduct.sku}`);
            });
          }
        }
      }
    }

    logger.info('✅ Duplicate ürün temizliği tamamlandı');
  } catch (error) {
    logger.error('❌ Duplicate ürün temizliği hatası:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Script çalıştır
cleanupDuplicateProducts()
  .then(() => {
    console.log('✅ Script başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

