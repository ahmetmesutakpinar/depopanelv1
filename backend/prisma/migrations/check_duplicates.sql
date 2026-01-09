-- Precondition check: Verify no duplicate barcodes exist
SELECT "companyId", "barcode", COUNT(*) as count
FROM products
WHERE "barcode" IS NOT NULL
GROUP BY "companyId", "barcode"
HAVING COUNT(*) > 1;

