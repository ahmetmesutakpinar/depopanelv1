# Migration Notları

## add_source_tables

Bu migration ProductSource ve OrderSource tablolarını ekler.

**Çalıştırılacak komut:**
```bash
npx prisma migrate dev --name add_source_tables
```

**Yapılan değişiklikler:**
- ProductSource modeli eklendi (ürün kaynak bilgileri için)
- OrderSource modeli eklendi (sipariş kaynak ve kargo bilgileri için)
- Product ve Order modellerine ilgili relation'lar eklendi
- MarketplaceIntegration modeline ilgili relation'lar eklendi

