-- ============================================
-- MARKETPLACE LINKS DEBUG SORGULARI
-- ============================================
-- Bu sorgular aktif entegrasyonların linklerinin neden görünmediğini bulmak için kullanılır
-- Her sorguyu sırayla çalıştırın ve sonuçları kontrol edin

-- ============================================
-- 1. AKTİF ENTEGRASYONLARI KONTROL ET
-- ============================================
-- Bu sorgu isActive=true olan tüm entegrasyonları gösterir
SELECT 
  id,
  name,
  type,
  status,
  "isActive",
  "companyId",
  "createdAt",
  "updatedAt"
FROM marketplace_integrations
WHERE "isActive" = true
ORDER BY type, name;

-- ============================================
-- 2. MARKETPLACEPRODUCT KAYITLARINI KONTROL ET
-- ============================================
-- Bu sorgu tüm MarketplaceProduct kayıtlarını ve bağlı entegrasyonları gösterir
SELECT 
  mp.id as marketplace_product_id,
  mp."productId",
  mp."integrationId",
  mp."isActive" as mp_is_active,
  mp."listingUrl",
  mp."createdAt" as mp_created_at,
  i.type as integration_type,
  i.name as integration_name,
  i.status as integration_status,
  i."isActive" as integration_is_active,
  p.name as product_name,
  p.sku as product_sku,
  p."isActive" as product_is_active,
  p."mergedIntoProductId"
FROM marketplace_products mp
LEFT JOIN marketplace_integrations i ON i.id = mp."integrationId"
LEFT JOIN products p ON p.id = mp."productId"
ORDER BY i.type, p.name;

-- ============================================
-- 3. AKTİF ENTEGRASYONLARA BAĞLI AKTİF MARKETPLACEPRODUCT KAYITLARI
-- ============================================
-- Bu sorgu sadece aktif entegrasyonlara bağlı aktif MarketplaceProduct kayıtlarını gösterir
-- Eğer bu sorgu boş dönerse, linklerin görünmemesi normaldir
SELECT 
  mp.id as marketplace_product_id,
  mp."productId",
  mp."integrationId",
  mp."isActive" as mp_is_active,
  mp."listingUrl",
  i.type as integration_type,
  i.name as integration_name,
  i.status as integration_status,
  i."isActive" as integration_is_active,
  p.name as product_name,
  p.sku as product_sku,
  p."isActive" as product_is_active,
  p."mergedIntoProductId"
FROM marketplace_products mp
JOIN marketplace_integrations i ON i.id = mp."integrationId"
JOIN products p ON p.id = mp."productId"
WHERE i."isActive" = true
  AND mp."isActive" = true
ORDER BY i.type, p.name;

-- ============================================
-- 4. ORPHANED MARKETPLACEPRODUCT KAYITLARI
-- ============================================
-- Bu sorgu inactive product'lara veya merged product'lara bağlı MarketplaceProduct kayıtlarını bulur
-- Bu kayıtlar merge sonrası orphaned kalmış olabilir
SELECT 
  mp.id as marketplace_product_id,
  mp."productId",
  mp."integrationId",
  mp."isActive" as mp_is_active,
  i.type as integration_type,
  i.name as integration_name,
  i."isActive" as integration_is_active,
  p.name as product_name,
  p.sku as product_sku,
  p."isActive" as product_is_active,
  p."mergedIntoProductId",
  CASE 
    WHEN p."isActive" = false THEN 'Product is inactive'
    WHEN p."mergedIntoProductId" IS NOT NULL THEN 'Product is merged'
    ELSE 'OK'
  END as issue_type
FROM marketplace_products mp
JOIN marketplace_integrations i ON i.id = mp."integrationId"
JOIN products p ON p.id = mp."productId"
WHERE i."isActive" = true
  AND mp."isActive" = true
  AND (p."isActive" = false OR p."mergedIntoProductId" IS NOT NULL)
ORDER BY i.type, p.name;

-- ============================================
-- 5. BELİRLİ BİR ÜRÜN İÇİN MARKETPLACE LİNKLERİ
-- ============================================
-- Bu sorgu belirli bir product için tüm marketplace linklerini gösterir
-- PRODUCT_ID'yi değiştirin
-- SELECT 
--   mp.id as marketplace_product_id,
--   mp."productId",
--   mp."integrationId",
--   mp."isActive" as mp_is_active,
--   mp."listingUrl",
--   i.type as integration_type,
--   i.name as integration_name,
--   i.status as integration_status,
--   i."isActive" as integration_is_active,
--   p.name as product_name,
--   p.sku as product_sku,
--   p."isActive" as product_is_active,
--   p."mergedIntoProductId"
-- FROM marketplace_products mp
-- JOIN marketplace_integrations i ON i.id = mp."integrationId"
-- JOIN products p ON p.id = mp."productId"
-- WHERE mp."productId" = 'PRODUCT_ID_BURAYA'
-- ORDER BY i.type;

-- ============================================
-- 6. ENTEGRASYON BAZINDA ÖZET
-- ============================================
-- Bu sorgu her entegrasyon için kaç aktif MarketplaceProduct kaydı olduğunu gösterir
SELECT 
  i.id as integration_id,
  i.type as integration_type,
  i.name as integration_name,
  i.status as integration_status,
  i."isActive" as integration_is_active,
  COUNT(mp.id) as total_marketplace_products,
  COUNT(CASE WHEN mp."isActive" = true THEN 1 END) as active_marketplace_products,
  COUNT(CASE WHEN mp."isActive" = true AND p."isActive" = true AND p."mergedIntoProductId" IS NULL THEN 1 END) as valid_links
FROM marketplace_integrations i
LEFT JOIN marketplace_products mp ON mp."integrationId" = i.id
LEFT JOIN products p ON p.id = mp."productId"
WHERE i."isActive" = true
GROUP BY i.id, i.type, i.name, i.status, i."isActive"
ORDER BY i.type;

-- ============================================
-- 7. PRODUCTSOURCE KAYITLARI (ALTERNATİF LİNK YÖNTEMİ)
-- ============================================
-- Bu sorgu ProductSource kayıtlarını gösterir (bazı entegrasyonlar bunu kullanabilir)
SELECT 
  ps.id as product_source_id,
  ps."productId",
  ps."integrationId",
  ps."externalProductId",
  ps."externalSku",
  i.type as integration_type,
  i.name as integration_name,
  i."isActive" as integration_is_active,
  p.name as product_name,
  p.sku as product_sku,
  p."isActive" as product_is_active,
  p."mergedIntoProductId"
FROM product_sources ps
JOIN marketplace_integrations i ON i.id = ps."integrationId"
JOIN products p ON p.id = ps."productId"
WHERE i."isActive" = true
ORDER BY i.type, p.name;

