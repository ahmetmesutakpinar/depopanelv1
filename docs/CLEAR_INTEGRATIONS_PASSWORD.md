# Aktif Entegrasyonları Temizleme Şifresi

## Varsayılan Şifre
Varsayılan şifre: **DEPOPANEL2024**

## Şifre Ayarını Değiştirmek

Şifre ayarını değiştirmek için Settings tablosuna kayıt ekleyin:

```sql
-- Şirket bazlı şifre ayarı
INSERT INTO settings (id, key, value, company_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'CLEAR_INTEGRATIONS_PASSWORD',
  'YENI_SIFRENIZ',
  'ŞİRKET_ID_BURAYA',
  NOW(),
  NOW()
)
ON CONFLICT (key, company_id) 
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

veya

```sql
-- Sistem geneli şifre ayarı (company_id NULL)
INSERT INTO settings (id, key, value, company_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'CLEAR_INTEGRATIONS_PASSWORD',
  'YENI_SIFRENIZ',
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (key, company_id) 
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

## Kullanım

1. Settings sayfasına gidin
2. "Aktif Entegrasyonları Temizle" butonuna tıklayın
3. Şifreyi girin (varsayılan: DEPOPANEL2024)
4. Onaylayın

**Uyarı:** Bu işlem geri alınamaz! Tüm aktif entegrasyonlar kalıcı olarak silinir.

