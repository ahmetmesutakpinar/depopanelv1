# Veritabanı Temizleme Talimatları

API verilerini temizlemek için aşağıdaki adımları izleyin:

## 1. Backend Server'ı Durdurun

Backend server çalışıyorsa durdurun (Ctrl+C)

## 2. Veritabanını Temizleyin

```bash
cd backend
npm run db:cleanup
```

Bu komut şunları siler:
- ✅ Tüm siparişler ve sipariş item'ları
- ✅ Tüm iadeler
- ✅ Tüm toplama dalgaları
- ✅ Tüm kampanyalı setler
- ✅ Tüm sayım verileri
- ✅ Tüm stok logları
- ✅ Tüm senkronizasyon logları
- ✅ Tüm denetim logları
- ✅ Marketplace ürün eşlemeleri

**Korunan veriler:**
- 👤 Kullanıcılar
- 🏢 Şirketler
- 🏭 Depolar
- 📍 Lokasyonlar
- 📦 Ürünler ve Varyantlar
- 📊 Stoklar (miktarlar korunur)
- 📁 Kategoriler
- 🔌 Marketplace Entegrasyonları
- 🚚 Kargo Şirketleri

## 3. Stokları da Sıfırlamak İsterseniz

`backend/src/scripts/cleanup-database.ts` dosyasında şu satırların yorumunu kaldırın:

```typescript
// Stokları sıfırla
logger.info('Stoklar sıfırlanıyor...');
await tx.stock.updateMany({
  data: {
    quantity: 0,
    reservedQty: 0,
  },
});
logger.info('Tüm stoklar sıfırlandı');
```

## Notlar

- Bu işlem geri alınamaz!
- Sadece işlem verilerini siler, temel veriler korunur
- Stok miktarları varsayılan olarak korunur (yukarıdaki kodu aktif ederek sıfırlayabilirsiniz)

