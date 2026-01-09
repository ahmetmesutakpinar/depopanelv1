-- ============================================
-- ROLLBACK: Remove Barcode Uniqueness Index
-- ============================================
-- Use this ONLY if you need to remove the unique constraint
-- WARNING: This will allow duplicate barcodes again!
-- ============================================

DROP INDEX CONCURRENTLY IF EXISTS products_company_barcode_unique;

