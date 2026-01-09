-- ============================================
-- POST-CHECK: Test Barcode Uniqueness Index
-- ============================================

-- 1. Verify index exists
SELECT 
    indexname,
    indexdef,
    CASE 
        WHEN indexname = 'products_company_barcode_unique' THEN '✅ Index exists'
        ELSE '❌ Index not found'
    END as status
FROM pg_indexes
WHERE tablename = 'products' 
  AND indexname = 'products_company_barcode_unique';

-- 2. Get a sample company and barcode for testing
-- (We'll use this in the actual test)
SELECT 
    "companyId",
    "barcode"
FROM products
WHERE "barcode" IS NOT NULL
LIMIT 1;

