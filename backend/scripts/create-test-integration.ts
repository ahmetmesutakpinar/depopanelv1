import { prisma } from '../src/config/index.js';
import crypto from 'crypto';

function encrypt(text: string): string {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'test-key-32-chars-long-for-aes', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function main() {
  try {
    // Önce bir şirket olup olmadığını kontrol et
    let company = await prisma.company.findFirst();
    
    if (!company) {
      console.log('❌ Şirket bulunamadı. Önce bir şirket oluşturulacak...');
      company = await prisma.company.create({
        data: {
          name: 'Test Company',
          email: 'test@company.com',
          address: 'Test Address',
        },
      });
      console.log(`✅ Test şirketi oluşturuldu: ${company.name} (${company.id})\n`);
    }

    // Test entegrasyonu oluştur
    const testIntegration = await prisma.marketplaceIntegration.create({
      data: {
        type: 'TRENDYOL',
        name: 'Test Trendyol Entegrasyonu',
        companyId: company.id,
        status: 'ACTIVE',
        isActive: true,
        apiUrl: 'https://api.trendyol.com/sapigw/suppliers',
        apiKey: encrypt('test-api-key-12345'),
        apiSecret: encrypt('test-api-secret-67890'),
        sellerId: 'TEST123',
        settings: {
          autoSync: true,
          syncInterval: 30,
          stockSync: true,
        },
      },
    });

    console.log('✅ Test entegrasyonu oluşturuldu!\n');
    console.log(`📋 Bilgiler:`);
    console.log(`   ID: ${testIntegration.id}`);
    console.log(`   Tip: ${testIntegration.type}`);
    console.log(`   Ad: ${testIntegration.name}`);
    console.log(`   Şirket: ${company.name} (${company.id})`);
    console.log(`   Durum: ${testIntegration.isActive ? '✅ Aktif' : '❌ Pasif'}\n`);

    // Test ürünleri oluştur
    console.log('📦 Test ürünleri oluşturuluyor...\n');
    
    for (let i = 1; i <= 5; i++) {
      // Ürün oluştur
      const product = await prisma.product.create({
        data: {
          companyId: company.id,
          name: `Test Ürün ${i}`,
          sku: `TEST-SKU-${i}`,
          barcode: `TEST-BARCODE-${i}`,
          type: 'SIMPLE',
          isActive: true,
          price: 100 + (i * 10),
          costPrice: 50 + (i * 5),
        },
      });

      // MarketplaceProduct oluştur
      await prisma.marketplaceProduct.create({
        data: {
          integrationId: testIntegration.id,
          productId: product.id,
          marketplaceId: `TY-${i}`,
          price: 100 + (i * 10),
        },
      });

      // ProductSource oluştur
      await prisma.productSource.create({
        data: {
          productId: product.id,
          integrationId: testIntegration.id,
          sourceType: 'MARKETPLACE',
          sourceProductId: `TY-${i}`,
        },
      });

      console.log(`   ✅ Ürün ${i} oluşturuldu: ${product.name}`);
    }

    // Test siparişleri oluştur
    console.log('\n📦 Test siparişleri oluşturuluyor...\n');
    
    // Önce bir depo oluştur
    let warehouse = await prisma.warehouse.findFirst({ where: { companyId: company.id } });
    if (!warehouse) {
      warehouse = await prisma.warehouse.create({
        data: {
          companyId: company.id,
          name: 'Test Deposu',
          address: 'Test Depo Adresi',
        },
      });
    }

    for (let i = 1; i <= 3; i++) {
      const order = await prisma.order.create({
        data: {
          companyId: company.id,
          integrationId: testIntegration.id,
          warehouseId: warehouse.id,
          orderNumber: `TEST-ORDER-${i}`,
          marketplaceOrderId: `TY-ORDER-${i}`,
          customerName: `Test Müşteri ${i}`,
          customerEmail: `customer${i}@test.com`,
          totalAmount: 500 + (i * 100),
          status: 'PENDING',
        },
      });

      // OrderSource oluştur
      await prisma.orderSource.create({
        data: {
          orderId: order.id,
          integrationId: testIntegration.id,
          sourceOrderId: `TY-ORDER-${i}`,
        },
      });

      console.log(`   ✅ Sipariş ${i} oluşturuldu: ${order.orderNumber}`);
    }

    console.log('\n🎉 Test verileri hazır!\n');
    console.log('📊 Özet:');
    console.log(`   - 1 Test Entegrasyonu`);
    console.log(`   - 5 Test Ürünü`);
    console.log(`   - 3 Test Siparişi`);
    console.log(`   - MarketplaceProduct ve ProductSource bağlantıları\n`);
    console.log('💡 Şimdi cleanup testi yapabilirsiniz:\n');
    console.log(`   npx tsx scripts/cleanup-integration-data.ts ${testIntegration.id} --dry-run\n`);

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('❌ Hata:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();

