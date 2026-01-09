-- Add merge tracking fields to products table
-- These fields track when products are merged during duplicate resolution

DO $$ 
BEGIN
  -- Add mergedIntoProductId column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'products' AND column_name = 'mergedIntoProductId') THEN
    ALTER TABLE products ADD COLUMN "mergedIntoProductId" TEXT;
  END IF;

  -- Add mergedAt column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'products' AND column_name = 'mergedAt') THEN
    ALTER TABLE products ADD COLUMN "mergedAt" TIMESTAMP(3);
  END IF;

  -- Add mergedBy column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'products' AND column_name = 'mergedBy') THEN
    ALTER TABLE products ADD COLUMN "mergedBy" TEXT;
  END IF;
END $$;

-- Add foreign key constraint for mergedIntoProductId (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_mergedIntoProductId_fkey') THEN
    ALTER TABLE products
    ADD CONSTRAINT "products_mergedIntoProductId_fkey"
    FOREIGN KEY ("mergedIntoProductId") 
    REFERENCES products(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for faster lookups of merged products
CREATE INDEX IF NOT EXISTS "products_mergedIntoProductId_idx" 
ON products("mergedIntoProductId");

-- Add index for faster lookups by merge date
CREATE INDEX IF NOT EXISTS "products_mergedAt_idx" 
ON products("mergedAt");

