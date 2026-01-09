import { PrismaClient, OrderStatus } from '@prisma/client';
import dotenv from 'dotenv';
import { orderService } from '../src/services/order.service.js';

dotenv.config();

const prisma = new PrismaClient();

/**
 * Kampanyalı set siparişini işle (stok düşürme ile)
 */
async function processCampaignSetOrder() {
  try {
    console.log('🔍 Kampanyalı set siparişleri aranıyor...\n');

    // Demo şirketini bul
    const demoCompany = await prisma.company.findUnique({
      where: { email: 'demo@example.com' },
    });

    if (!demoCompany) {
      console.error('❌ Demo şirketi bulunamadı!');
      process.exit(1);
    }

    // En son oluşturulan kampanyalı set siparişini bul
    const order = await prisma.order.findFirst({
      where: {
        companyId: demoCompany.id,
        orderNumber: { startsWith: 'KAMPANYA-' },
        status: 'PENDING',
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                campaignSet: {
                  include: {
                    items: {
                      include: {
                        product: true,
                        variant: true,
                      },
                    },
                    stocks: {
                      include: {
                        warehouse: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        warehouse: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!order) {
      console.error('❌ Kampanyalı set siparişi bulunamadı!');
      console.log('💡 Önce create-campaign-set-order.ts script\'ini çalıştırın.');
      process.exit(1);
    }

    console.log(`✅ Sipariş bulundu: ${order.orderNumber}\n`);
    console.log('📋 Sipariş Detayları:');
    console.log(`   Müşteri: ${order.customerName}`);
    console.log(`   Durum: ${order.status}`);
    console.log(`   Depo: ${order.warehouse?.name}\n`);

    // Sipariş kalemlerini kontrol et
    for (const item of order.items) {
      console.log(`📦 Ürün: ${item.name} (${item.sku})`);
      console.log(`   Miktar: ${item.quantity}`);

      if (item.product?.campaignSet) {
        const campaignSet = item.product.campaignSet;
        console.log(`   Kampanyalı Set: ${campaignSet.name}`);
        console.log(`   Bileşenler:`);
        
        campaignSet.items.forEach((setItem) => {
          console.log(`      - ${setItem.product.name} x${setItem.quantity}`);
        });

        // Stok durumunu kontrol et
        const campaignStock = campaignSet.stocks.find(
          (s) => s.warehouseId === order.warehouseId
        );
        
        if (campaignStock) {
          console.log(`   Hazır Paket Stoku: ${campaignStock.quantity} adet`);
        } else {
          console.log(`   Hazır Paket Stoku: 0 adet (bileşenlerden oluşturulacak)`);
        }
      }
      console.log('');
    }

    console.log('🔄 Sipariş işleniyor (stok düşürme)...\n');

    // Order service kullanarak siparişi işle
    // Not: createOrder zaten stok düşürüyor, burada sadece bilgi gösteriyoruz
    // Eğer stok düşürme yapılmadıysa, manuel olarak yapabiliriz

    // Sipariş durumunu PROCESSING'e al
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PROCESSING' },
    });

    console.log('✅ Sipariş durumu PROCESSING olarak güncellendi\n');

    // Stok durumunu tekrar kontrol et
    console.log('📊 Güncel Stok Durumu:\n');

    for (const item of order.items) {
      if (item.product?.campaignSet) {
        const campaignSet = item.product.campaignSet;
        const campaignStock = await prisma.campaignStock.findFirst({
          where: {
            campaignSetId: campaignSet.id,
            warehouseId: order.warehouseId!,
          },
        });

        console.log(`📦 ${campaignSet.name}:`);
        if (campaignStock) {
          console.log(`   Hazır Paket: ${campaignStock.quantity} adet`);
        } else {
          console.log(`   Hazır Paket: 0 adet`);
        }

        // Bileşen stoklarını kontrol et
        console.log(`   Bileşen Stokları:`);
        for (const setItem of campaignSet.items) {
          const componentStock = await prisma.stock.findFirst({
            where: {
              productId: setItem.productId,
              warehouseId: order.warehouseId!,
              variantId: setItem.variantId || null,
            },
          });

          const stockQty = componentStock ? componentStock.quantity : 0;
          const reservedQty = componentStock ? componentStock.reservedQty : 0;
          const available = stockQty - reservedQty;

          console.log(`      - ${setItem.product.name}: ${available} adet (Toplam: ${stockQty}, Rezerve: ${reservedQty})`);
        }
        console.log('');
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ İşlem tamamlandı!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('💡 Not: Stok düşürme işlemi order service tarafından');
    console.log('   sipariş oluşturulurken otomatik yapılır.');
    console.log('   Eğer hazır paket stoku varsa, ondan düşülür.');
    console.log('   Yoksa, bileşen stoklarından düşülür.');
    console.log('');

  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Script çalıştır
processCampaignSetOrder()
  .then(() => {
    console.log('✅ Script başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

