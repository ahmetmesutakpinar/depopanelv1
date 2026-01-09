# DepoPanel SET Ürünü Sistemi - Master Flow Dokümantasyonu

## Genel Bakış

DepoPanel'de SET ürünü sistemi, birden fazla ürünün paket halinde satılmasını sağlayan çift seviyeli stok yönetim sistemidir.

## Veritabanı Şeması

### Yeni Enum'lar

```prisma
enum ProductType {
  PRODUCT  // Normal ürün
  SET      // SET ürünü
}

enum StockLogType {
  // Mevcut tipler...
  OUT_SET_READY         // Hazır SET paketinden çıkış
  OUT_SET_COMPONENT     // SET alt ürünlerinden çıkış
  PACKING_IN            // SET üretimi/paketleme
  RETURN_SET_READY      // Kapalı kutu SET iadesi
  RETURN_SET_COMPONENT  // Alt ürünlerle gelen iade
}
```

### Yeni Modeller

#### ProductSetItem
SET içindeki ürünleri tutar:
- `setProductId`: SET ürününün ID'si
- `componentProductId`: Alt ürünün ID'si
- `componentSku`: Alt ürünün SKU'su (hızlı lookup için)
- `quantity`: SET içinde kaç adet bu üründen var

#### SetStock
SET'in hazır paket stoklarını tutar:
- `setProductId`: SET ürününün ID'si
- `warehouseId`: Depo ID'si
- `locationId`: Lokasyon ID'si (opsiyonel)
- `quantity`: Hazır paket stok miktarı
- `reservedQty`: Rezerve edilmiş SET stoğu

### Güncellenen Modeller

#### Product
- `type`: ProductType enum (PRODUCT veya SET)

#### StockLog
- `setSku`: SET SKU'su (SET ile ilgili loglar için)
- `components`: JSON - SET component bilgileri `[{ sku: string, qty: number }]`

## İş Akışları

### 1. SET Oluşturma
- SET SKU oluşturulur
- Alt ürünler seçilir ve miktarları belirlenir
- `ProductSetItem` kayıtları oluşturulur

### 2. SET Picking Algoritması

#### Durum A: SET_STOCK > 0
- Hazır paket SET'ten çıkar
- `SetStock.quantity` düşülür
- Component stoklara dokunulmaz
- StockLog: `OUT_SET_READY`

#### Durum B: SET_STOCK = 0 ama COMPONENT_STOCK yeterli
- SET alt ürünlere ayrılır
- Her alt ürün için stok düşülür
- StockLog: `OUT_SET_COMPONENT` (components JSON ile)

#### Durum C: Component stok yetersiz
- Picking durur
- Eksik ürün uyarısı
- Sipariş PROCESSING'de kalır

### 3. SET Üretimi/Paketleme
- Alt ürünlerden belirtilen miktar düşülür
- `SetStock.quantity` artırılır
- StockLog: `PACKING_IN`

### 4. SET İadesi

#### Senaryo 1: Kapalı kutu (SET bozulmamış)
- `SetStock.quantity` artırılır
- Component stoklar değişmez
- StockLog: `RETURN_SET_READY`

#### Senaryo 2: Bozuk/Eksik ürün
- Component stoklara geri eklenir
- `SetStock` etkilenmez
- StockLog: `RETURN_SET_COMPONENT`

## API Endpoint'leri (Planlanan)

- `GET /api/products/{sku}` - SET ise components bilgisi döner
- `POST /api/packing` - SET üretimi
- `POST /api/picking` - SET picking algoritması
- `POST /api/returns` - SET iadesi

## Notlar

- SET fiyatı WooCommerce/Sopyo tarafından yönetilir
- DepoPanel sadece stok hareketlerini yönetir
- SET stoğu ve component stoğu ayrı tutulur
- Her adım StockLog'a kaydedilir

