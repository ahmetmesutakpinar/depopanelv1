# Entegrasyon Test Senaryoları

Bu dosya, uygulamanın tüm bileşenlerinin birbirleriyle doğru şekilde etkileşim içinde çalıştığını test etmek için hazırlanmıştır.

## Test Senaryoları

### 1. Sipariş Gelişi ve Sepet Hazırlama Akışı

#### Senaryo 1.1: Marketplace'den Sipariş Gelmesi
1. **Ön Koşul**: 
   - Marketplace entegrasyonu aktif
   - Ürünler stokta mevcut
   - Depo tanımlı

2. **Adımlar**:
   - Marketplace'den yeni sipariş gelir
   - Sipariş `PENDING` durumunda oluşturulur
   - **Kontrol**: Stok düşmez (sadece sipariş oluşturulur)

3. **Beklenen Sonuç**:
   - ✅ Sipariş `PENDING` durumunda
   - ✅ Stok miktarı değişmez
   - ✅ Sipariş "Sipariş Hazırlama" sayfasında görünür

#### Senaryo 1.2: Manuel Sipariş Oluşturma
1. **Ön Koşul**: 
   - Ürünler stokta mevcut
   - Depo tanımlı

2. **Adımlar**:
   - Yeni sipariş manuel olarak oluşturulur
   - Sipariş `PENDING` durumunda oluşturulur
   - **Kontrol**: Stok düşmez

3. **Beklenen Sonuç**:
   - ✅ Sipariş `PENDING` durumunda
   - ✅ Stok miktarı değişmez
   - ✅ Sipariş "Sipariş Hazırlama" sayfasında görünür

---

### 2. Barkod Okutma ve Stok Düşürme Akışı

#### Senaryo 2.1: Tek Ürün Barkod Okutma
1. **Ön Koşul**: 
   - Sipariş `PENDING` durumunda
   - Ürün stokta mevcut (örnek: 10 adet)
   - Siparişte 1 ürün var

2. **Adımlar**:
   - Sipariş seçilir
   - Ürün barkodu okutulur
   - Backend'e `POST /api/orders/:id/scan-item` çağrısı yapılır

3. **Beklenen Sonuç**:
   - ✅ Stok 10'dan 9'a düşer
   - ✅ StockLog oluşturulur (type: OUT)
   - ✅ Frontend'de scannedQty artar
   - ✅ Raporlarda stok hareketi görünür

#### Senaryo 2.2: Çoklu Ürün Barkod Okutma
1. **Ön Koşul**: 
   - Sipariş `PENDING` durumunda
   - Ürün A: 10 adet stokta
   - Ürün B: 5 adet stokta
   - Siparişte: Ürün A'dan 3, Ürün B'den 2 adet

2. **Adımlar**:
   - Sipariş seçilir
   - Ürün A barkodu 3 kez okutulur
   - Ürün B barkodu 2 kez okutulur

3. **Beklenen Sonuç**:
   - ✅ Ürün A stoku: 10 → 9 → 8 → 7
   - ✅ Ürün B stoku: 5 → 4 → 3
   - ✅ Her okutma için StockLog oluşturulur
   - ✅ Tüm ürünler tamamlandığında sipariş tamamlanabilir

#### Senaryo 2.3: Location Bazlı Stok Düşürme
1. **Ön Koşul**: 
   - Sipariş `PENDING` durumunda
   - Ürün A: Raf-1'de 5 adet, Raf-2'de 5 adet
   - Location ID: "raf-1-id"

2. **Adımlar**:
   - Sipariş seçilir
   - Location ID ile birlikte barkod okutulur
   - `POST /api/orders/:id/scan-item` { barcode, locationId }

3. **Beklenen Sonuç**:
   - ✅ Önce location bazlı stok kontrol edilir
   - ✅ Raf-1'deki stok düşer (5 → 4)
   - ✅ Raf-2'deki stok değişmez
   - ✅ StockLog'da locationId kaydedilir

#### Senaryo 2.4: Location Yoksa Warehouse Bazlı Stok Düşürme
1. **Ön Koşul**: 
   - Sipariş `PENDING` durumunda
   - Ürün A: Warehouse seviyesinde 10 adet (location yok)

2. **Adımlar**:
   - Sipariş seçilir
   - Location ID olmadan barkod okutulur

3. **Beklenen Sonuç**:
   - ✅ Location bazlı stok bulunamaz
   - ✅ Warehouse bazlı stok bulunur ve düşer
   - ✅ Stok 10'dan 9'a düşer

#### Senaryo 2.5: Yetersiz Stok Durumu
1. **Ön Koşul**: 
   - Sipariş `PENDING` durumunda
   - Ürün A: 0 adet stokta

2. **Adımlar**:
   - Sipariş seçilir
   - Ürün A barkodu okutulur

3. **Beklenen Sonuç**:
   - ✅ Hata mesajı: "Yetersiz stok"
   - ✅ Stok düşmez
   - ✅ StockLog oluşturulmaz
   - ✅ Frontend'de hata gösterilir

#### Senaryo 2.6: Siparişte Olmayan Barkod
1. **Ön Koşul**: 
   - Sipariş `PENDING` durumunda
   - Siparişte Ürün A var

2. **Adımlar**:
   - Sipariş seçilir
   - Siparişte olmayan Ürün B barkodu okutulur

3. **Beklenen Sonuç**:
   - ✅ Hata mesajı: "Barkod siparişte bulunamadı"
   - ✅ Stok düşmez
   - ✅ Frontend'de hata gösterilir

---

### 3. Sipariş Tamamlama ve Durum Güncelleme

#### Senaryo 3.1: Sipariş Tamamlama (PENDING → PROCESSING)
1. **Ön Koşul**: 
   - Sipariş `PENDING` durumunda
   - Tüm ürünler barkod okutuldu
   - Stoklar düşürüldü

2. **Adımlar**:
   - Tüm ürünler okutuldu
   - "Siparişi Tamamla" butonuna tıklanır
   - Sipariş durumu `PROCESSING`'e güncellenir

3. **Beklenen Sonuç**:
   - ✅ Sipariş durumu `PROCESSING`
   - ✅ Stok tekrar düşmez (zaten barkod okutulduğunda düştü)
   - ✅ Sipariş "Sipariş Hazırlama" sayfasından kalkar

#### Senaryo 3.2: Eksik Ürünle Sipariş Tamamlama Denemesi
1. **Ön Koşul**: 
   - Sipariş `PENDING` durumunda
   - Siparişte 3 ürün var
   - Sadece 2 ürün okutuldu

2. **Adımlar**:
   - "Siparişi Tamamla" butonuna tıklanır

3. **Beklenen Sonuç**:
   - ✅ Buton disabled (tüm ürünler okutulmadı)
   - ✅ Uyarı mesajı gösterilir
   - ✅ Sipariş durumu değişmez

---

### 4. Raporlara Yansıma

#### Senaryo 4.1: Stok Hareket Raporu
1. **Ön Koşul**: 
   - Sipariş oluşturuldu
   - Barkod okutuldu

2. **Adımlar**:
   - Raporlar sayfasına gidilir
   - Stok hareket raporu kontrol edilir

3. **Beklenen Sonuç**:
   - ✅ Her barkod okutma için StockLog kaydı görünür
   - ✅ Log tipi: OUT
   - ✅ Referans: Sipariş ID
   - ✅ Not: "Barkod okutma: ORDER-123 - BARCODE-456"

#### Senaryo 4.2: Sipariş Raporu
1. **Ön Koşul**: 
   - Siparişler oluşturuldu ve tamamlandı

2. **Adımlar**:
   - Raporlar sayfasına gidilir
   - Sipariş raporu kontrol edilir

3. **Beklenen Sonuç**:
   - ✅ Tamamlanan siparişler görünür
   - ✅ Sipariş durumları doğru
   - ✅ Sipariş tarihleri doğru

#### Senaryo 4.3: Stok Raporu
1. **Ön Koşul**: 
   - Barkod okutma işlemleri yapıldı

2. **Adımlar**:
   - Raporlar sayfasına gidilir
   - Stok raporu kontrol edilir

3. **Beklenen Sonuç**:
   - ✅ Güncel stok miktarları görünür
   - ✅ Stok düşüşleri doğru yansır
   - ✅ Location bazlı stoklar doğru görünür

---

### 5. İade Akışı ve Stok Artışı

#### Senaryo 5.1: İade Onayı ve Stok Artışı
1. **Ön Koşul**: 
   - Sipariş tamamlandı ve gönderildi
   - İade talebi oluşturuldu

2. **Adımlar**:
   - İade onaylanır
   - İade edilen ürünler stoka eklenir

3. **Beklenen Sonuç**:
   - ✅ Stok artar (RETURN tipi StockLog)
   - ✅ Raporlarda iade görünür
   - ✅ Location bazlı stok artışı yapılır (varsa)

---

### 6. Stok Sayımı ve Düzeltme

#### Senaryo 6.1: Stok Sayımı Onayı
1. **Ön Koşul**: 
   - Stok sayımı oluşturuldu
   - Sayım tamamlandı

2. **Adımlar**:
   - Stok sayımı onaylanır

3. **Beklenen Sonuç**:
   - ✅ Stok miktarları güncellenir
   - ✅ ADJUSTMENT tipi StockLog oluşturulur
   - ✅ Raporlarda sayım farkları görünür

---

### 7. Transfer Akışı

#### Senaryo 7.1: Depo Arası Transfer
1. **Ön Koşul**: 
   - İki depo mevcut
   - Kaynak depoda stok var

2. **Adımlar**:
   - Transfer oluşturulur
   - Transfer onaylanır

3. **Beklenen Sonuç**:
   - ✅ Kaynak depo stoku düşer
   - ✅ Hedef depo stoku artar
   - ✅ TRANSFER tipi StockLog oluşturulur
   - ✅ Raporlarda transfer görünür

---

## Test Kontrol Listesi

### Backend Testleri
- [ ] Sipariş oluşturulduğunda stok düşmez
- [ ] Barkod okutulduğunda stok düşer
- [ ] Location bazlı stok düşürme çalışır
- [ ] Warehouse bazlı stok düşürme çalışır (location yoksa)
- [ ] Yetersiz stok kontrolü çalışır
- [ ] StockLog oluşturulur
- [ ] Sipariş durumu güncellenirken stok tekrar düşmez
- [ ] İade onayında stok artar
- [ ] Stok sayımı onayında stok güncellenir
- [ ] Transfer işleminde stok doğru güncellenir

### Frontend Testleri
- [ ] Sipariş listesi doğru görünür
- [ ] Barkod okutma çalışır
- [ ] Stok düşüşü gerçek zamanlı görünür
- [ ] Hata mesajları doğru gösterilir
- [ ] Sipariş tamamlama butonu doğru çalışır
- [ ] Raporlar doğru verileri gösterir

### Entegrasyon Testleri
- [ ] Sipariş → Barkod Okutma → Stok Düşürme → Rapor akışı çalışır
- [ ] Location bazlı stok yönetimi çalışır
- [ ] Çoklu sipariş senaryosu çalışır
- [ ] Eşzamanlı işlemler çalışır (race condition yok)

---

## Test Verileri

### Örnek Ürünler
```
Ürün A:
- SKU: PROD-A-001
- Barcode: 1234567890123
- Stok: 10 adet
- Location: Raf-1 (5 adet), Raf-2 (5 adet)

Ürün B:
- SKU: PROD-B-001
- Barcode: 9876543210987
- Stok: 5 adet
- Location: Yok (warehouse seviyesinde)
```

### Örnek Siparişler
```
Sipariş 1:
- Durum: PENDING
- Ürünler: Ürün A (3 adet), Ürün B (2 adet)

Sipariş 2:
- Durum: PENDING
- Ürünler: Ürün A (2 adet)
```

---

## Hata Senaryoları ve Beklenen Davranışlar

1. **Yetersiz Stok**: Hata mesajı gösterilir, stok düşmez
2. **Siparişte Olmayan Barkod**: Hata mesajı gösterilir, stok düşmez
3. **Sipariş Durumu Değişikliği**: PENDING olmayan siparişler için barkod okutma engellenir
4. **Location Bulunamadı**: Warehouse bazlı stok kullanılır
5. **Eşzamanlı İşlemler**: Transaction kullanılarak race condition önlenir

---

## Performans Testleri

- [ ] 100 sipariş için barkod okutma süresi < 10 saniye
- [ ] 1000 StockLog kaydı için rapor oluşturma süresi < 5 saniye
- [ ] Eşzamanlı 10 barkod okutma işlemi sorunsuz çalışır

---

## Notlar

- Tüm stok işlemleri transaction içinde yapılmalı
- StockLog her stok değişikliğinde oluşturulmalı
- Location bazlı stok öncelikli olarak kontrol edilmeli
- Raporlar gerçek zamanlı verileri göstermeli
- Hata durumlarında kullanıcıya anlamlı mesajlar gösterilmeli

