-- Add index on product_variants.barcode for faster barcode lookups
CREATE INDEX IF NOT EXISTS "product_variants_barcode_idx" ON "product_variants"("barcode");

