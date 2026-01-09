-- Duplicate Product Detection Query
-- READ-ONLY: This query only detects duplicates, does not modify data
-- Run this query to find all products with duplicate barcodes

-- ============================================
-- Query 1: All Duplicates (All Companies)
-- ============================================
SELECT 
  p."companyId",
  p."barcode",
  ARRAY_AGG(p.id ORDER BY p."createdAt" ASC) as "productIds",
  ARRAY_AGG(p.name ORDER BY p."createdAt" ASC) as "productNames",
  ARRAY_AGG(p."createdAt" ORDER BY p."createdAt" ASC) as "createdAt",
  ARRAY_AGG(p."isActive" ORDER BY p."createdAt" ASC) as "isActive",
  COUNT(*) as count
FROM products p
WHERE p."barcode" IS NOT NULL
  AND p."barcode" != ''
GROUP BY p."companyId", p."barcode"
HAVING COUNT(*) > 1
ORDER BY p."companyId", p."barcode", MIN(p."createdAt") ASC;

-- ============================================
-- Query 2: Duplicates for Specific Company
-- ============================================
-- Replace 'YOUR_COMPANY_ID' with actual company ID
SELECT 
  p."companyId",
  p."barcode",
  ARRAY_AGG(p.id ORDER BY p."createdAt" ASC) as "productIds",
  ARRAY_AGG(p.name ORDER BY p."createdAt" ASC) as "productNames",
  ARRAY_AGG(p."createdAt" ORDER BY p."createdAt" ASC) as "createdAt",
  ARRAY_AGG(p."isActive" ORDER BY p."createdAt" ASC) as "isActive",
  COUNT(*) as count
FROM products p
WHERE p."companyId" = 'YOUR_COMPANY_ID'::uuid
  AND p."barcode" IS NOT NULL
  AND p."barcode" != ''
GROUP BY p."companyId", p."barcode"
HAVING COUNT(*) > 1
ORDER BY p."barcode", MIN(p."createdAt") ASC;

-- ============================================
-- Query 3: Simple Count of Duplicate Groups
-- ============================================
SELECT 
  COUNT(*) as duplicate_groups,
  SUM(count) as total_duplicate_products
FROM (
  SELECT 
    p."companyId",
    p."barcode",
    COUNT(*) as count
  FROM products p
  WHERE p."barcode" IS NOT NULL
    AND p."barcode" != ''
  GROUP BY p."companyId", p."barcode"
  HAVING COUNT(*) > 1
) as duplicates;

-- ============================================
-- Query 4: Duplicates by Company (Summary)
-- ============================================
SELECT 
  p."companyId",
  COUNT(DISTINCT p."barcode") as duplicate_barcodes,
  SUM(count) as total_duplicate_products
FROM (
  SELECT 
    p."companyId",
    p."barcode",
    COUNT(*) as count
  FROM products p
  WHERE p."barcode" IS NOT NULL
    AND p."barcode" != ''
  GROUP BY p."companyId", p."barcode"
  HAVING COUNT(*) > 1
) as duplicates
GROUP BY p."companyId"
ORDER BY total_duplicate_products DESC;

