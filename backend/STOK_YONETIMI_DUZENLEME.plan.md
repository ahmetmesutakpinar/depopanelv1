# Sipariş Durumlarına Göre Stok Yönetimi Düzenlemesi

## Mevcut Sorun

Sistemde şu anda tüm siparişler oluşturulduğunda stoktan düşüyor, ancak kullanıcı sadece "hazırlanıyor" durumuna geldiğinde stok düşmesini istiyor. Ayrıca iptal ve iade durumlarında stok geri eklenmeli.

## Mevcut Durum

1. **Sipariş Oluşturulduğunda** (`job-order-sync.ts` satır 1477-1492):
   - Her sipariş oluşturulduğunda `StockLogType.OUT` ile stok düşüyor
   - Durum kontrolü yapılmıyor

2. **Durum Değişikliklerinde** (`job-order-sync.ts` satır 736-740):
   - Sadece `CANCELLED` ve `RETURNED` durumlarında stok geri ekleniyor
   - WooCommerce durumları (`WC_CANCELLED`, `WC_REFUNDED`, `WC_FAILED`) kontrol edilmiyor
   - "Hazırlanıyor" durumuna geçişte stok düşüşü yapılmıyor

## Planlanan Değişiklikler

### 1. Stok Düşüş Durumlarını Belirleme

**Hedef**: Sadece belirli durumlarda stok düşsün

**Durumlar** (kullanıcı seçimi: `processing_and_paid`):
- `PROCESSING` - Paketlendi
- `WC_PROCESSING` - Hazırlanıyor (WooCommerce)
- `PAID` - Ödendi

**Değişiklikler**:
- `backend/src/utils/job-order-sync.ts` - Yeni helper fonksiyon ekle:
  - `isProcessingStatus(status: OrderStatus): boolean` - Stok düşüşü gereken durumları kontrol et

### 2. Stok Geri Ekleme Durumlarını Belirleme

**Hedef**: İptal, iade ve başarısız durumlarda stok geri eklensin

**Durumlar** (varsayılan: tüm iptal/iade durumları):
- `CANCELLED` - İptal Edildi
- `WC_CANCELLED` - İptal Edildi (WooCommerce)
- `RETURNED` - İade Edildi
- `WC_REFUNDED` - İade Edildi (WooCommerce)
- `WC_FAILED` - Başarısız (WooCommerce)

**Değişiklikler**:
- `backend/src/utils/job-order-sync.ts` - Yeni helper fonksiyon ekle:
  - `isCancelledOrRefundedStatus(status: OrderStatus): boolean` - Stok geri ekleme gereken durumları kontrol et

### 3. Sipariş Oluşturulduğunda Stok Yönetimi

**Hedef**: Sipariş oluşturulurken sadece "hazırlanıyor" durumundaysa stok düşsün

**Değişiklikler**:
- `backend/src/utils/job-order-sync.ts` - `syncIntegrationOrders` fonksiyonu (satır ~1114-1501):
  - Sipariş oluşturulduktan sonra durum kontrolü yap
  - Eğer durum `isProcessingStatus()` içindeyse stok düş
  - Eğer durum `isCancelledOrRefundedStatus()` içindeyse stok düşme

**Kurallar**:
- Sipariş oluşturulurken durum "hazırlanıyor" değilse stok düşmesin
- Sipariş oluşturulurken durum "iptal/iade" ise hiçbir stok işlemi yapılmasın

### 4. Durum Değişikliklerinde Stok Yönetimi

**Hedef**: Durum değiştiğinde stok hareketleri doğru yapılsın

**Değişiklikler**:
- `backend/src/utils/job-order-sync.ts` - Mevcut sipariş güncelleme kısmı (satır ~726-760):
  - Eski durumdan yeni duruma geçişte stok hareketlerini kontrol et
  - Senaryolar:
    1. **Yeni durum "hazırlanıyor" ve eski durum değil**: Stok düş
    2. **Eski durum "hazırlanıyor" ve yeni durum "iptal/iade"**: Stok geri ekle
    3. **Eski durum "iptal/iade" ve yeni durum "hazırlanıyor"**: Stok düş
    4. **Diğer durumlar**: Stok hareketi yok

**Kurallar**:
- Durum "hazırlanıyor"a geçtiğinde stok düşsün (daha önce düşmemişse)
- Durum "iptal/iade"ye geçtiğinde stok geri eklensin (daha önce düşmüşse)
- Durum "iptal/iade"den "hazırlanıyor"a geçtiğinde tekrar stok düşsün

### 5. Stok Düşüş Fonksiyonu

**Hedef**: Stok düşüş işlemini merkezileştir

**Değişiklikler**:
- `backend/src/utils/job-order-sync.ts` - Yeni fonksiyon ekle:
  - `deductOrderStock(order: any, integration: any, defaultWarehouse: any): Promise<void>`
  - Sipariş item'ları için stok düşüşü yap
  - `StockLogType.OUT` ile log oluştur
  - Set ürünleri için component stoklarını da düş
  - Çift düşüş kontrolü yap (idempotency check)

**Kullanım**:
- Sipariş oluşturulduğunda (durum kontrolü ile)
- Durum "hazırlanıyor"a geçtiğinde

### 6. Stok Geri Ekleme Fonksiyonu Güncelleme

**Hedef**: Mevcut `handleOrderCancellation` fonksiyonunu genişlet

**Değişiklikler**:
- `backend/src/utils/job-order-sync.ts` - `handleOrderCancellation` fonksiyonu (satır 137-255):
  - Fonksiyon adını `restoreOrderStock` olarak değiştir (daha genel)
  - WooCommerce durumlarını da kontrol et (`WC_CANCELLED`, `WC_REFUNDED`, `WC_FAILED`)
  - Sadece daha önce stok düşmüş siparişler için stok geri ekle

**Kurallar**:
- Sipariş item'ları için stok geri ekle
- `StockLogType.RETURN` ile log oluştur
- Set ürünleri için component stoklarını da geri ekle

### 7. Stok Hareketi Kontrolü

**Hedef**: Aynı sipariş için çift stok düşüşü/ekleme önle

**Değişiklikler**:
- `backend/src/utils/job-order-sync.ts` - Stok hareketi kontrolü:
  - `StockLog` tablosunda sipariş için daha önce stok düşüşü yapılmış mı kontrol et
  - Eğer yapılmışsa tekrar düşme (idempotency check - satır 1335'te mevcut)
  - Stok geri ekleme yapılırken de kontrol et (çift ekleme önle)

**Kurallar**:
- Her sipariş için sadece bir kez stok düşüşü yapılabilir (durum değişikliği hariç)
- Stok geri ekleme yapıldıktan sonra tekrar "hazırlanıyor"a geçerse stok tekrar düşebilir

## Veri Akışı

### Yeni Sipariş Oluşturulduğunda

```
1. Sipariş oluşturulur
2. Durum kontrol edilir:
   - Eğer durum "hazırlanıyor" (PROCESSING, WC_PROCESSING, PAID):
     → Stok düş (StockLogType.OUT)
   - Eğer durum "iptal/iade" (CANCELLED, WC_CANCELLED, RETURNED, WC_REFUNDED, WC_FAILED):
     → Stok düşme
   - Diğer durumlar:
     → Stok düşme
```

### Durum Değişikliğinde

```
1. Eski durum ve yeni durum kontrol edilir
2. Senaryolar:
   a) Yeni durum "hazırlanıyor" ve eski durum değil:
      → Stok düş (daha önce düşmemişse)
   b) Eski durum "hazırlanıyor" ve yeni durum "iptal/iade":
      → Stok geri ekle (daha önce düşmüşse)
   c) Eski durum "iptal/iade" ve yeni durum "hazırlanıyor":
      → Stok düş
   d) Diğer durumlar:
      → Stok hareketi yok
```

## Test Senaryoları

1. **Yeni Sipariş - Hazırlanıyor Durumu**:
   - Sipariş `WC_PROCESSING` durumunda oluşturulur
   - Stok düşmeli

2. **Yeni Sipariş - İptal Durumu**:
   - Sipariş `WC_CANCELLED` durumunda oluşturulur
   - Stok düşmemeli

3. **Durum Değişikliği - Hazırlanıyor'a Geçiş**:
   - Sipariş `WC_PENDING` durumunda oluşturulur (stok düşmez)
   - Durum `WC_PROCESSING`'e güncellenir
   - Stok düşmeli

4. **Durum Değişikliği - İptal'e Geçiş**:
   - Sipariş `WC_PROCESSING` durumunda oluşturulur (stok düşer)
   - Durum `WC_CANCELLED`'e güncellenir
   - Stok geri eklenmeli

5. **Durum Değişikliği - İptal'den Hazırlanıyor'a**:
   - Sipariş `WC_CANCELLED` durumunda oluşturulur (stok düşmez)
   - Durum `WC_PROCESSING`'e güncellenir
   - Stok düşmeli

## Dosyalar

### Backend

- `backend/src/utils/job-order-sync.ts` - Sipariş sync ve stok yönetimi
  - `isProcessingStatus()` - Yeni helper fonksiyon
  - `isCancelledOrRefundedStatus()` - Yeni helper fonksiyon
  - `deductOrderStock()` - Yeni stok düşüş fonksiyonu
  - `restoreOrderStock()` - Güncellenmiş stok geri ekleme fonksiyonu (eski `handleOrderCancellation`)
  - `syncIntegrationOrders()` - Sipariş oluşturma kısmı güncellenecek
  - Durum güncelleme kısmı güncellenecek

## Notlar

- Stok düşüşü sadece "hazırlanıyor" durumlarında yapılmalı
- İptal/iade durumlarında stok geri eklenmeli
- Çift stok düşüşü/ekleme önlenmeli
- Set ürünleri için component stokları da yönetilmeli
- WooCommerce durumları (`WC_*`) da kontrol edilmeli

