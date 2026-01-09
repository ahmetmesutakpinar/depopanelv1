# Eksik Özellikler ve Düzeltmeler

## 🔴 Kritik Eksikler

### 1. **Backend Bulk Update Endpoint'i**
- **Sorun:** Orders sayfasında toplu durum güncelleme için backend endpoint'i yok
- **Mevcut:** Frontend'de Promise.all ile her sipariş için ayrı API call yapılıyor
- **Çözüm:** Backend'de `/api/orders/bulk-update` endpoint'i eklenmeli

### 2. **Excel Export Kütüphanesi**
- **Sorun:** `xlsx` kütüphanesi package.json'da yok
- **Mevcut:** export.ts'de xlsx import var ama kütüphane yüklü değil
- **Çözüm:** `npm install xlsx` yapılmalı

### 3. **Barkod Oluşturma Kütüphanesi**
- **Sorun:** PrintLabel'da barkod SVG oluşturma yok, sadece placeholder
- **Mevcut:** `<svg id="barcode-${data.sku}"></svg>` boş
- **Çözüm:** `jsbarcode` veya benzeri kütüphane eklenmeli

## 🟡 Orta Öncelikli Eksikler

### 4. **AdvancedFilters - Category Options**
- **Sorun:** Products sayfasında category filtreleri boş array
- **Mevcut:** `options: []` şeklinde boş
- **Çözüm:** Kategoriler API'den çekilmeli

### 5. **NotificationCenter - API Entegrasyonu**
- **Sorun:** Sadece localStorage kullanıyor, gerçek API yok
- **Mevcut:** LocalStorage ile manuel yönetim
- **Çözüm:** Backend notification API'si eklenmeli

### 6. **Rapor Zamanlama UI**
- **Sorun:** Backend cron jobs var ama frontend UI yok
- **Mevcut:** Backend'de zamanlanmış görevler çalışıyor
- **Çözüm:** Frontend'de rapor zamanlama sayfası oluşturulmalı

## 📋 Düzeltme Listesi

1. ✅ Backend bulk update endpoint ekle
2. ✅ xlsx kütüphanesi ekle
3. ✅ jsbarcode kütüphanesi ekle
4. ✅ Category options doldur
5. ⚠️ Notification API (ileride)
6. ⚠️ Rapor zamanlama UI (ileride)

