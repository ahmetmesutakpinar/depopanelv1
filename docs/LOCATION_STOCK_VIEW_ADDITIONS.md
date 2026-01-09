# Lokasyon Stok Görüntüleme Eklentileri

## Locations.tsx Sayfasına Eklenecekler

### 1. Depo Bazlı Stok Görüntüleme Query'si
```typescript
// Depo bazlı tüm lokasyonlar ve stokları
const { data: warehouseStockData, isLoading: isLoadingStock } = useQuery({
  queryKey: ['warehouse-location-stock', selectedWarehouseId],
  queryFn: () => api.getWarehouseLocationStock(selectedWarehouseId),
  enabled: !!selectedWarehouseId && viewMode === 'stock',
});
```

### 2. View Mode Toggle Butonu
Header'a eklenecek:
```tsx
<div className="flex items-center gap-2">
  <Button
    variant={viewMode === 'list' ? 'primary' : 'secondary'}
    size="sm"
    onClick={() => setViewMode('list')}
    leftIcon={<List className="w-4 h-4" />}
  >
    Liste
  </Button>
  <Button
    variant={viewMode === 'stock' ? 'primary' : 'secondary'}
    size="sm"
    onClick={() => setViewMode('stock')}
    leftIcon={<Package className="w-4 h-4" />}
  >
    Stok Görünümü
  </Button>
</div>
```

### 3. Stok Görünümü UI
"Hangi lokasyonda hangi üründen kaç tane" görüntüleme kartları

### 4. Lokasyon Detay Modal
Stok detaylarını gösteren modal

