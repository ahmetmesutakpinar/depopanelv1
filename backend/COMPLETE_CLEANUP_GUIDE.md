# 🧹 Tam Entegrasyon Temizleme Rehberi

## ⚠️ Güncelleme: Artık Her Şey Temizleniyor!

Entegrasyon silindiğinde artık **tüm ilgili veriler** temizleniyor:

### ✅ Temizlenen Veriler

1. **MarketplaceProduct** - Marketplace ürün bağlantıları
2. **ProductSource** - Ürün kaynak bilgileri
3. **OrderSource** - Sipariş kaynak bilgileri
4. **Orders + OrderItems** - Siparişler ve kalemleri
5. **Products** - Sadece bu entegrasyona özel ürünler
6. **Stock + StockLog** - Ürünlerin stok kayıtları
7. **ProductSetItem** - SET ürün bileşenleri
8. **CampaignSetItem** - Kampanya set bileşenleri
9. **Boş Campaign Sets** - İçeriksiz kalan setler

---

## 🚀 KULLANIM

### 1️⃣ API ile (ÖNERİLEN)

```bash
# Tam temizlik
DELETE /api/integrations/{id}?cleanup=true

# Kalıcı silme + tam temizlik
DELETE /api/integrations/{id}?hardDelete=true&cleanup=true
```

**Örnek cURL:**
```bash
curl -X DELETE \
  "http://localhost:3000/api/integrations/YOUR_ID?cleanup=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2️⃣ Script ile (Manuel)

```bash
cd backend

# Önce dry-run (sadece göster)
npx tsx scripts/cleanup-integration-data.ts INTEGRATION_ID --dry-run

# Gerçek temizlik
npx tsx scripts/cleanup-integration-data.ts INTEGRATION_ID
```

---

## 📊 Temizlik Sonrası Rapor

Script çalıştırıldığında şu raporu alırsınız:

```
✅ Temizleme işlemi tamamlandı!

📊 Özet:
  - Silinen MarketplaceProduct: 150
  - Silinen ProductSource: 150
  - Silinen OrderSource: 89
  - Silinen Sipariş: 89
  - Silinen SET item: 45
  - Toplam işlenen ürün: 150

💡 Entegrasyon deaktif edildi ama veritabanından silinmedi.
💡 Ürünler, siparişler, set'ler ve tüm ilgili veriler temizlendi.
```

---

## 🤔 Hangi Ürünler Silinir?

### ✅ Silinir:
- **Sadece bu entegrasyondan gelen ürünler**
- Başka hiçbir entegrasyona bağlı olmayan ürünler
- Stok kayıtları
- SET bileşenleri

### ❌ Silinmez:
- **Birden fazla entegrasyonda olan ürünler**
- Elle eklenen ürünler
- Başka entegrasyonlara bağlı ürünler

**Örnek:**
```
Ürün A → Sadece WooCommerce → ✅ SİLİNİR
Ürün B → WooCommerce + Trendyol → ❌ SİLİNMEZ (sadece WooCommerce bağlantısı kesilir)
Ürün C → Elle eklenmiş → ❌ SİLİNMEZ
```

---

## 🔍 Entegrasyon ID Nasıl Bulunur?

### Database'den:
```sql
SELECT id, type, name, "companyId" 
FROM marketplace_integrations 
WHERE "companyId" = 'YOUR_COMPANY_ID';
```

### API'den:
```bash
GET /api/integrations
```

### Frontend'den:
```javascript
const integrations = await fetch('/api/integrations', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## ⚠️ GÜVENLİK NOTLARI

1. **BACKUP ALIN!** 
   ```bash
   pg_dump depopanel > backup_$(date +%Y%m%d).sql
   ```

2. **Önce Dry-Run**
   ```bash
   npx tsx scripts/cleanup-integration-data.ts ID --dry-run
   ```

3. **Test Ortamında Deneyin**

4. **Production'da Dikkatli Olun**

---

## 📝 Sık Sorulan Sorular

### Q: Dashboard'daki setler silinir mi?
**A:** EVET! Artık boş kalan campaign set'ler ve product set item'ları silinir.

### Q: Siparişler silinir mi?
**A:** EVET! Bu entegrasyondan gelen tüm siparişler ve order item'ları silinir.

### Q: Geri alabir miyim?
**A:** Soft delete ise entegrasyonu tekrar aktif edebilirsiniz, ama veriler GERİ GELMEZ. Mutlaka backup alın!

### Q: Birden fazla entegrasyonda olan ürünler ne olur?
**A:** SİLİNMEZ! Sadece bu entegrasyonla bağlantısı kesilir. Ürün diğer entegrasyonlarda kalır.

### Q: Stoklar ne olur?
**A:** Ürün silinirse stokları da silinir. Ürün kalırsa stokları kalır.

### Q: Campaign set'ler ne olur?
**A:** Bu entegrasyondan gelen ürünleri içeren campaign set item'ları silinir. Boş kalan set'ler de silinir.

---

## 🎯 En İyi Pratikler

### 1. Temizlik Öncesi
```bash
# Backup al
pg_dump depopanel > backup.sql

# Dry-run yap
npx tsx scripts/cleanup-integration-data.ts ID --dry-run

# Sonuçları incele
```

### 2. Temizlik
```bash
# API ile (önerilen)
curl -X DELETE ".../integrations/ID?cleanup=true" -H "Authorization: ..."

# Veya script ile
npx tsx scripts/cleanup-integration-data.ts ID
```

### 3. Temizlik Sonrası
```bash
# Sonuçları kontrol et
SELECT COUNT(*) FROM marketplace_products WHERE "integrationId" = 'ID';
# Should be 0

SELECT COUNT(*) FROM products WHERE id IN (
  SELECT "productId" FROM product_sources WHERE "integrationId" = 'ID'
);
# Should be 0 or only multi-source products

SELECT COUNT(*) FROM orders WHERE "integrationId" = 'ID';
# Should be 0
```

---

## 🔧 Sorun Giderme

### Problem: "Transaction failed"
**Çözüm:** Büyük veri setleri için timeout artırın:
```typescript
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["extendedWhereUnique"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  pool_timeout = 60
}
```

### Problem: "Foreign key constraint"
**Çözüm:** Cascade delete'leri kontrol edin veya script'i kullanın (doğru sırayla siler).

### Problem: "Ürünler silinmedi"
**Çözüm:** Ürün başka bir entegrasyona da bağlı olabilir. Dry-run yaparak kontrol edin.

---

## 📞 Destek

Sorun yaşarsanız:
1. `backend/logs/` dosyalarını kontrol edin
2. Dry-run raporu ile karşılaştırın
3. Backup'tan restore edin
4. Destek ekibine başvurun

---

## 🎉 Özet

**Artık entegrasyon temizliği tam kapsamlı!**

✅ Ürünler  
✅ Siparişler  
✅ SET'ler  
✅ Campaign SET'ler  
✅ Stoklar  
✅ Dashboard temiz!  

**Kullanım:**
```bash
# En kolay
DELETE /api/integrations/{id}?cleanup=true

# Manuel
npx tsx scripts/cleanup-integration-data.ts ID
```

**Artık dashboard temiz, siparişler temiz, setler temiz! 🎊**

