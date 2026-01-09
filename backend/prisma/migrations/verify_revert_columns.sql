-- Verify merge revert columns exist
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('mergeRevertedAt', 'mergeRevertedBy', 'mergeRevertReason')
ORDER BY column_name;

