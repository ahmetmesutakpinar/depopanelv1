# 🔍 DepoPanel - İlk Tespit Edilen Sorunlar Raporu

**Tarih:** 2025-12-03  
**Durum:** Analiz Tamamlandı - Kritik Sorunlar Tespit Edildi

---

## 📋 ÖZET

Proje **%80-85 tamamlanmış** durumda. Aşağıda tespit edilen **kritik sorunlar** ve **iyileştirme alanları** listelenmiştir.

### Genel Sağlık Skoru: **7.5/10**

---

## 🔴 KRİTİK SORUNLAR (Öncelik 1)

### 1. VERİTABANI ŞEMASI - Eksik Cascade Delete'ler

**Sorun:** Bazı ilişkilerde `onDelete` stratejisi eksik veya yanlış. Bu durum:
- Orphaned (bağımsız) kayıtlar oluşturur
- Veri bütünlüğü sorunlarına yol açar
- Foreign key constraint hatalarına neden olabilir

**Etkilenen İlişkiler:**

| Model | İlişki | Mevcut Durum | Gerekli Durum | Neden |
|-------|--------|--------------|---------------|-------|
| Category | parent | ❌ Yok | `SetNull` | Parent kategori silindiğinde child root olmalı |
| Product | category | ❌ Yok | `SetNull` | Ürün kategori olmadan var olabilir |
| OrderItem | product | ❌ Yok | `SetNull` | Sipariş kalemi tarihsel veri, ürün silinse bile kalmalı |
| OrderItem | variant | ❌ Yok | `SetNull` | Sipariş kalemi tarihsel veri |
| Stock | location | ❌ Yok | `SetNull` | Stok lokasyon olmadan var olabilir |
| StockLog | user | ❌ Yok | `SetNull` | Audit trail kalmalı |
| Order | createdBy | ❌ Yok | `SetNull` | Audit trail kalmalı |
| Order | integration | ❌ Yok | `SetNull` | Sipariş entegrasyon silinse bile kalmalı |
| Order | pickingWave | ❌ Yok | `SetNull` | Sipariş wave silinse bile kalmalı |
| Order | warehouse | ❌ Yok | `Restrict` | Siparişli depo silinememeli |
| Order | cargoCompany | ❌ Yok | `SetNull` | Sipariş kargo şirketi silinse bile kalmalı |
| ReturnItem | orderItem | ❌ Yok | `Restrict` | İadeli sipariş kalemi silinememeli |
| InventoryCountItem | product | ❌ Yok | `Restrict` | Sayım kalemi olan ürün silinememeli |
| InventoryCountItem | variant | ❌ Yok | `SetNull` | Variant silinebilir ama sayım kalemi kalmalı |
| InventoryCountItem | location | ❌ Yok | `SetNull` | Lokasyon silinebilir |
| InventoryCountItem | countedBy | ❌ Yok | `SetNull` | Audit trail kalmalı |
| InventoryCount | approvedBy | ❌ Yok | `SetNull` | Audit trail kalmalı |
| InventoryCount | createdBy | ❌ Yok | `Restrict` | Sayım oluşturan kullanıcı silinememeli |
| PickingWave | assignedTo | ❌ Yok | `SetNull` | Wave kalmalı |
| PickingWave | pickedBy | ❌ Yok | `SetNull` | Audit trail kalmalı |
| PickingWave | shippedBy | ❌ Yok | `SetNull` | Audit trail kalmalı |
| CampaignStock | location | ❌ Yok | `SetNull` | Lokasyon silinebilir |
| SetStock | location | ❌ Yok | `SetNull` | Lokasyon silinebilir |

**Çözüm:** Migration oluşturulacak ve tüm ilişkilere uygun `onDelete` stratejisi eklenecek.

---

### 2. BARCODE EŞLEŞTİRME - Eksik Alanlar

**Mevcut Durum:**
- ✅ Kontrol edilen: `product.gtin`, `product.barcode`, `variant.barcode`, `product.sku`, `variant.sku`, `item.sku`
- ❌ Eksik: `product.ean` (eğer alan varsa), case-insensitive matching iyileştirilebilir

**Konum:** `backend/src/services/order.service.ts:545-564`

**Gerekli Düzeltme:**
- Merkezi barcode matching utility oluşturulacak
- Tüm olası barcode alanları kontrol edilecek
- Case-insensitive matching iyileştirilecek

---

### 3. TOKEN REFRESH - Eksik Mekanizma

**Sorun:** Frontend'de otomatik token yenileme yok. Token süresi dolduğunda kullanıcı otomatik logout oluyor.

**Konum:** `frontend/src/services/api.ts:21-93`

**Mevcut:** Sadece 401 durumunda login'e yönlendiriyor.

**Gerekli:**
1. 401 hatasında "token expired" mesajını kontrol et
2. `/api/auth/refresh` endpoint'ini çağır
3. Token'ı güncelle
4. Orijinal request'i tekrar dene
5. Refresh başarısız olursa login'e yönlendir

---

### 4. CRON JOBS - Retry/Timeout Eksik

**Sorun:** Cron job'lar sessizce başarısız olabilir veya süresiz takılabilir.

**Konum:** `backend/src/utils/job-*.ts`

**Mevcut Sorunlar:**
- ❌ Başarısız sync'ler için retry mekanizması yok
- ❌ HTTP timeout konfigürasyonu yok
- ❌ Circuit breaker pattern yok
- ❌ Hatalar loglanıyor ama actionable değil

**Gerekli:**
- Retry logic (3 deneme, exponential backoff)
- HTTP timeout (30s default)
- Circuit breaker (5 ardışık başarısızlıktan sonra sync'i durdur)
- Gelişmiş error logging (context ile)

---

## 🟡 YÜKSEK ÖNCELİKLİ SORUNLAR (Öncelik 2)

### 5. DTO KATMANI EKSİK

**Sorun:** Controller'lar doğrudan request body kullanıyor, DTO transformation yok.

**Etki:**
- Katmanlar arası type safety yok
- Tutarsız data şekilleri
- API versioning zor

**Gerekli:**
- `backend/src/dto/` dizini oluştur
- Tüm request/response için DTO tanımla
- DTO validation için class-validator veya Zod kullan
- Controller'larda service'e geçmeden önce DTO'ya transform et

---

### 6. VALIDATION - Tutarsız Uygulama

**Mevcut Durum:**
- ✅ Zod şemaları controller'larda mevcut
- ❌ Tüm endpoint'ler validation middleware kullanmıyor
- ❌ Bazı endpoint'ler controller içinde manuel validation yapıyor

**Gerekli:**
- TÜM endpoint'lerin `validateBody()` veya `validateParams()` kullandığından emin ol
- Controller'lardaki manuel validation'ları kaldır
- Paylaşılan validation şemaları oluştur

---

### 7. ERROR HANDLING - Tutarsız Pattern'ler

**Mevcut Durum:**
- ✅ Error middleware mevcut
- ✅ Custom error class'ları var (AppError, NotFoundError, vb.)
- ❌ Bazı service'ler generic `Error` throw ediyor
- ❌ Error mesajları her zaman kullanıcı dostu değil

**Gerekli:**
- Tüm service'leri tutarlı error throwing için audit et
- Generic `Error` yerine custom error class'ları kullan
- Tüm error mesajlarının kullanıcı dostu (Türkçe) olduğundan emin ol
- Programmatic handling için error code'ları ekle

---

### 8. FRONTEND - React Query Invalidation

**Sorun:** Mutation'lar ilgili query'leri düzgün invalidate etmeyebilir.

**Gerekli:**
- Tüm mutation'ları `queryClient.invalidateQueries()` için audit et
- Optimistic update'ler ekle (uygun yerlerde)
- Loading state'leri tutarlı şekilde ekle

---

## 🟢 ORTA ÖNCELİKLİ (Öncelik 3)

### 9. PRODUCTION ENDPOINT'LERİ EKSİK

**Gerekli Endpoint'ler:**
- `GET /api/health` - Health check
- `GET /api/cron/status` - Cron job durumu
- `GET /api/metrics` - Sistem metrikleri (opsiyonel)

---

### 10. VERİTABANI İNDEX'LERİ EKSİK

**Potansiyel Eksik Index'ler:**
- `OrderItem.sku` - Sık sorgulanıyor
- `Product.gtin` - Barcode lookup'ları
- `ProductVariant.barcode` - Barcode lookup'ları
- `SyncLog.companyId + type + createdAt` - Composite filtering için

**Aksiyon:** Query pattern'lerini analiz et ve gereken yerlere index ekle.

---

### 11. ENTEGRASYON - Error Recovery

**Mevcut:** Hatalar loglanıyor ama integration status güncellenmiyor.

**Gerekli:**
- N ardışık başarısızlıktan sonra integration `status`'ünü `ERROR` yap
- Manuel retry endpoint'i ekle
- Integration health dashboard ekle

---

### 12. FRONTEND - Loading State'ler

**Sorun:** Bazı sayfalar loading skeleton'ları eksik.

**Gerekli:**
- Tüm list sayfalarına loading skeleton ekle
- Form'lara loading state ekle
- Async operasyonlar sırasında UX'i iyileştir

---

## ✅ DOĞRULANAN DOĞRU UYGULAMALAR

### 1. Inventory Count - StockLog Type
**Durum:** ✅ **DOĞRU**

**Konum:** `backend/src/repositories/inventory-count.repository.ts:286-299`

**Mevcut:**
```typescript
type: 'ADJUSTMENT' // ✅ DOĞRU
```

**Sonuç:** ✅ Değişiklik gerekmiyor. ADJUSTMENT type'ı inventory count onayları için doğru.

---

### 2. Returns - StockLog Type
**Durum:** ✅ **DOĞRU**

**Konum:** `backend/src/services/return.service.ts:244-257`

**Mevcut:**
```typescript
type: 'RETURN' // ✅ DOĞRU
```

**Sonuç:** ✅ Değişiklik gerekmiyor. RETURN type'ı onaylanmış iadeler için doğru.

---

## 📋 SONRAKİ ADIMLAR

### Faz 1: Kritik Düzeltmeler (Hafta 1)
1. ✅ Schema'daki eksik cascade delete'leri düzelt
2. ✅ Schema değişiklikleri için migration oluştur
3. ✅ Merkezi barcode matching utility oluştur
4. ✅ Token refresh mekanizması ekle
5. ✅ Cron job error handling'i geliştir

### Faz 2: Mimari İyileştirmeler (Hafta 2)
1. ✅ DTO katmanı oluştur
2. ✅ Validation'ı standardize et
3. ✅ Error handling tutarlılığını iyileştir
4. ✅ Production endpoint'leri ekle

### Faz 3: Frontend Stabilizasyonu (Hafta 3)
1. ✅ React Query invalidation'ları düzelt
2. ✅ Loading state'leri ekle
3. ✅ Error boundary'leri iyileştir
4. ✅ Toast notification'ları tutarlı ekle

---

## 🎯 BAŞARI METRİKLERİ

**Hedef Metrikler:**
- ✅ Veritabanında sıfır orphaned record
- ✅ %100 endpoint validation coverage
- ✅ < 100ms API response time (p95)
- ✅ %99.9 uptime
- ✅ Production'da sıfır critical bug

---

**Not:** Tüm değişiklikler backward compatible olmalı ve mevcut functionality'yi bozmamalı.

