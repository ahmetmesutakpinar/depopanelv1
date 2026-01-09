-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "taxRate" SET DEFAULT 20;

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "taxRate" SET DEFAULT 20;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_companyId_idx" ON "audit_logs"("companyId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "cargo_companies_companyId_idx" ON "cargo_companies"("companyId");

-- CreateIndex
CREATE INDEX "cargo_companies_isActive_idx" ON "cargo_companies"("isActive");

-- CreateIndex
CREATE INDEX "categories_companyId_idx" ON "categories"("companyId");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "companies_createdAt_idx" ON "companies"("createdAt");

-- CreateIndex
CREATE INDEX "inventory_count_items_countId_idx" ON "inventory_count_items"("countId");

-- CreateIndex
CREATE INDEX "inventory_count_items_productId_idx" ON "inventory_count_items"("productId");

-- CreateIndex
CREATE INDEX "inventory_count_items_locationId_idx" ON "inventory_count_items"("locationId");

-- CreateIndex
CREATE INDEX "inventory_counts_companyId_idx" ON "inventory_counts"("companyId");

-- CreateIndex
CREATE INDEX "inventory_counts_warehouseId_idx" ON "inventory_counts"("warehouseId");

-- CreateIndex
CREATE INDEX "inventory_counts_status_idx" ON "inventory_counts"("status");

-- CreateIndex
CREATE INDEX "inventory_counts_createdAt_idx" ON "inventory_counts"("createdAt");

-- CreateIndex
CREATE INDEX "locations_warehouseId_idx" ON "locations"("warehouseId");

-- CreateIndex
CREATE INDEX "locations_isActive_idx" ON "locations"("isActive");

-- CreateIndex
CREATE INDEX "marketplace_integrations_companyId_idx" ON "marketplace_integrations"("companyId");

-- CreateIndex
CREATE INDEX "marketplace_integrations_status_idx" ON "marketplace_integrations"("status");

-- CreateIndex
CREATE INDEX "marketplace_integrations_type_idx" ON "marketplace_integrations"("type");

-- CreateIndex
CREATE INDEX "marketplace_products_productId_idx" ON "marketplace_products"("productId");

-- CreateIndex
CREATE INDEX "marketplace_products_integrationId_idx" ON "marketplace_products"("integrationId");

-- CreateIndex
CREATE INDEX "marketplace_products_isActive_idx" ON "marketplace_products"("isActive");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE INDEX "orders_companyId_idx" ON "orders"("companyId");

-- CreateIndex
CREATE INDEX "orders_companyId_status_idx" ON "orders"("companyId", "status");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_integrationId_idx" ON "orders"("integrationId");

-- CreateIndex
CREATE INDEX "orders_warehouseId_idx" ON "orders"("warehouseId");

-- CreateIndex
CREATE INDEX "orders_pickingWaveId_idx" ON "orders"("pickingWaveId");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "orders_marketplaceOrderId_idx" ON "orders"("marketplaceOrderId");

-- CreateIndex
CREATE INDEX "picking_waves_companyId_idx" ON "picking_waves"("companyId");

-- CreateIndex
CREATE INDEX "picking_waves_warehouseId_idx" ON "picking_waves"("warehouseId");

-- CreateIndex
CREATE INDEX "picking_waves_status_idx" ON "picking_waves"("status");

-- CreateIndex
CREATE INDEX "picking_waves_assignedToId_idx" ON "picking_waves"("assignedToId");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_isActive_idx" ON "product_variants"("isActive");

-- CreateIndex
CREATE INDEX "products_companyId_idx" ON "products"("companyId");

-- CreateIndex
CREATE INDEX "products_companyId_sku_idx" ON "products"("companyId", "sku");

-- CreateIndex
CREATE INDEX "products_barcode_idx" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "return_items_returnId_idx" ON "return_items"("returnId");

-- CreateIndex
CREATE INDEX "return_items_orderItemId_idx" ON "return_items"("orderItemId");

-- CreateIndex
CREATE INDEX "returns_orderId_idx" ON "returns"("orderId");

-- CreateIndex
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- CreateIndex
CREATE INDEX "returns_createdAt_idx" ON "returns"("createdAt");

-- CreateIndex
CREATE INDEX "stock_logs_productId_idx" ON "stock_logs"("productId");

-- CreateIndex
CREATE INDEX "stock_logs_warehouseId_idx" ON "stock_logs"("warehouseId");

-- CreateIndex
CREATE INDEX "stock_logs_type_idx" ON "stock_logs"("type");

-- CreateIndex
CREATE INDEX "stock_logs_createdAt_idx" ON "stock_logs"("createdAt");

-- CreateIndex
CREATE INDEX "stock_logs_userId_idx" ON "stock_logs"("userId");

-- CreateIndex
CREATE INDEX "stocks_productId_warehouseId_idx" ON "stocks"("productId", "warehouseId");

-- CreateIndex
CREATE INDEX "stocks_warehouseId_idx" ON "stocks"("warehouseId");

-- CreateIndex
CREATE INDEX "stocks_locationId_idx" ON "stocks"("locationId");

-- CreateIndex
CREATE INDEX "stocks_quantity_idx" ON "stocks"("quantity");

-- CreateIndex
CREATE INDEX "sync_logs_companyId_idx" ON "sync_logs"("companyId");

-- CreateIndex
CREATE INDEX "sync_logs_type_idx" ON "sync_logs"("type");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_marketplace_idx" ON "sync_logs"("marketplace");

-- CreateIndex
CREATE INDEX "sync_logs_createdAt_idx" ON "sync_logs"("createdAt");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "warehouses_companyId_idx" ON "warehouses"("companyId");

-- CreateIndex
CREATE INDEX "warehouses_isActive_idx" ON "warehouses"("isActive");

-- CreateIndex
CREATE INDEX "warehouses_isDefault_idx" ON "warehouses"("isDefault");
