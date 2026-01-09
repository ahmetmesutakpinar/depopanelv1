import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * Kampanyalı set ile örnek sipariş oluştur
 */
async function createCampaignSetOrder() {
  try {
    console.log('🔍 Kampanyalı setler aranıyor...\n');

    // Demo şirketini bul
    const demoCompany = await prisma.company.findUnique({
      where: { email: 'demo@example.com' },
    });

    if (!demoCompany) {
      console.error('❌ Demo şirketi bulunamadı. Önce seed script çalıştırın!');
      process.exit(1);
    }

    console.log(`✅ Şirket bulundu: ${demoCompany.name}\n`);

    // Aktif kampanyalı setleri bul
    const campaignSets = await prisma.campaignSet.findMany({
      where: {
        companyId: demoCompany.id,
        isActive: true,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                price: true,
              },
            },
            variant: {
              select: {
                id: true,
                sku: true,
                name: true,
              },
            },
          },
        },
        stocks: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (campaignSets.length === 0) {
      console.error('❌ Aktif kampanyalı set bulunamadı!');
      console.log('\n💡 Önce bir kampanyalı set oluşturmanız gerekiyor.');
      process.exit(1);
    }

    console.log(`📦 ${campaignSets.length} kampanyalı set bulundu:\n`);

    campaignSets.forEach((set, index) => {
      console.log(`${index + 1}. ${set.name} (SKU: ${set.sku})`);
      console.log(`   Fiyat: ${set.price} TL`);
      console.log(`   Bileşenler: ${set.items.length} ürün`);
      set.items.forEach((item) => {
        console.log(`      - ${item.product.name} x${item.quantity}`);
      });
      const totalStock = set.stocks.reduce((sum, s) => sum + s.quantity, 0);
      console.log(`   Stok: ${totalStock} adet`);
      console.log('');
    });

    // İlk kampanyalı seti seç
    const selectedSet = campaignSets[0];
    console.log(`✅ Seçilen set: ${selectedSet.name} (${selectedSet.sku})\n`);

    // Bu set ile ilişkili ürünü bul (campaignSetId ile)
    let setProduct = await prisma.product.findFirst({
      where: {
        companyId: demoCompany.id,
        campaignSetId: selectedSet.id,
        isActive: true,
      },
    });

    // Eğer ürün yoksa oluştur
    if (!setProduct) {
      console.log('📦 Kampanyalı set ürünü bulunamadı, oluşturuluyor...\n');
      
      setProduct = await prisma.product.create({
        data: {
          sku: selectedSet.sku,
          name: selectedSet.name,
          description: selectedSet.description || `Kampanyalı Set: ${selectedSet.name}`,
          price: selectedSet.price,
          costPrice: selectedSet.price * 0.7, // %30 kar marjı varsayımı
          taxRate: 18,
          isActive: true,
          companyId: demoCompany.id,
          campaignSetId: selectedSet.id,
          type: 'PRODUCT', // Normal ürün olarak kaydedilir, campaignSetId ile ilişkilendirilir
        },
      });

      console.log(`✅ Ürün oluşturuldu: ${setProduct.name} (${setProduct.sku})\n`);
    }

    console.log(`✅ Set ürünü bulundu: ${setProduct.name} (${setProduct.sku})\n`);

    // Varsayılan depoyu bul
    const defaultWarehouse = await prisma.warehouse.findFirst({
      where: {
        companyId: demoCompany.id,
        isDefault: true,
      },
    });

    if (!defaultWarehouse) {
      console.error('❌ Varsayılan depo bulunamadı!');
      process.exit(1);
    }

    console.log(`✅ Depo: ${defaultWarehouse.name}\n`);

    // Sipariş numarası oluştur
    const orderNumber = `KAMPANYA-${Date.now()}`;

    // Sipariş oluştur
    console.log('📝 Sipariş oluşturuluyor...\n');

    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerName: 'Kampanya Set Müşterisi',
        customerEmail: 'kampanya@example.com',
        customerPhone: '+90 555 123 4567',
        shippingAddress: 'Kadıköy, İstanbul',
        shippingCity: 'İstanbul',
        shippingDistrict: 'Kadıköy',
        shippingPostalCode: '34700',
        status: 'PENDING',
        subtotal: selectedSet.price,
        taxAmount: selectedSet.price * 0.18,
        shippingCost: 0,
        discount: 0,
        total: selectedSet.price * 1.18,
        companyId: demoCompany.id,
        warehouseId: defaultWarehouse.id,
        items: {
          create: {
            productId: setProduct.id,
            sku: setProduct.sku,
            name: setProduct.name,
            quantity: 1,
            unitPrice: selectedSet.price,
            taxRate: 18,
            discount: 0,
            total: selectedSet.price,
          },
        },
      },
      include: {
        items: true,
      },
    });

    console.log('✅ Sipariş başarıyla oluşturuldu!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 SİPARİŞ DETAYLARI:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Sipariş No: ${order.orderNumber}`);
    console.log(`Müşteri: ${order.customerName}`);
    console.log(`E-posta: ${order.customerEmail}`);
    console.log(`Telefon: ${order.customerPhone}`);
    console.log(`Adres: ${order.shippingAddress}`);
    console.log(`Durum: ${order.status}`);
    console.log(`Depo: ${defaultWarehouse.name}`);
    console.log('');
    console.log('📦 Sipariş Kalemleri:');
    order.items.forEach((item) => {
      console.log(`  - ${item.name} (${item.sku})`);
      console.log(`    Miktar: ${item.quantity}`);
      console.log(`    Birim Fiyat: ${item.unitPrice} TL`);
      console.log(`    Toplam: ${item.total} TL`);
    });
    console.log('');
    console.log('💰 Özet:');
    console.log(`  Ara Toplam: ${order.subtotal} TL`);
    console.log(`  KDV (%18): ${order.taxAmount} TL`);
    console.log(`  Kargo: ${order.shippingCost} TL`);
    console.log(`  Toplam: ${order.total} TL`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('💡 Not: Stok düşürme işlemi order service tarafından yapılacak.');
    console.log('💡 Kampanyalı set stokları (CampaignStock) kontrol edilecek.');
    console.log('💡 Eğer hazır paket stoku yoksa, bileşen stoklarından düşülecek.');
    console.log('');

  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Script çalıştır
createCampaignSetOrder()
  .then(() => {
    console.log('✅ Script başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

