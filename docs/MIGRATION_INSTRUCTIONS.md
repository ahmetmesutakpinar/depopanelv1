# Migration Talimatları

Yeni özellikler için migration oluşturmanız gerekiyor:

## 1. Backend Server'ı Durdurun
Backend server çalışıyorsa durdurun (Ctrl+C)

## 2. Migration Oluşturun ve Çalıştırın

```bash
cd backend
npx prisma migrate dev --name add_campaign_sets_and_picking_wave_logging
```

Bu komut şunları ekler:
- ✅ CampaignSet, CampaignSetItem, CampaignStock modellerini ekler
- ✅ Product modeline `isCampaignProduct` field'ı ekler
- ✅ PickingWave modeline `pickedById`, `shippedById`, `pickedAt`, `shippedAt` field'larını ekler
- ✅ User modeline `wavesPicked` ve `wavesShipped` ilişkilerini ekler
- ✅ OrderItem.productId'yi nullable yapar (bilinmeyen ürünler için)

## 3. Prisma Client'ı Generate Edin

```bash
npx prisma generate
```

## 4. Backend Server'ı Yeniden Başlatın

Migration tamamlandıktan sonra backend server'ı yeniden başlatın.

## Notlar

- Migration sırasında veritabanı bağlantısının aktif olduğundan emin olun
- Migration başarılı olduktan sonra tüm yeni özellikler çalışacak:
  - Kampanyalı Set yönetimi
  - Sipariş Dalgası toplu liste ve sepet görünümü
  - Toplama ve gönderim loglama
  - Ürün formunda kampanyalı ürün seçeneği

