-- ============================================
-- FINAL VERIFICATION: Barcode Protection Status
-- ============================================

-- 1. Check if index exists
SELECT 
    'Index Status' as check_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'products' 
            AND indexname = 'products_company_barcode_unique'
        ) THEN '✅ EXISTS'
        ELSE '❌ NOT FOUND'
    END as status;

-- 2. Show index definition
SELECT 
    'Index Definition' as check_type,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'products' 
  AND indexname = 'products_company_barcode_unique';

-- 3. Check for any duplicate barcodes (should be ZERO)
SELECT 
    'Duplicate Check' as check_type,
    COUNT(*) as duplicate_groups,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ NO DUPLICATES'
        ELSE '❌ ' || COUNT(*) || ' DUPLICATE GROUP(S) FOUND'
    END as status
FROM (
    SELECT "companyId", "barcode", COUNT(*) as cnt
    FROM products
    WHERE "barcode" IS NOT NULL
    GROUP BY "companyId", "barcode"
    HAVING COUNT(*) > 1
) duplicates;

-- 4. Summary
SELECT 
    'PROTECTION STATUS' as summary,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'products' 
            AND indexname = 'products_company_barcode_unique'
        ) THEN '🛡️ PROTECTED'
        ELSE '⚠️ NOT PROTECTED'
    END as final_status;

