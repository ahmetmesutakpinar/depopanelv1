/**
 * Script: Entegrasyon verilerini temizle
 * 
 * Kullanım:
 * npx tsx scripts/cleanup-integration-data.ts <integrationId> [--dry-run]
 */

import { prisma } from '../src/config/index.js';
import { logger } from '../src/utils/logger.js';

async function cleanupIntegrationData(integrationId: string, dryRun: boolean = false) {
  try {
    console.log('\n🔍 Entegrasyon verisi temizleniyor...');
    console.log(`Integration ID: ${integrationId}`);
    console.log(`Dry Run: ${dryRun ? 'EVET (veri silinmeyecek)' : 'HAYIR (veri silinecek)'}\n`);

    // 1. Entegrasyonu kontrol et
    const integration = await prisma.marketplaceIntegration.findUnique({
      where: { id: integrationId },
      select: {
        id: true,
        type: true,
        name: true,
        companyId: true,
        isActive: true,
      },
    });

    if (!integration) {
      console.error('❌ Entegrasyon bulunamadı!');
      process.exit(1);
    }

    console.log(`📦 Entegrasyon: ${integration.name} (${integration.type})`);
    console.log(`🏢 Şirket ID: ${integration.companyId}`);
    console.log(`🔄 Durum: ${integration.isActive ? 'Aktif' : 'Deaktif'}\n`);

    // 2. İlgili verileri say
    console.log('📊 İlgili veri sayıları:');

    const counts = {
      marketplaceProducts: await prisma.marketplaceProduct.count({
        where: { integrationId },
      }),
      productSources: await prisma.productSource.count({
        where: { integrationId },
      }),
      orderSources: await prisma.orderSource.count({
        where: { integrationId },
      }),
      ordersLinked: await prisma.order.count({
        where: { integrationId },
      }),
      productsFromThisIntegration: await prisma.product.count({
        where: {
          companyId: integration.companyId,
          productSources: {
            some: { integrationId },
          },
        },
      }),
      campaignSetsLinked: await prisma.campaignSet.count({
        where: {
          companyId: integration.companyId,
          products: {
            some: {
              productSources: {
                some: { integrationId },
              },
            },
          },
        },
      }),
      productSetsLinked: await prisma.product.count({
        where: {
          companyId: integration.companyId,
          type: 'SET',
          setItems: {
            some: {
              componentProduct: {
                productSources: {
                  some: { integrationId },
                },
              },
            },
          },
        },
      }),
    };

    console.log(`  - MarketplaceProduct: ${counts.marketplaceProducts}`);
    console.log(`  - ProductSource: ${counts.productSources}`);
    console.log(`  - OrderSource: ${counts.orderSources}`);
    console.log(`  - Orders (linked): ${counts.ordersLinked}`);
    console.log(`  - Products (from integration): ${counts.productsFromThisIntegration}`);
    console.log(`  - Campaign Sets (linked): ${counts.campaignSetsLinked}`);
    console.log(`  - Product Sets (linked): ${counts.productSetsLinked}\n`);

    if (dryRun) {
      console.log('✅ DRY RUN tamamlandı. Veri silinmedi.');
      console.log('\n💡 Gerçekten silmek için --dry-run parametresini kaldırın:');
      console.log(`   npx tsx scripts/cleanup-integration-data.ts ${integrationId}\n`);
      return;
    }

    // 3. Kullanıcı onayı al
    console.log('⚠️  UYARI: Bu işlem geri alınamaz!');
    console.log('Devam etmek için 5 saniye bekleniyor...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. Verileri sil (transaction içinde)
    console.log('🗑️  Veriler siliniyor...\n');

    const result = await prisma.$transaction(async (tx) => {
      // 1. Bu entegrasyondan gelen product ID'lerini bul
      const productSourcesToDelete = await tx.productSource.findMany({
        where: { integrationId },
        select: { productId: true },
      });

      const productIds = productSourcesToDelete.map(ps => ps.productId);
      console.log(`  📦 ${productIds.length} ürün bu entegrasyondan gelmiş`);

      // 2. MarketplaceProduct sil
      const deletedMarketplaceProducts = await tx.marketplaceProduct.deleteMany({
        where: { integrationId },
      });
      console.log(`  ✅ ${deletedMarketplaceProducts.count} MarketplaceProduct silindi`);

      // 3. ProductSource sil
      const deletedProductSources = await tx.productSource.deleteMany({
        where: { integrationId },
      });
      console.log(`  ✅ ${deletedProductSources.count} ProductSource silindi`);

      // 4. OrderSource sil
      const deletedOrderSources = await tx.orderSource.deleteMany({
        where: { integrationId },
      });
      console.log(`  ✅ ${deletedOrderSources.count} OrderSource silindi`);

      // 5. Orders'daki integrationId'yi null yap ve siparişleri sil
      let deletedOrders = 0;
      let updatedOrders = 0;

      // Option: Siparişleri silmek istiyorsanız
      const ordersToDelete = await tx.order.findMany({
        where: { integrationId },
        select: { id: true },
      });

      if (ordersToDelete.length > 0) {
        // Önce order items'ları sil
        await tx.orderItem.deleteMany({
          where: { orderId: { in: ordersToDelete.map(o => o.id) } },
        });

        // Sonra orders'ları sil
        const deleted = await tx.order.deleteMany({
          where: { id: { in: ordersToDelete.map(o => o.id) } },
        });
        deletedOrders = deleted.count;
        console.log(`  ✅ ${deletedOrders} Sipariş (ve item'ları) silindi`);
      }

      // 6. Bu ürünlerle ilgili SET'leri temizle
      let deletedSetItems = 0;
      let deletedSets = 0;

      if (productIds.length > 0) {
        // SET ürünlerdeki component'ları sil
        const deletedSetItemsResult = await tx.productSetItem.deleteMany({
          where: {
            OR: [
              { componentProductId: { in: productIds } },
              { setProductId: { in: productIds } },
            ],
          },
        });
        deletedSetItems = deletedSetItemsResult.count;
        console.log(`  ✅ ${deletedSetItems} SET bileşeni silindi`);

        // Campaign set'lerden bu ürünleri kaldır
        const deletedCampaignSetItems = await tx.campaignSetItem.deleteMany({
          where: { productId: { in: productIds } },
        });
        console.log(`  ✅ ${deletedCampaignSetItems.count} Campaign Set item silindi`);

        // Boş kalan campaign set'leri sil
        const emptyCampaignSets = await tx.campaignSet.findMany({
          where: {
            companyId: integration.companyId,
            items: { none: {} },
          },
          select: { id: true },
        });

        if (emptyCampaignSets.length > 0) {
          await tx.campaignSet.deleteMany({
            where: { id: { in: emptyCampaignSets.map(cs => cs.id) } },
          });
          console.log(`  ✅ ${emptyCampaignSets.length} boş Campaign Set silindi`);
        }

        // Artık başka entegrasyona bağlı olmayan ürünleri bul ve sil
        const productsToDelete: string[] = [];
        for (const productId of productIds) {
          // Başka ProductSource var mı?
          const otherSources = await tx.productSource.count({
            where: { productId },
          });

          // Başka MarketplaceProduct var mı?
          const otherMarketplace = await tx.marketplaceProduct.count({
            where: { productId },
          });

          // Hiçbir kaynağı yoksa sil
          if (otherSources === 0 && otherMarketplace === 0) {
            productsToDelete.push(productId);
          }
        }

        if (productsToDelete.length > 0) {
          // Önce stock'ları sil
          await tx.stock.deleteMany({
            where: { productId: { in: productsToDelete } },
          });

          // Stock log'ları sil
          await tx.stockLog.deleteMany({
            where: { productId: { in: productsToDelete } },
          });

          // Ürünleri sil
          const deleted = await tx.product.deleteMany({
            where: { id: { in: productsToDelete } },
          });
          console.log(`  ✅ ${deleted.count} Ürün (ve stock'ları) silindi`);
        }
      }

      // 7. Entegrasyonu soft delete yap
      await tx.marketplaceIntegration.update({
        where: { id: integrationId },
        data: {
          isActive: false,
          status: 'INACTIVE',
        },
      });
      console.log(`  ✅ Entegrasyon deaktif edildi\n`);

      return {
        deletedMarketplaceProducts: deletedMarketplaceProducts.count,
        deletedProductSources: deletedProductSources.count,
        deletedOrderSources: deletedOrderSources.count,
        deletedOrders,
        deletedSetItems,
        productsFound: productIds.length,
      };
    });

    console.log('✅ Temizleme işlemi tamamlandı!\n');
    console.log('📊 Özet:');
    console.log(`  - Silinen MarketplaceProduct: ${result.deletedMarketplaceProducts}`);
    console.log(`  - Silinen ProductSource: ${result.deletedProductSources}`);
    console.log(`  - Silinen OrderSource: ${result.deletedOrderSources}`);
    console.log(`  - Silinen Sipariş: ${result.deletedOrders}`);
    console.log(`  - Silinen SET item: ${result.deletedSetItems}`);
    console.log(`  - Toplam işlenen ürün: ${result.productsFound}\n`);

    console.log('💡 Entegrasyon deaktif edildi ama veritabanından silinmedi.');
    console.log('💡 Ürünler, siparişler, set'ler ve tüm ilgili veriler temizlendi.\n');

  } catch (error) {
    console.error('\n❌ Hata oluştu:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Script çalıştır
const args = process.argv.slice(2);
const integrationId = args[0];
const dryRun = args.includes('--dry-run');

if (!integrationId) {
  console.error('\n❌ Kullanım: npx tsx scripts/cleanup-integration-data.ts <integrationId> [--dry-run]\n');
  process.exit(1);
}

cleanupIntegrationData(integrationId, dryRun)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

