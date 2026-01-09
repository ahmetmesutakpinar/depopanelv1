-- Simple check for merge revert columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('mergeRevertedAt', 'mergeRevertedBy', 'mergeRevertReason');

