import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Duplicate ürünleri bul ve listele
 */
async function findDuplicateProducts() {
  console.log('🔍 Duplicate ürünler aranıyor...\n');

  try {
    // Tüm aktif entegrasyonları al
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const integration of integrations) {
      console.log(`\n[${integration.type}] Entegrasyon: ${integration.name}`);
      console.log('─'.repeat(60));

      // Bu entegrasyon için tüm ProductSource kayıtlarını al
      const productSources = await prisma.productSource.findMany({
        where: {
          integrationId: integration.id,
        },
        include: {
          product: {
            include: {
              stocks: {
                where: { variantId: null },
                include: { warehouse: true },
              },
            },
          },
        },
        orderBy: {
          externalProductId: 'asc',
        },
      });

      // externalProductId'ye göre grupla
      const groupedByWooId = new Map<string, typeof productSources>();

      for (const ps of productSources) {
        const wooId = ps.externalProductId;
        if (!groupedByWooId.has(wooId)) {
          groupedByWooId.set(wooId, []);
        }
        groupedByWooId.get(wooId)!.push(ps);
      }

      // Duplicate'leri bul
      let duplicateCount = 0;
      for (const [wooId, sources] of groupedByWooId.entries()) {
        if (sources.length > 1) {
          duplicateCount++;
          console.log(`\n⚠️  Duplicate bulundu! WooCommerce ID: ${wooId}`);
          console.log(`   ${sources.length} adet ürün:`);
          
          for (const source of sources) {
            const product = source.product;
            const totalStock = product.stocks.reduce((sum, s) => sum + s.quantity, 0);
            console.log(`   - SKU: ${product.sku} | ID: ${product.id} | Stok: ${totalStock} | Oluşturulma: ${product.createdAt.toISOString()}`);
          }
        }
      }

      // Aynı isimde ama farklı WooCommerce ID'lerine sahip ürünleri bul
      console.log(`\n📋 Aynı isimde ürünler kontrol ediliyor...`);
      const products = await prisma.product.findMany({
        where: {
          companyId: integration.companyId,
        },
        include: {
          productSources: {
            where: { integrationId: integration.id },
          },
        },
      });

      const nameGroups = new Map<string, typeof products>();
      for (const product of products) {
        const name = product.name.toLowerCase().trim();
        if (!nameGroups.has(name)) {
          nameGroups.set(name, []);
        }
        nameGroups.get(name)!.push(product);
      }

      let nameDuplicateCount = 0;
      for (const [name, prods] of nameGroups.entries()) {
        if (prods.length > 1) {
          nameDuplicateCount++;
          console.log(`\n⚠️  Aynı isimde ürünler: "${name}"`);
          for (const prod of prods) {
            const ps = prod.productSources.find(ps => ps.integrationId === integration.id);
            const wooId = ps ? ps.externalProductId : 'YOK';
            console.log(`   - SKU: ${prod.sku} | WooCommerce ID: ${wooId} | ID: ${prod.id}`);
          }
        }
      }

      console.log(`\n📊 Özet:`);
      console.log(`   - Toplam ProductSource: ${productSources.length}`);
      console.log(`   - Aynı WooCommerce ID'ye sahip duplicate: ${duplicateCount}`);
      console.log(`   - Aynı isimde ürünler: ${nameDuplicateCount}`);
    }
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

findDuplicateProducts()
  .then(() => {
    console.log('\n✅ Kontrol tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

