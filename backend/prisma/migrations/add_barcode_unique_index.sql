-- ============================================
-- FINAL DATABASE PROTECTION: Barcode Uniqueness
-- ============================================
-- This partial unique index enforces:
-- - One barcode per company (when barcode IS NOT NULL)
-- - Allows NULL barcodes (products without barcode)
-- - Allows same barcode in different companies
-- ============================================

-- Create partial unique index CONCURRENTLY (non-blocking)
-- CONCURRENTLY allows the index to be built without locking the table
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS products_company_barcode_unique
ON products ("companyId", "barcode")
WHERE "barcode" IS NOT NULL;

-- Verify index was created
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'products' 
  AND indexname = 'products_company_barcode_unique';

