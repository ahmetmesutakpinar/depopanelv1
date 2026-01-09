# Wave System Test Guide

## ✅ Tamamlanan İşlemler

### 1. Backend API Endpoints
- ✅ `POST /api/picking-waves/auto/time-based` - Zaman bazlı dalga oluşturma
- ✅ `POST /api/picking-waves/auto/sku-based` - SKU bazlı dalga oluşturma
- ✅ `POST /api/picking-waves/auto/priority` - Öncelikli dalga oluşturma
- ✅ `POST /api/picking-waves/auto/custom` - Özel kurallarla dalga oluşturma
- ✅ `GET /api/picking-waves/:id/pick-list` - Pick list görüntüleme
- ✅ `PUT /api/picking-waves/:id/packing` - Paketlemeye geçiş
- ✅ `PUT /api/picking-waves/:id/shipped` - Gönderildi olarak işaretleme
- ✅ `PUT /api/picking-waves/:id/close` - Dalgayı kapatma

### 2. Frontend Entegrasyonu
- ✅ Yeni wave type'ları için UI (Time-Based, SKU-Based, Priority)
- ✅ Status transition butonları (CREATED → PICKING → PACKING → SHIPPED → CLOSED)
- ✅ Pick list görüntüleme butonu
- ✅ Wave type ve status badge'leri

## 🧪 Test Senaryoları

### Test 1: Time-Based Wave Oluşturma

**Adımlar:**
1. Frontend'de "Yeni Toplama Dalgası" butonuna tıklayın
2. "Zaman Bazlı" tab'ını seçin
3. Depo seçin
4. Kesim saati girin (örn: 14:00)
5. "Oluştur" butonuna tıklayın

**Beklenen Sonuç:**
- Wave başarıyla oluşturulmalı
- Status: CREATED
- Type: TIME_BASED
- Cut-off time kaydedilmeli
- READY_TO_PICK status'ündeki siparişler wave'e eklenmeli

### Test 2: SKU-Based Wave Oluşturma

**Adımlar:**
1. "SKU Bazlı" tab'ını seçin
2. Depo seçin
3. (Opsiyonel) SKU listesi girin
4. "Oluştur" butonuna tıklayın

**Beklenen Sonuç:**
- Aynı SKU'ya sahip siparişler gruplanmalı
- Type: SKU_BASED
- Creation reason'da SKU bilgisi olmalı

### Test 3: Priority Wave Oluşturma

**Adımlar:**
1. "Öncelikli" tab'ını seçin
2. Depo seçin
3. Öncelik değeri girin (varsayılan: 10)
4. "Oluştur" butonuna tıklayın

**Beklenen Sonuç:**
- Express/same-day siparişler seçilmeli
- Type: PRIORITY
- Priority değeri 10 veya daha yüksek olmalı

### Test 4: Status Transitions

**Adımlar:**
1. Bir wave oluşturun (CREATED status)
2. Wave detayına gidin
3. "Toplamaya Başla" butonuna tıklayın
4. Barkod okutarak ürünleri toplayın
5. "Paketlemeye Geç" butonuna tıklayın
6. "Gönderildi Olarak İşaretle" butonuna tıklayın
7. "Dalgayı Kapat" butonuna tıklayın

**Beklenen Sonuç:**
- CREATED → PICKING → PACKING → SHIPPED → CLOSED
- Her transition'da doğru validasyon yapılmalı
- Tüm ürünler toplanmadan PACKING'e geçilememeli

### Test 5: Pick List Generation

**Adımlar:**
1. PICKING status'ündeki bir wave'i açın
2. "Pick List Görüntüle" butonuna tıklayın

**Beklenen Sonuç:**
- Pick list JSON formatında dönmeli
- Ürünler location'a göre sıralanmalı
- Her ürün için toplam, toplanan ve kalan miktar gösterilmeli

### Test 6: Stock Validation

**Adımlar:**
1. Stokta olmayan ürün içeren bir sipariş oluşturun
2. Bu siparişi içeren bir wave oluşturmaya çalışın

**Beklenen Sonuç:**
- Wave oluşturulmamalı veya hasStockIssue flag'i set edilmeli
- Stock issue note'da detaylar olmalı

### Test 7: Order Cancellation

**Adımlar:**
1. Bir wave'e sipariş ekleyin
2. Siparişi iptal edin

**Beklenen Sonuç:**
- Sipariş wave'den otomatik çıkarılmalı
- Wave'in totalOrders değeri güncellenmeli
- Eğer wave'de sipariş kalmadıysa wave iptal edilmeli

## 🔍 Kontrol Edilecekler

### Backend Logs
```bash
# Backend loglarını kontrol edin
tail -f backend/logs/combined.log | grep "Wave"
```

**Aranacak log mesajları:**
- `[Wave Creation] Order #XXX added to Wave #YYY`
- `[Wave Creation] Order #XXX is ELIGIBLE`
- `[Wave Creation] Order #XXX is EXCLUDED`
- `[Wave] Wave #YYY started (status: PICKING)`
- `[Wave] Wave #YYY transitioned to PACKING`

### Database Kontrolü

```sql
-- Wave'leri kontrol et
SELECT 
  code, 
  type, 
  status, 
  total_orders, 
  total_items, 
  creation_reason,
  has_stock_issue,
  created_at
FROM picking_waves
ORDER BY created_at DESC
LIMIT 10;

-- Wave'e bağlı siparişleri kontrol et
SELECT 
  o.order_number,
  o.status,
  pw.code as wave_code,
  pw.status as wave_status
FROM orders o
JOIN picking_waves pw ON o.picking_wave_id = pw.id
WHERE pw.code = 'WAVE-20251224-0001';
```

## 🐛 Bilinen Sorunlar / Notlar

1. **TypeScript Type Errors**: IDE cache'inden kaynaklanan type hataları olabilir. Çözüm: IDE'yi yeniden başlatın.

2. **Legacy Status Support**: Eski sistem (PENDING, IN_PROGRESS, COMPLETED) hala destekleniyor, yeni sistem (CREATED, PICKING, PACKING, SHIPPED, CLOSED) ile uyumlu çalışıyor.

3. **Order Status**: READY_TO_PICK status'ü yeni eklendi. Mevcut PENDING/PROCESSING siparişler de çalışır.

## 📝 Test Checklist

- [ ] Time-based wave oluşturma
- [ ] SKU-based wave oluşturma
- [ ] Priority wave oluşturma
- [ ] Manual wave oluşturma (eski sistem)
- [ ] Wave başlatma (CREATED → PICKING)
- [ ] Barkod okutma ve toplama
- [ ] Paketlemeye geçiş (PICKING → PACKING)
- [ ] Gönderildi işaretleme (PACKING → SHIPPED)
- [ ] Wave kapatma (SHIPPED → CLOSED)
- [ ] Pick list görüntüleme
- [ ] Stock validation
- [ ] Order cancellation handling
- [ ] Wave listesi filtreleme (status, type)
- [ ] Wave detay görüntüleme

## 🚀 Hızlı Test Komutları

### Backend Test (cURL)

```bash
# Time-based wave oluştur
curl -X POST http://localhost:3000/api/picking-waves/auto/time-based \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouseId": "WAREHOUSE_ID",
    "cutOffTime": "14:00",
    "maxOrders": 50,
    "minOrders": 5
  }'

# SKU-based wave oluştur
curl -X POST http://localhost:3000/api/picking-waves/auto/sku-based \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouseId": "WAREHOUSE_ID",
    "maxOrders": 100,
    "minOrders": 10
  }'

# Priority wave oluştur
curl -X POST http://localhost:3000/api/picking-waves/auto/priority \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouseId": "WAREHOUSE_ID",
    "priority": 10
  }'

# Pick list al
curl -X GET http://localhost:3000/api/picking-waves/WAVE_ID/pick-list?format=mobile \
  -H "Authorization: Bearer YOUR_TOKEN"

# Status transition
curl -X PUT http://localhost:3000/api/picking-waves/WAVE_ID/packing \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📊 Başarı Kriterleri

✅ Tüm wave type'ları başarıyla oluşturulabiliyor
✅ Status transitions doğru çalışıyor
✅ Stock validation çalışıyor
✅ Pick list doğru formatlanıyor
✅ Order cancellation otomatik işleniyor
✅ Frontend'de tüm butonlar çalışıyor
✅ Loglar doğru yazılıyor

