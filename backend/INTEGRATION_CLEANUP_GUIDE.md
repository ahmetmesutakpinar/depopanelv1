# 🧹 Entegrasyon Verilerini Temizleme Rehberi

## 📋 Problem

Entegrasyon silindiğinde ilgili veriler (ürünler, siparişler, vb.) veritabanında kalıyor.

## ✅ Çözümler

### Seçenek 1: API ile Cleanup (ÖNERİLEN) 🚀

Integration silme API'sine `cleanup=true` parametresi ekleyin:

#### Soft Delete + Cleanup
```bash
DELETE /api/integrations/{integrationId}?cleanup=true
```

**Ne yapar:**
- ✅ Entegrasyonu deaktif eder (isActive = false)
- ✅ MarketplaceProduct kayıtlarını siler
- ✅ ProductSource kayıtlarını siler
- ✅ OrderSource kayıtlarını siler
- ✅ Order'lardaki integrationId'yi null yapar
- ⚠️ Siparişleri silmez (sadece bağlantıyı keser)

#### Hard Delete + Cleanup (Kalıcı Silme)
```bash
DELETE /api/integrations/{integrationId}?hardDelete=true&cleanup=true
```

**Ne yapar:**
- ✅ Yukarıdaki tüm işlemler
- ✅ Entegrasyonu kalıcı olarak siler

#### Örnek CURL Komutu
```bash
# Bearer token'ınızı alın (login yapıp)
TOKEN="your-jwt-token-here"

# Cleanup ile sil
curl -X DELETE \
  "http://localhost:3000/api/integrations/INTEGRATION_ID?cleanup=true" \
  -H "Authorization: Bearer $TOKEN"
```

#### Frontend'den (JavaScript/TypeScript)
```typescript
async function deleteIntegrationWithCleanup(integrationId: string) {
  const response = await fetch(
    `${API_URL}/integrations/${integrationId}?cleanup=true`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  const result = await response.json();
  console.log('Cleanup result:', result.data);
  // result.data.details içinde silinen kayıt sayıları var
}
```

---

### Seçenek 2: Cleanup Script (Manuel) 🛠️

Backend dizininde script çalıştırın:

#### 1. Önce Dry Run (Sadece Kontrol)
```bash
cd backend
npx tsx scripts/cleanup-integration-data.ts YOUR_INTEGRATION_ID --dry-run
```

Bu sadece neyin silineceğini gösterir, veri silmez.

#### 2. Gerçek Cleanup (Veri Siler)
```bash
npx tsx scripts/cleanup-integration-data.ts YOUR_INTEGRATION_ID
```

**Output örneği:**
```
🔍 Entegrasyon verisi temizleniyor...
Integration ID: abc-123-xyz
Dry Run: HAYIR (veri silinecek)

📦 Entegrasyon: WooCommerce Store (WOOCOMMERCE)
🏢 Şirket ID: company-456

📊 İlgili veri sayıları:
  - MarketplaceProduct: 150
  - ProductSource: 150
  - OrderSource: 89
  - Orders (linked): 89

⚠️  UYARI: Bu işlem geri alınamaz!
Devam etmek için 5 saniye bekleniyor...

🗑️  Veriler siliniyor...

  ✅ 150 MarketplaceProduct silindi
  ✅ 150 ProductSource silindi
  ✅ 89 OrderSource silindi
  ✅ 89 Order'dan bağlantı kesildi
  ✅ Entegrasyon deaktif edildi

✅ Temizleme işlemi tamamlandı!
```

---

### Seçenek 3: Manuel SQL (İleri Seviye) ⚠️

**UYARI:** Bu yöntemi yalnızca database bilginiz varsa kullanın!

```sql
-- 1. Entegrasyon ID'sini bul
SELECT id, type, name, "companyId" 
FROM marketplace_integrations 
WHERE id = 'YOUR_INTEGRATION_ID';

-- 2. İlgili kayıtları say (kontrol)
SELECT 
  (SELECT COUNT(*) FROM marketplace_products WHERE "integrationId" = 'ID') as marketplace_products,
  (SELECT COUNT(*) FROM product_sources WHERE "integrationId" = 'ID') as product_sources,
  (SELECT COUNT(*) FROM order_sources WHERE "integrationId" = 'ID') as order_sources,
  (SELECT COUNT(*) FROM orders WHERE "integrationId" = 'ID') as orders_linked;

-- 3. Transaction başlat
BEGIN;

-- 4. Verileri sil
DELETE FROM marketplace_products WHERE "integrationId" = 'YOUR_INTEGRATION_ID';
DELETE FROM product_sources WHERE "integrationId" = 'YOUR_INTEGRATION_ID';
DELETE FROM order_sources WHERE "integrationId" = 'YOUR_INTEGRATION_ID';

-- 5. Orders'daki bağlantıyı kes (silme!)
UPDATE orders SET "integrationId" = NULL WHERE "integrationId" = 'YOUR_INTEGRATION_ID';

-- 6. Entegrasyonu deaktif et
UPDATE marketplace_integrations 
SET "isActive" = false, status = 'INACTIVE' 
WHERE id = 'YOUR_INTEGRATION_ID';

-- 7. Her şey tamam mı? Commit et
COMMIT;

-- Hata olduysa:
-- ROLLBACK;
```

---

## 🔍 Entegrasyon ID'sini Bulma

### API'den:
```bash
GET /api/integrations
```

### Database'den:
```sql
SELECT id, type, name, "isActive" 
FROM marketplace_integrations 
WHERE "companyId" = 'YOUR_COMPANY_ID';
```

### Script ile:
```bash
npx tsx scripts/find-integration.ts
```

---

## ❓ Sık Sorulan Sorular

### Q: Siparişler silinir mi?
**A:** HAYIR. Siparişler silinmez, sadece entegrasyon bağlantısı kaldırılır. Siparişler veritabanında kalır.

### Q: Ürünler silinir mi?
**A:** HAYIR. Product kayıtları silinmez. Sadece MarketplaceProduct (marketplace ile ürün bağlantısı) ve ProductSource (ürün kaynak bilgisi) silinir.

### Q: Geri alabilir miyim?
**A:** Soft delete ise EVET (entegrasyonu tekrar aktif edebilirsiniz). Hard delete ise HAYIR (kalıcı silinir).

### Q: Siparişler nasıl görünür?
**A:** Siparişler normal görünür ama entegrasyon bilgisi gösterilmez (NULL olur).

### Q: Aynı entegrasyonu tekrar ekleyebilir miyim?
**A:** EVET. Soft delete edildiyse aktif edin, hard delete edildiyse yeniden oluşturun.

---

## 🎯 Hangi Yöntemi Seçmeliyim?

| Durum | Önerilen Yöntem |
|-------|----------------|
| **Normal kullanım** | API (cleanup=true) |
| **Frontend'den** | API (cleanup=true) |
| **Tek seferlik temizlik** | Cleanup Script |
| **Toplu işlem** | Cleanup Script |
| **İleri seviye / Acil durum** | Manuel SQL |

---

## 🛡️ Güvenlik Notları

1. ✅ **Backup alın** - İşlem öncesi mutlaka database backup'ı alın
2. ✅ **Dry run yapın** - Script kullanırken önce --dry-run ile test edin
3. ✅ **Doğru ID** - Entegrasyon ID'sini kontrol edin
4. ✅ **Test ortamında** - Önce test ortamında deneyin
5. ✅ **Production dikkat** - Production'da çok dikkatli olun

---

## 📞 Yardım

Sorun yaşarsanız:
1. Log dosyalarını kontrol edin: `backend/logs/`
2. Database backup'ından restore edin
3. Destek ekibiyle iletişime geçin

---

## 🎉 Özet

**En kolay yöntem:**
```bash
# API üzerinden
DELETE /api/integrations/{id}?cleanup=true
```

**Script ile:**
```bash
cd backend
npx tsx scripts/cleanup-integration-data.ts INTEGRATION_ID --dry-run
# Kontrol ettikten sonra:
npx tsx scripts/cleanup-integration-data.ts INTEGRATION_ID
```

**Artık entegrasyon verileri temiz! 🎊**

