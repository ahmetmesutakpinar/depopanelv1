-- Verify the unique index exists
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'products' 
  AND indexname = 'products_company_barcode_unique';

