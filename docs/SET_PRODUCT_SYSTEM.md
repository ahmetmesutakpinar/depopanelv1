# SET Ürün Sistemi - Kapsamlı Dokümantasyon

## 1. Temel Kavram

**Set ürün**, birden fazla basit ürünün (SIMPLE/PRODUCT) birleşiminden oluşan paket/bundle ürünlerdir.

### Örnek Senaryo
- **Set Ürün:** "Kahvaltı Paketi" (SKU: SET-KAHVALTI-001)
- **Bileşenler:**
  - Peynir (SKU: PEYNIR-001) → 2 adet
  - Zeytin (SKU: ZEYTIN-001) → 1 adet
  - Ekmek (SKU: EKMEK-001) → 1 adet

---

## 2. Veritabanı Yapısı

### Model İlişkileri

```
Product (type: 'SET')
  └── ProductSetItem[] (Set'in bileşenleri)
       ├── componentProductId (Hangi ürün)
       ├── componentSku (Hızlı lookup için)
       └── quantity (Set başına kaç adet)

SetStock (Hazır paketlenmiş SET stokları)
  ├── setProductId
  ├── warehouseId
  ├── locationId (opsiyonel)
  ├── quantity (Hazır paket miktarı)
  └── reservedQty (Rezerve edilmiş miktar)
```

### Prisma Schema

```prisma
model Product {
  id          String          @id
  sku         String
  name        String
  type        ProductType     @default(PRODUCT)  // PRODUCT veya SET
  setItems    ProductSetItem[] @relation("SetProduct")
  setStocks   SetStock[]
  // ... diğer alanlar
}

model ProductSetItem {
  id                 String   @id
  setProductId       String
  componentProductId String
  componentSku       String
  quantity           Int      // Set başına kaç adet
  setProduct         Product   @relation("SetProduct")
  componentProduct   Product   @relation("ComponentProduct")
}

model SetStock {
  id          String   @id
  setProductId String
  warehouseId  String
  locationId   String?
  quantity     Int      @default(0)
  reservedQty  Int      @default(0)
  setProduct  Product
  warehouse   Warehouse
  location    Location?
}
```

---

## 3. Stok Hesaplama Mantığı

SET ürünün stoku, bileşenlerin stoklarına göre **dinamik olarak** hesaplanır.

### Algoritma

```typescript
function calculateSetStock(setProduct: Product): number {
  // 1. Her bileşen için: "Bu bileşenden kaç set yapılabilir?" hesaplanır
  const setsFromComponents = setProduct.setItems.map(item => {
    const componentStock = getComponentStock(item.componentProductId);
    const availableStock = componentStock.quantity - componentStock.reservedQty;
    // Set başına kaç adet gerekiyor?
    const setsPossible = Math.floor(availableStock / item.quantity);
    return setsPossible;
  });

  // 2. Tüm bileşenler için minimum değer alınır
  const minFromComponents = Math.min(...setsFromComponents);

  // 3. Set ürünün kendi stoku varsa, onunla da karşılaştırılır
  const setStock = getSetStock(setProduct.id);
  const availableSetStock = setStock.quantity - setStock.reservedQty;

  // 4. Sonuç: Minimum değer
  return Math.min(minFromComponents, availableSetStock);
}
```

### Örnek Hesaplama

**Kahvaltı Paketi (SET-KAHVALTI-001):**
- Peynir: 100 adet stok, set başına 2 adet → 100 / 2 = **50 set**
- Zeytin: 30 adet stok, set başına 1 adet → 30 / 1 = **30 set**
- Ekmek: 20 adet stok, set başına 1 adet → 20 / 1 = **20 set**
- **Minimum:** 20 set (en az stoklu bileşen belirler)

**Hazır paket stoku varsa:**
- Set stoku: 15 adet
- Bileşenlerden hesaplanan: 20 adet
- **Sonuç:** 15 adet (minimum değer)

---

## 4. Oluşturma ve Güncelleme

### SET Oluşturma

```typescript
// 1. Product oluştur (type: 'SET')
const setProduct = await prisma.product.create({
  data: {
    sku: 'SET-KAHVALTI-001',
    name: 'Kahvaltı Paketi',
    type: 'SET',
    companyId: companyId,
    // ... diğer alanlar
  },
});

// 2. ProductSetItem kayıtları oluştur
await prisma.productSetItem.createMany({
  data: [
    {
      setProductId: setProduct.id,
      componentProductId: peynirProduct.id,
      componentSku: 'PEYNIR-001',
      quantity: 2, // Set başına 2 adet
    },
    {
      setProductId: setProduct.id,
      componentProductId: zeytinProduct.id,
      componentSku: 'ZEYTIN-001',
      quantity: 1, // Set başına 1 adet
    },
    // ... diğer bileşenler
  ],
});
```

### SET Güncelleme

```typescript
// 1. Product güncellenir
await prisma.product.update({
  where: { id: setProductId },
  data: { name: 'Yeni Ad', price: 99.99 },
});

// 2. Mevcut ProductSetItem kayıtları silinir
await prisma.productSetItem.deleteMany({
  where: { setProductId },
});

// 3. Yeni bileşenler eklenir
await prisma.productSetItem.createMany({
  data: newComponents,
});
```

---

## 5. Kullanım Senaryoları

### Paket Ürünler
- "3'lü Set"
- "Hediye Paketi"
- "Kampanya Seti"

### Bundle Ürünler
- "Kahvaltı Paketi"
- "Oyun Seti"
- "Kozmetik Seti"

### Kompleks Ürünler
- Birkaç parçadan oluşan ürünler
- Montaj gerektiren ürünler

---

## 6. Önemli Kurallar

### ✅ İzin Verilenler
- Set ürünler sadece **SIMPLE (PRODUCT)** ürünleri bileşen olarak kullanabilir
- Set ürünün kendi stoku olabilir (hazır paketlenmiş setler için)
- Stok hesaplaması dinamiktir; bileşen stokları değiştikçe set stoku da güncellenir

### ❌ Kısıtlamalar
- **Set ürünler başka setlerin bileşeni olamaz** (şu an için)
- Set içinde aynı ürün birden fazla kez kullanılabilir (farklı miktarlarla)

---

## 7. Stok Yönetimi

### SET Ürün Satışı

**Durum A: Hazır Paket Stoku Var**
```typescript
// SetStock.quantity düşülür
// Component stoklara dokunulmaz
// StockLog: OUT_SET_READY
```

**Durum B: Hazır Paket Yok, Component Stok Yeterli**
```typescript
// Her bileşen için stok düşülür
// StockLog: OUT_SET_COMPONENT (components JSON ile)
```

**Durum C: Component Stok Yetersiz**
```typescript
// Hata döndürülür
// Sipariş PROCESSING'de kalır
```

### SET Paketleme/Üretim

```typescript
// Component stoklardan düşülür
// SetStock.quantity artırılır
// StockLog: PACKING_IN
```

### SET İadesi

**Senaryo 1: Kapalı Kutu (isIntact = true)**
```typescript
// SetStock.quantity artırılır
// Component stoklar değişmez
// StockLog: RETURN_SET_READY
```

**Senaryo 2: Bozuk/Eksik (isIntact = false)**
```typescript
// Component stoklara geri eklenir
// SetStock etkilenmez
// StockLog: RETURN_SET_COMPONENT
```

---

## 8. API Endpoint'leri

### SET İşlemleri

```typescript
// SET listele
GET /api/product-sets?companyId=xxx&page=1&limit=20

// SET detay getir
GET /api/product-sets/:id

// SET oluştur
POST /api/product-sets
Body: {
  sku: 'SET-KAHVALTI-001',
  name: 'Kahvaltı Paketi',
  price: 99.99,
  components: [
    { componentSku: 'PEYNIR-001', quantity: 2 },
    { componentSku: 'ZEYTIN-001', quantity: 1 },
  ]
}

// SET güncelle
PUT /api/product-sets/:id

// SET sil
DELETE /api/product-sets/:id

// SET paketleme
POST /api/product-sets/:id/pack
Body: {
  warehouseId: 'xxx',
  locationId: 'xxx',
  quantity: 10
}

// SET picking (sipariş için)
POST /api/product-sets/:id/pick
Body: {
  warehouseId: 'xxx',
  quantity: 5
}
```

---

## 9. Frontend Akışı

### Set Ürünler Sayfası
- **Dosya:** `SetUrunler.tsx`
- Tüm set ürünleri listeler
- Her set için:
  - Hazır paket stoku
  - Component stokları
  - Toplam mevcut stok (hesaplanmış)

### Set Oluştur Modal
- **Dosya:** `SetUrunOlusturModal.tsx`
- Set ürün bilgileri (SKU, ad, fiyat)
- Bileşen seçimi (dropdown'dan SIMPLE ürünler)
- Her bileşen için miktar belirleme
- Stok önizleme (dinamik hesaplama)

---

## 10. Stok Logları

### Log Tipleri

```typescript
enum StockLogType {
  OUT_SET_READY         // Hazır SET paketinden çıkış
  OUT_SET_COMPONENT     // SET alt ürünlerinden çıkış
  PACKING_IN            // SET üretimi/paketleme
  RETURN_SET_READY      // Kapalı kutu SET iadesi
  RETURN_SET_COMPONENT  // Alt ürünlerle gelen iade
}
```

### Log Yapısı

```typescript
{
  type: StockLogType.OUT_SET_COMPONENT,
  productId: componentProductId,
  quantity: 10,
  setSku: 'SET-KAHVALTI-001',
  components: [
    { sku: 'PEYNIR-001', qty: 2 },
    { sku: 'ZEYTIN-001', qty: 1 },
  ],
  note: 'SET component çıkışı',
  reference: orderId
}
```

---

## 11. Özet

**Set sistemi**, birden fazla ürünü tek bir paket olarak satmanızı sağlar:

✅ **Stok hesaplaması** bileşenlerin stoklarına göre otomatik yapılır  
✅ **En az stoklu bileşen**, set ürünün toplam stokunu belirler  
✅ **Hazır paket stoku** varsa, o da hesaba katılır  
✅ **Dinamik hesaplama** sayesinde bileşen stokları değiştikçe set stoku güncellenir  
✅ **İki seviyeli stok yönetimi**: Hazır paket + Component stokları

---

## 12. İmplementasyon Notları

### Mevcut Durum
- ✅ ProductSetItem modeli mevcut
- ✅ SetStock modeli mevcut
- ✅ SET oluşturma/güncelleme servisleri mevcut
- ✅ SET picking algoritması mevcut
- ✅ SET paketleme servisi mevcut
- ✅ SET iade servisi mevcut

### Eksik/Geliştirilebilir
- ⚠️ Dinamik stok hesaplama fonksiyonu (`calculateSetStock`) henüz implement edilmemiş
- ⚠️ Frontend'de stok önizleme (dinamik hesaplama) eklenebilir
- ⚠️ SET ürünlerin marketplace senkronizasyonu (stok hesaplama ile)

---

## 13. Kod Örnekleri

### Stok Hesaplama Fonksiyonu (Önerilen)

```typescript
// backend/src/utils/stock-calculator.ts
export async function calculateSetStock(
  setProductId: string,
  warehouseId?: string
): Promise<number> {
  const setProduct = await prisma.product.findUnique({
    where: { id: setProductId },
    include: {
      setItems: {
        include: {
          componentProduct: true,
        },
      },
      setStocks: {
        where: warehouseId ? { warehouseId } : undefined,
      },
    },
  });

  if (!setProduct || setProduct.type !== ProductType.SET) {
    throw new Error('SET ürün bulunamadı');
  }

  // 1. Her bileşen için kaç set yapılabilir?
  const setsFromComponents = await Promise.all(
    setProduct.setItems.map(async (item) => {
      const stocks = await prisma.stock.findMany({
        where: {
          productId: item.componentProductId,
          ...(warehouseId && { warehouseId }),
        },
      });

      const totalStock = stocks.reduce(
        (sum, s) => sum + s.quantity - s.reservedQty,
        0
      );

      // Set başına kaç adet gerekiyor?
      const setsPossible = Math.floor(totalStock / item.quantity);
      return setsPossible;
    })
  );

  // 2. Minimum değer
  const minFromComponents = Math.min(...setsFromComponents);

  // 3. Set ürünün kendi stoku
  const setStock = setProduct.setStocks.reduce(
    (sum, s) => sum + s.quantity - s.reservedQty,
    0
  );

  // 4. Sonuç: Minimum değer
  return Math.min(minFromComponents, setStock);
}
```

---

**Son Güncelleme:** 2024-12-XX  
**Versiyon:** 1.0

