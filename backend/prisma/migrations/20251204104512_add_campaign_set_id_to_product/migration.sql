-- AlterTable
ALTER TABLE "products" ADD COLUMN     "campaignSetId" TEXT;

-- CreateIndex
CREATE INDEX "inventory_count_items_countId_productId_idx" ON "inventory_count_items"("countId", "productId");

-- CreateIndex
CREATE INDEX "inventory_counts_companyId_status_idx" ON "inventory_counts"("companyId", "status");

-- CreateIndex
CREATE INDEX "inventory_counts_companyId_warehouseId_idx" ON "inventory_counts"("companyId", "warehouseId");

-- CreateIndex
CREATE INDEX "order_items_orderId_productId_idx" ON "order_items"("orderId", "productId");

-- CreateIndex
CREATE INDEX "order_items_sku_idx" ON "order_items"("sku");

-- CreateIndex
CREATE INDEX "orders_companyId_createdAt_idx" ON "orders"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_companyId_integrationId_idx" ON "orders"("companyId", "integrationId");

-- CreateIndex
CREATE INDEX "picking_waves_companyId_status_idx" ON "picking_waves"("companyId", "status");

-- CreateIndex
CREATE INDEX "picking_waves_companyId_warehouseId_idx" ON "picking_waves"("companyId", "warehouseId");

-- CreateIndex
CREATE INDEX "products_companyId_isActive_idx" ON "products"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "products_companyId_type_idx" ON "products"("companyId", "type");

-- CreateIndex
CREATE INDEX "products_gtin_idx" ON "products"("gtin");

-- CreateIndex
CREATE INDEX "products_wooCommerceId_idx" ON "products"("wooCommerceId");

-- CreateIndex
CREATE INDEX "products_campaignSetId_idx" ON "products"("campaignSetId");

-- CreateIndex
CREATE INDEX "stocks_productId_variantId_idx" ON "stocks"("productId", "variantId");

-- CreateIndex
CREATE INDEX "stocks_warehouseId_locationId_idx" ON "stocks"("warehouseId", "locationId");

-- CreateIndex
CREATE INDEX "sync_logs_companyId_type_idx" ON "sync_logs"("companyId", "type");

-- CreateIndex
CREATE INDEX "sync_logs_companyId_type_createdAt_idx" ON "sync_logs"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "sync_logs_companyId_status_idx" ON "sync_logs"("companyId", "status");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_campaignSetId_fkey" FOREIGN KEY ("campaignSetId") REFERENCES "campaign_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
