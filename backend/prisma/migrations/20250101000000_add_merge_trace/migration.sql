-- CreateEnum
CREATE TYPE "MergeEntityType" AS ENUM ('ORDER_ITEM', 'STOCK_LOG', 'MARKETPLACE_LINK', 'CAMPAIGN_SET_REFERENCE');

-- CreateTable
CREATE TABLE "product_merge_references" (
    "id" TEXT NOT NULL,
    "mergeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "MergeEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_merge_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_merge_references_mergeId_idx" ON "product_merge_references"("mergeId");

-- CreateIndex
CREATE INDEX "product_merge_references_entityType_entityId_idx" ON "product_merge_references"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "product_merge_references_fromProductId_idx" ON "product_merge_references"("fromProductId");

-- CreateIndex
CREATE INDEX "product_merge_references_toProductId_idx" ON "product_merge_references"("toProductId");

-- CreateIndex
CREATE INDEX "product_merge_references_companyId_idx" ON "product_merge_references"("companyId");

-- Add merge tracking columns to products table (if not already exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergedIntoProductId') THEN
        ALTER TABLE "products" ADD COLUMN "mergedIntoProductId" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergedAt') THEN
        ALTER TABLE "products" ADD COLUMN "mergedAt" TIMESTAMP(3);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergedBy') THEN
        ALTER TABLE "products" ADD COLUMN "mergedBy" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergeRevertedAt') THEN
        ALTER TABLE "products" ADD COLUMN "mergeRevertedAt" TIMESTAMP(3);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergeRevertedBy') THEN
        ALTER TABLE "products" ADD COLUMN "mergeRevertedBy" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mergeRevertReason') THEN
        ALTER TABLE "products" ADD COLUMN "mergeRevertReason" TEXT;
    END IF;
END $$;

-- Add indexes for merge tracking (if not already exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'products' AND indexname = 'products_mergedAt_idx') THEN
        CREATE INDEX "products_mergedAt_idx" ON "products"("mergedAt");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'products' AND indexname = 'products_mergedIntoProductId_idx') THEN
        CREATE INDEX "products_mergedIntoProductId_idx" ON "products"("mergedIntoProductId");
    END IF;
END $$;

-- Add foreign key constraint (if not already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'products_mergedIntoProductId_fkey'
    ) THEN
        ALTER TABLE "products" ADD CONSTRAINT "products_mergedIntoProductId_fkey" 
        FOREIGN KEY ("mergedIntoProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

