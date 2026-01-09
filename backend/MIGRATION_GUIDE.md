# Migration Guide - DepoPanel WMS Upgrade

Bu doküman, sistemi yeni mimariye upgrade etmek için gerekli adımları içerir.

## 📋 Önemli Değişiklikler

### 1. **Multi-Tenant Güvenlik Sistemi**
- Tüm repository ve service fonksiyonları artık `companyId` zorunlu parametre alıyor
- `withCompanyScope` helper fonksiyonu tüm sorgularda kullanılıyor
- `req.context.companyId` middleware'de otomatik set ediliyor

### 2. **Prisma Schema Güncellemeleri**
Aşağıdaki değişiklikler yapıldı:
- `MarketplaceIntegration` → `isActive` field eklendi (soft delete)
- `Product` → `minQuantity` field eklendi
- `JobLock` modeli eklendi (distributed lock)
- `Transfer` ve `TransferItem` modelleri eklendi
- `TransferStatus` enum eklendi

### 3. **Yeni Modüller**
- **Transfer Modülü**: Depolar arası transfer yönetimi
- **Stock Alert Service**: Düşük stok alarm sistemi
- **Job Lock Manager**: Dağıtık cron job lock sistemi
- **4 Yeni Marketplace Entegrasyonu**: Pazarama, N11, Hepsiburada, Amazon

### 4. **Error Handling Standardizasyonu**
- `AppError` sınıfı tüm sistemde kullanılıyor
- Factory methodlar: `AppError.notFound()`, `AppError.badRequest()`, vb.
- Tutarlı HTTP status kodları

## 🚀 Migration Adımları

### Adım 1: Database Migration

```bash
cd backend

# Önce backup al
pg_dump depopanel > backup_$(date +%Y%m%d).sql

# Migration çalıştır
npx prisma migrate dev --name mega_upgrade

# Veya direkt push (dikkatli!)
npx prisma db push
```

### Adım 2: Environment Variables

`.env` dosyasına yeni değişkenler ekle:

```env
# Job Lock için instance ID (opsiyonel)
INSTANCE_ID=server-1

# Email ayarları (stock alerts için)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password
SMTP_FROM=noreply@depopanel.com
```

### Adım 3: Dependencies Update

```bash
cd backend
npm install

# Test framework kurulu değilse
npm install --save-dev jest @types/jest ts-jest @jest/globals
```

### Adım 4: Build ve Test

```bash
# TypeScript build
npm run build

# Testleri çalıştır
npm test

# Coverage raporu
npm run test:coverage
```

### Adım 5: Cron Jobs Aktifleştir

`src/index.ts` dosyasına ekle:

```typescript
import { startStockAlertJob } from './utils/job-stock-alerts.js';
import { JobLockManager } from './utils/job-lock.js';

// Server başlatıldıktan sonra
startStockAlertJob();
JobLockManager.startAutoCleanup();
```

### Adım 6: Mevcut Entegrasyonları Migrate Et

Mevcut entegrasyonlar için `isActive` field'ı default `true` olacak.
Eğer manuel set etmek isterseniz:

```sql
UPDATE marketplace_integrations 
SET "isActive" = true 
WHERE status = 'ACTIVE';
```

### Adım 7: Test Entegrasyonları

```bash
# Integration test script çalıştır
npm run test:integration

# Veya manuel test
curl http://localhost:3000/api/integrations
```

## 📦 Yeni API Endpoints

### Transfer API
```
GET    /api/transfers              - Transfer listesi
GET    /api/transfers/:id          - Transfer detay
POST   /api/transfers              - Yeni transfer
POST   /api/transfers/:id/approve  - Transfer onayla
POST   /api/transfers/:id/complete - Transfer tamamla
POST   /api/transfers/:id/cancel   - Transfer iptal
DELETE /api/transfers/:id          - Transfer sil
```

### Stock Alerts API
```
GET /api/stock-alerts              - Düşük stok uyarıları
GET /api/stock-alerts/widget       - Dashboard widget
GET /api/stock-alerts/warehouse/:id - Depo bazlı uyarılar
```

### Integration API (Güncellemeler)
```
POST   /api/integrations/:id/activate  - Entegrasyonu aktif et
DELETE /api/integrations/:id?cleanup=true - Verilerle birlikte sil
```

## 🔄 Breaking Changes

### 1. Repository Methods
Tüm repository metodları artık `companyId` parametresi alıyor:

**Eski:**
```typescript
await productRepository.findById(productId);
```

**Yeni:**
```typescript
await productRepository.findByIdAndCompany(productId, companyId);
```

### 2. Integration Service
Integration metodları güncellendi:

**Eski:**
```typescript
await integrationService.deleteIntegration(id);
```

**Yeni:**
```typescript
await integrationService.deleteIntegration(id, companyId, {
  hardDelete: false,
  cleanupData: true
});
```

### 3. Error Handling
AppError kullanımı:

**Eski:**
```typescript
throw new NotFoundError('Ürün bulunamadı');
```

**Yeni:**
```typescript
throw AppError.notFound('Ürün bulunamadı');
```

## 🧪 Test Coverage

Yeni test suite'leri:
- ✅ Multi-tenant helper tests
- ✅ AppError tests
- ✅ Helper functions tests
- ✅ Job lock tests
- ✅ Integration service tests

Test çalıştır:
```bash
npm test
npm run test:coverage
```

## 📊 Performance Optimizations

1. **Database Indexing**
   - `MarketplaceIntegration.isActive` indexed
   - `Transfer` compound indexes eklendi

2. **Cron Job Locks**
   - Distributed locking ile duplicate job execution engellendi
   - Auto cleanup mekanizması

3. **Query Optimization**
   - `withCompanyScope` helper ile her sorguda company isolation
   - Batch operations için optimize edilmiş endpoints

## 🔐 Security Improvements

1. **Multi-Tenant Isolation**
   - Her veri sorgusu companyId ile scope edildi
   - Cross-company data access engellendi

2. **Soft Delete**
   - Integrations soft delete destekli
   - Veri geri yükleme imkanı

3. **Request Context**
   - `req.context` ile user ve company bilgisi her request'te mevcut

## 📚 Yeni Documentation

Detaylı dokümanlar:
- `/docs/MULTI_TENANT_SECURITY.md` - Multi-tenant güvenlik
- `/docs/TRANSFER_MODULE.md` - Transfer modülü kullanımı
- `/docs/STOCK_ALERTS.md` - Stok alarm sistemi
- `/docs/JOB_LOCKS.md` - Distributed job locks
- `/docs/MARKETPLACE_INTEGRATIONS.md` - Yeni entegrasyonlar

## 🐛 Rollback Plan

Sorun çıkarsa:

```bash
# 1. Database restore
psql depopanel < backup_YYYYMMDD.sql

# 2. Eski koda dön
git checkout main

# 3. Dependencies restore
npm ci

# 4. Server restart
pm2 restart depopanel
```

## ✅ Post-Migration Checklist

- [ ] Database migration başarılı
- [ ] Tüm testler geçiyor
- [ ] Build başarılı
- [ ] Cron jobs çalışıyor
- [ ] Stock alerts aktif
- [ ] Mevcut entegrasyonlar çalışıyor
- [ ] Transfer modülü test edildi
- [ ] API endpoints test edildi
- [ ] Production deployment planlandı
- [ ] Takıma eğitim verildi

## 📞 Destek

Sorun olursa:
- GitHub Issues: [github.com/your-repo/issues]
- Slack: #depopanel-support
- Email: dev@depopanel.com

