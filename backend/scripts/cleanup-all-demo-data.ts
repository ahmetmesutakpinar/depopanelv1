import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * Tüm demo/test verilerini temizle (Canlıya alma için)
 * 
 * Silinenler:
 * - Tüm siparişler ve sipariş item'ları
 * - Tüm iadeler
 * - Tüm toplama dalgaları
 * - Tüm kampanyalı setler ve stokları
 * - Tüm sayım verileri
 * - Tüm stok logları
 * - Tüm senkronizasyon logları
 * - Tüm denetim logları
 * - Tüm transferler
 * - Demo ürünler ve stokları
 * - Demo kategoriler
 * - Demo siparişler
 * 
 * Korunanlar:
 * - Kullanıcılar (admin hesapları)
 * - Şirketler
 * - Depolar (opsiyonel)
 * - Lokasyonlar
 * - Marketplace Entegrasyonları
 * - Kargo Şirketleri
 */
async function cleanupAllDemoData() {
  try {
    console.log('🧹 Tüm demo/test verileri temizleniyor...\n');
    console.log('⚠️  UYARI: Bu işlem geri alınamaz!\n');
    console.log('5 saniye bekleniyor...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const result = await prisma.$transaction(async (tx) => {
      console.log('📊 Veri sayıları kontrol ediliyor...\n');

      // Sayıları al
      const counts = {
        orders: await tx.order.count(),
        orderItems: await tx.orderItem.count(),
        returns: await tx.return.count(),
        returnItems: await tx.returnItem.count(),
        pickingWaves: await tx.pickingWave.count(),
        campaignSets: await tx.campaignSet.count(),
        campaignSetItems: await tx.campaignSetItem.count(),
        campaignStocks: await tx.campaignStock.count(),
        inventoryCounts: await tx.inventoryCount.count(),
        inventoryCountItems: await tx.inventoryCountItem.count(),
        stockLogs: await tx.stockLog.count(),
        syncLogs: await tx.syncLog.count(),
        auditLogs: await tx.auditLog.count(),
        transfers: await tx.transfer.count(),
        transferItems: await tx.transferItem.count(),
        products: await tx.product.count(),
        stocks: await tx.stock.count(),
        categories: await tx.category.count(),
        productSetItems: await tx.productSetItem.count(),
        setStocks: await tx.setStock.count(),
      };

      console.log('📋 Mevcut Veri Sayıları:');
      console.log(`   Siparişler: ${counts.orders}`);
      console.log(`   Sipariş Kalemleri: ${counts.orderItems}`);
      console.log(`   İadeler: ${counts.returns}`);
      console.log(`   Toplama Dalgaları: ${counts.pickingWaves}`);
      console.log(`   Kampanyalı Setler: ${counts.campaignSets}`);
      console.log(`   Sayım Verileri: ${counts.inventoryCounts}`);
      console.log(`   Stok Logları: ${counts.stockLogs}`);
      console.log(`   Senkronizasyon Logları: ${counts.syncLogs}`);
      console.log(`   Denetim Logları: ${counts.auditLogs}`);
      console.log(`   Transferler: ${counts.transfers}`);
      console.log(`   Ürünler: ${counts.products}`);
      console.log(`   Stoklar: ${counts.stocks}`);
      console.log(`   Kategoriler: ${counts.categories}`);
      console.log('');

      console.log('🗑️  Silme işlemi başlıyor...\n');

      // 1. Return Items
      const deletedReturnItems = await tx.returnItem.deleteMany({});
      console.log(`   ✅ ${deletedReturnItems.count} İade Kalemi silindi`);

      // 2. Returns
      const deletedReturns = await tx.return.deleteMany({});
      console.log(`   ✅ ${deletedReturns.count} İade silindi`);

      // 3. Order Items
      const deletedOrderItems = await tx.orderItem.deleteMany({});
      console.log(`   ✅ ${deletedOrderItems.count} Sipariş Kalemi silindi`);

      // 4. Orders
      const deletedOrders = await tx.order.deleteMany({});
      console.log(`   ✅ ${deletedOrders.count} Sipariş silindi`);

      // 5. Picking Waves
      const deletedPickingWaves = await tx.pickingWave.deleteMany({});
      console.log(`   ✅ ${deletedPickingWaves.count} Toplama Dalgası silindi`);

      // 6. Campaign Set Items
      const deletedCampaignSetItems = await tx.campaignSetItem.deleteMany({});
      console.log(`   ✅ ${deletedCampaignSetItems.count} Kampanyalı Set Kalemi silindi`);

      // 7. Campaign Stocks
      const deletedCampaignStocks = await tx.campaignStock.deleteMany({});
      console.log(`   ✅ ${deletedCampaignStocks.count} Kampanyalı Set Stoku silindi`);

      // 8. Campaign Sets
      const deletedCampaignSets = await tx.campaignSet.deleteMany({});
      console.log(`   ✅ ${deletedCampaignSets.count} Kampanyalı Set silindi`);

      // 9. Inventory Count Items
      const deletedCountItems = await tx.inventoryCountItem.deleteMany({});
      console.log(`   ✅ ${deletedCountItems.count} Sayım Kalemi silindi`);

      // 10. Inventory Counts
      const deletedCounts = await tx.inventoryCount.deleteMany({});
      console.log(`   ✅ ${deletedCounts.count} Sayım silindi`);

      // 11. Product Set Items
      const deletedProductSetItems = await tx.productSetItem.deleteMany({});
      console.log(`   ✅ ${deletedProductSetItems.count} SET Ürün Kalemi silindi`);

      // 12. Set Stocks
      const deletedSetStocks = await tx.setStock.deleteMany({});
      console.log(`   ✅ ${deletedSetStocks.count} SET Stoku silindi`);

      // 13. Stock Logs
      const deletedStockLogs = await tx.stockLog.deleteMany({});
      console.log(`   ✅ ${deletedStockLogs.count} Stok Logu silindi`);

      // 14. Stocks
      const deletedStocks = await tx.stock.deleteMany({});
      console.log(`   ✅ ${deletedStocks.count} Stok silindi`);

      // 15. Product Location Assignments
      const deletedLocationAssignments = await tx.productLocationAssignment.deleteMany({});
      console.log(`   ✅ ${deletedLocationAssignments.count} Ürün Lokasyon Ataması silindi`);

      // 16. Product Variants
      const deletedVariants = await tx.productVariant.deleteMany({});
      console.log(`   ✅ ${deletedVariants.count} Ürün Varyantı silindi`);

      // 17. Products
      const deletedProducts = await tx.product.deleteMany({});
      console.log(`   ✅ ${deletedProducts.count} Ürün silindi`);

      // 18. Categories
      const deletedCategories = await tx.category.deleteMany({});
      console.log(`   ✅ ${deletedCategories.count} Kategori silindi`);

      // 19. Transfer Items
      const deletedTransferItems = await tx.transferItem.deleteMany({});
      console.log(`   ✅ ${deletedTransferItems.count} Transfer Kalemi silindi`);

      // 20. Transfers
      const deletedTransfers = await tx.transfer.deleteMany({});
      console.log(`   ✅ ${deletedTransfers.count} Transfer silindi`);

      // 21. Sync Logs
      const deletedSyncLogs = await tx.syncLog.deleteMany({});
      console.log(`   ✅ ${deletedSyncLogs.count} Senkronizasyon Logu silindi`);

      // 22. Audit Logs
      const deletedAuditLogs = await tx.auditLog.deleteMany({});
      console.log(`   ✅ ${deletedAuditLogs.count} Denetim Logu silindi`);

      // 23. Marketplace Products
      const deletedMarketplaceProducts = await tx.marketplaceProduct.deleteMany({});
      console.log(`   ✅ ${deletedMarketplaceProducts.count} Marketplace Ürün silindi`);

      // 24. Product Sources
      const deletedProductSources = await tx.productSource.deleteMany({});
      console.log(`   ✅ ${deletedProductSources.count} Ürün Kaynağı silindi`);

      // 25. Order Sources
      const deletedOrderSources = await tx.orderSource.deleteMany({});
      console.log(`   ✅ ${deletedOrderSources.count} Sipariş Kaynağı silindi`);

      // 26. Marketplace Integrations (opsiyonel - yorum satırından çıkarabilirsiniz)
      // const deletedIntegrations = await tx.marketplaceIntegration.deleteMany({});
      // console.log(`   ✅ ${deletedIntegrations.count} Marketplace Entegrasyonu silindi`);

      return {
        deletedOrders: deletedOrders.count,
        deletedOrderItems: deletedOrderItems.count,
        deletedReturns: deletedReturns.count,
        deletedPickingWaves: deletedPickingWaves.count,
        deletedCampaignSets: deletedCampaignSets.count,
        deletedCounts: deletedCounts.count,
        deletedStockLogs: deletedStockLogs.count,
        deletedSyncLogs: deletedSyncLogs.count,
        deletedAuditLogs: deletedAuditLogs.count,
        deletedTransfers: deletedTransfers.count,
        deletedProducts: deletedProducts.count,
        deletedStocks: deletedStocks.count,
        deletedCategories: deletedCategories.count,
      };
    });

    console.log('\n✅ Temizleme işlemi tamamlandı!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 ÖZET:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   ✅ Silinen Sipariş: ${result.deletedOrders}`);
    console.log(`   ✅ Silinen Sipariş Kalemi: ${result.deletedOrderItems}`);
    console.log(`   ✅ Silinen İade: ${result.deletedReturns}`);
    console.log(`   ✅ Silinen Toplama Dalgası: ${result.deletedPickingWaves}`);
    console.log(`   ✅ Silinen Kampanyalı Set: ${result.deletedCampaignSets}`);
    console.log(`   ✅ Silinen Sayım: ${result.deletedCounts}`);
    console.log(`   ✅ Silinen Stok Logu: ${result.deletedStockLogs}`);
    console.log(`   ✅ Silinen Senkronizasyon Logu: ${result.deletedSyncLogs}`);
    console.log(`   ✅ Silinen Denetim Logu: ${result.deletedAuditLogs}`);
    console.log(`   ✅ Silinen Transfer: ${result.deletedTransfers}`);
    console.log(`   ✅ Silinen Ürün: ${result.deletedProducts}`);
    console.log(`   ✅ Silinen Stok: ${result.deletedStocks}`);
    console.log(`   ✅ Silinen Kategori: ${result.deletedCategories}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('✅ Korunan Veriler:');
    console.log('   👤 Kullanıcılar (admin hesapları)');
    console.log('   🏢 Şirketler');
    console.log('   🏭 Depolar');
    console.log('   📍 Lokasyonlar');
    console.log('   🔌 Marketplace Entegrasyonları');
    console.log('   🚚 Kargo Şirketleri');
    console.log('');
    console.log('🎉 Sistem canlıya hazır!');
    console.log('');

  } catch (error) {
    console.error('\n❌ Hata oluştu:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Script çalıştır
cleanupAllDemoData()
  .then(() => {
    console.log('✅ Script başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

