import { prisma } from '../src/config/index.js';

async function main() {
  try {
    const integrations = await prisma.marketplaceIntegration.findMany({
      select: {
        id: true,
        type: true,
        name: true,
        isActive: true,
        companyId: true,
        createdAt: true,
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log('\n📋 MEVCUT ENTEGRASYONLAR:\n');
    
    if (integrations.length === 0) {
      console.log('❌ Hiç entegrasyon bulunamadı.\n');
    } else {
      integrations.forEach((integration, index) => {
        console.log(`${index + 1}. ${integration.name} (${integration.type})`);
        console.log(`   ID: ${integration.id}`);
        console.log(`   Durum: ${integration.isActive ? '✅ Aktif' : '❌ Pasif'}`);
        console.log(`   Ürün: ${integration._count.products}`);
        console.log(`   Sipariş: ${integration._count.orders}`);
        console.log(`   Şirket: ${integration.companyId}`);
        console.log(`   Oluşturma: ${integration.createdAt.toISOString()}\n`);
      });
    }

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('❌ Hata:', error.message);
    process.exit(1);
  }
}

main();

