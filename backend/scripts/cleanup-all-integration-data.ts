import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger.js';

const prisma = new PrismaClient();

/**
 * Tüm entegrasyon verilerini temizle
 * - Tüm entegrasyonlar
 * - Entegrasyonlardan gelen ürünler
 * - Entegrasyonlardan gelen siparişler
 * - ProductSource kayıtları
 * - OrderSource kayıtları
 * - MarketplaceProduct kayıtları
 * - SyncLog kayıtları
 */
async function cleanupAllIntegrationData() {
  logger.info('🧹 Tüm entegrasyon verileri temizleniyor...');

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Tüm ProductSource kayıtlarını say
      const productSourceCount = await tx.productSource.count();
      logger.info(`📊 ProductSource kayıtları: ${productSourceCount}`);

      // 2. Tüm OrderSource kayıtlarını say
      const orderSourceCount = await tx.orderSource.count();
      logger.info(`📊 OrderSource kayıtları: ${orderSourceCount}`);

      // 3. Tüm MarketplaceProduct kayıtlarını say
      const marketplaceProductCount = await tx.marketplaceProduct.count();
      logger.info(`📊 MarketplaceProduct kayıtları: ${marketplaceProductCount}`);

      // 4. Entegrasyonlardan gelen ürünleri bul (ProductSource veya MarketplaceProduct'e sahip olanlar)
      const productIdsWithSource = await tx.productSource.findMany({
        select: { productId: true },
        distinct: ['productId'],
      });
      const productIdsWithMarketplace = await tx.marketplaceProduct.findMany({
        select: { productId: true },
        distinct: ['productId'],
      });
      const allProductIds = [
        ...new Set([
          ...productIdsWithSource.map(ps => ps.productId),
          ...productIdsWithMarketplace.map(mp => mp.productId),
        ])
      ];
      logger.info(`📊 Entegrasyon ürünleri: ${allProductIds.length}`);

      // 5. Entegrasyonlardan gelen siparişleri bul (OrderSource'e sahip olanlar veya integrationId'si olanlar)
      const ordersWithSource = await tx.orderSource.findMany({
        select: { orderId: true },
        distinct: ['orderId'],
      });
      const ordersWithIntegration = await tx.order.findMany({
        where: {
          integrationId: { not: null },
        },
        select: { id: true },
      });
      const allOrderIds = [
        ...new Set([
          ...ordersWithSource.map(os => os.orderId),
          ...ordersWithIntegration.map(o => o.id),
        ])
      ];
      logger.info(`📊 Entegrasyon siparişleri: ${allOrderIds.length}`);

      // 6. SyncLog kayıtlarını say
      const syncLogCount = await tx.syncLog.count();
      logger.info(`📊 SyncLog kayıtları: ${syncLogCount}`);

      // 7. Tüm entegrasyonları say
      const integrationCount = await tx.marketplaceIntegration.count();
      logger.info(`📊 Entegrasyonlar: ${integrationCount}`);

      logger.info('\n🗑️  Silme işlemi başlıyor...\n');

      // 8. Entegrasyonlardan gelen ürünleri sil
      let deletedProductsCount = 0;
      if (allProductIds.length > 0) {
        const deletedProducts = await tx.product.deleteMany({
          where: {
            id: { in: allProductIds },
          },
        });
        deletedProductsCount = deletedProducts.count;
        logger.info(`✅ ${deletedProductsCount} ürün silindi`);
      }

      // 9. Entegrasyonlardan gelen siparişleri sil
      let deletedOrdersCount = 0;
      if (allOrderIds.length > 0) {
        const deletedOrders = await tx.order.deleteMany({
          where: {
            id: { in: allOrderIds },
          },
        });
        deletedOrdersCount = deletedOrders.count;
        logger.info(`✅ ${deletedOrdersCount} sipariş silindi`);
      }

      // 10. SyncLog kayıtlarını sil
      const deletedSyncLogs = await tx.syncLog.deleteMany({});
      logger.info(`✅ ${deletedSyncLogs.count} sync log silindi`);

      // 11. Tüm entegrasyonları sil (ProductSource, OrderSource, MarketplaceProduct cascade ile silinecek)
      const deletedIntegrations = await tx.marketplaceIntegration.deleteMany({});
      logger.info(`✅ ${deletedIntegrations.count} entegrasyon silindi`);

      // 12. Kalan ProductSource kayıtlarını kontrol et (eğer varsa)
      const remainingProductSources = await tx.productSource.count();
      if (remainingProductSources > 0) {
        await tx.productSource.deleteMany({});
        logger.info(`✅ ${remainingProductSources} kalan ProductSource kaydı silindi`);
      }

      // 13. Kalan OrderSource kayıtlarını kontrol et (eğer varsa)
      const remainingOrderSources = await tx.orderSource.count();
      if (remainingOrderSources > 0) {
        await tx.orderSource.deleteMany({});
        logger.info(`✅ ${remainingOrderSources} kalan OrderSource kaydı silindi`);
      }

      // 14. Kalan MarketplaceProduct kayıtlarını kontrol et (eğer varsa)
      const remainingMarketplaceProducts = await tx.marketplaceProduct.count();
      if (remainingMarketplaceProducts > 0) {
        await tx.marketplaceProduct.deleteMany({});
        logger.info(`✅ ${remainingMarketplaceProducts} kalan MarketplaceProduct kaydı silindi`);
      }

      return {
        deletedProductsCount,
        deletedOrdersCount,
        deletedSyncLogs: deletedSyncLogs.count,
        deletedIntegrations: deletedIntegrations.count,
        totalProductSources: productSourceCount,
        totalOrderSources: orderSourceCount,
        totalMarketplaceProducts: marketplaceProductCount,
      };
    });

    logger.info('\n📊 Temizlik Özeti:');
    logger.info(`   - Silinen ürünler: ${result.deletedProductsCount}`);
    logger.info(`   - Silinen siparişler: ${result.deletedOrdersCount}`);
    logger.info(`   - Silinen sync loglar: ${result.deletedSyncLogs}`);
    logger.info(`   - Silinen entegrasyonlar: ${result.deletedIntegrations}`);
    logger.info(`   - Toplam ProductSource: ${result.totalProductSources}`);
    logger.info(`   - Toplam OrderSource: ${result.totalOrderSources}`);
    logger.info(`   - Toplam MarketplaceProduct: ${result.totalMarketplaceProducts}`);

    logger.info('\n✅ Tüm entegrasyon verileri temizlendi!');
  } catch (error) {
    logger.error('❌ Temizlik hatası:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Script çalıştır
cleanupAllIntegrationData()
  .then(() => {
    console.log('\n✅ Script başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

