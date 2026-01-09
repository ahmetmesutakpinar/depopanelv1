-- Verify merge tracking columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products' 
  AND column_name IN ('mergedIntoProductId', 'mergedAt', 'mergedBy')
ORDER BY column_name;

