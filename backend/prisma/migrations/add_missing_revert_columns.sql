-- Add missing merge revert tracking columns to products table
-- These columns should have been added by migration 20250101000000_add_merge_trace
-- but the migration was marked as applied without executing the SQL

-- Add mergeRevertedAt column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergeRevertedAt') THEN
        ALTER TABLE "products" ADD COLUMN "mergeRevertedAt" TIMESTAMP(3);
        RAISE NOTICE 'Added column mergeRevertedAt';
    ELSE
        RAISE NOTICE 'Column mergeRevertedAt already exists';
    END IF;
END $$;

-- Add mergeRevertedBy column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergeRevertedBy') THEN
        ALTER TABLE "products" ADD COLUMN "mergeRevertedBy" TEXT;
        RAISE NOTICE 'Added column mergeRevertedBy';
    ELSE
        RAISE NOTICE 'Column mergeRevertedBy already exists';
    END IF;
END $$;

-- Add mergeRevertReason column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergeRevertReason') THEN
        ALTER TABLE "products" ADD COLUMN "mergeRevertReason" TEXT;
        RAISE NOTICE 'Added column mergeRevertReason';
    ELSE
        RAISE NOTICE 'Column mergeRevertReason already exists';
    END IF;
END $$;

-- Verify all columns exist
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('mergeRevertedAt', 'mergeRevertedBy', 'mergeRevertReason')
ORDER BY column_name;

