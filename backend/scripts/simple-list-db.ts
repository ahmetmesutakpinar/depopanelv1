import { prisma } from '../src/config/index.js';

async function main() {
  console.log('\n🔍 VERİTABANI DURUMU:\n');

  const companies = await prisma.company.count();
  const integrations = await prisma.marketplaceIntegration.count();
  const products = await prisma.product.count();
  const orders = await prisma.order.count();

  console.log(`📊 Toplam Sayılar:`);
  console.log(`   - Şirket: ${companies}`);
  console.log(`   - Entegrasyon: ${integrations}`);
  console.log(`   - Ürün: ${products}`);
  console.log(`   - Sipariş: ${orders}\n`);

  if (integrations > 0) {
    const integrationList = await prisma.marketplaceIntegration.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    });

    console.log('📋 Entegrasyonlar:\n');
    integrationList.forEach((int, idx) => {
      console.log(`${idx + 1}. ${int.name} (${int.type})`);
      console.log(`   ID: ${int.id}`);
      console.log(`   Durum: ${int.isActive ? '✅ Aktif' : '❌ Pasif'}`);
      console.log(`   Ürün: ${int._count.products} | Sipariş: ${int._count.orders}\n`);
    });

    console.log('\n💡 Silmek için:');
    console.log(`   npx tsx scripts/cleanup-integration-data.ts <INTEGRATION_ID> --dry-run\n`);
  } else {
    console.log('❌ Hiç entegrasyon bulunamadı.');
    console.log('💡 API üzerinden bir entegrasyon ekleyin veya varsa gerçek bir entegrasyon ID\'si verin.\n');
  }

  await prisma.$disconnect();
}

main().catch(console.error);










