-- ============================================
-- FINAL DATABASE PROTECTION: Barcode Uniqueness
-- ============================================
-- This partial unique index enforces:
-- - One barcode per company (when barcode IS NOT NULL)
-- - Allows NULL barcodes (products without barcode)
-- - Allows same barcode in different companies
-- ============================================
-- NOTE: For production, use CONCURRENTLY to avoid table locks:
-- CREATE UNIQUE INDEX CONCURRENTLY products_company_barcode_unique
-- ON products ("companyId", "barcode")
-- WHERE "barcode" IS NOT NULL;
-- ============================================

-- Create partial unique index
-- If index already exists, this will fail gracefully
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'products' 
        AND indexname = 'products_company_barcode_unique'
    ) THEN
        CREATE UNIQUE INDEX products_company_barcode_unique
        ON products ("companyId", "barcode")
        WHERE "barcode" IS NOT NULL;
        
        RAISE NOTICE 'Unique index created successfully';
    ELSE
        RAISE NOTICE 'Index already exists';
    END IF;
END $$;

