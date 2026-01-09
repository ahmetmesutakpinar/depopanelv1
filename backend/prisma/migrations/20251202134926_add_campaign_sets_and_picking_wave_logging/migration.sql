-- AlterTable
ALTER TABLE "picking_waves" ADD COLUMN     "pickedAt" TIMESTAMP(3),
ADD COLUMN     "pickedById" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "shippedById" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isCampaignProduct" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "campaign_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_set_items" (
    "id" TEXT NOT NULL,
    "campaignSetId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_set_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_stocks" (
    "id" TEXT NOT NULL,
    "campaignSetId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_sets_companyId_idx" ON "campaign_sets"("companyId");

-- CreateIndex
CREATE INDEX "campaign_sets_isActive_idx" ON "campaign_sets"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_sets_companyId_sku_key" ON "campaign_sets"("companyId", "sku");

-- CreateIndex
CREATE INDEX "campaign_set_items_campaignSetId_idx" ON "campaign_set_items"("campaignSetId");

-- CreateIndex
CREATE INDEX "campaign_set_items_productId_idx" ON "campaign_set_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_set_items_campaignSetId_productId_variantId_key" ON "campaign_set_items"("campaignSetId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "campaign_stocks_campaignSetId_idx" ON "campaign_stocks"("campaignSetId");

-- CreateIndex
CREATE INDEX "campaign_stocks_warehouseId_idx" ON "campaign_stocks"("warehouseId");

-- CreateIndex
CREATE INDEX "campaign_stocks_locationId_idx" ON "campaign_stocks"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_stocks_campaignSetId_warehouseId_locationId_key" ON "campaign_stocks"("campaignSetId", "warehouseId", "locationId");

-- CreateIndex
CREATE INDEX "picking_waves_pickedById_idx" ON "picking_waves"("pickedById");

-- CreateIndex
CREATE INDEX "picking_waves_shippedById_idx" ON "picking_waves"("shippedById");

-- AddForeignKey
ALTER TABLE "picking_waves" ADD CONSTRAINT "picking_waves_pickedById_fkey" FOREIGN KEY ("pickedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_waves" ADD CONSTRAINT "picking_waves_shippedById_fkey" FOREIGN KEY ("shippedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_sets" ADD CONSTRAINT "campaign_sets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_set_items" ADD CONSTRAINT "campaign_set_items_campaignSetId_fkey" FOREIGN KEY ("campaignSetId") REFERENCES "campaign_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_set_items" ADD CONSTRAINT "campaign_set_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_set_items" ADD CONSTRAINT "campaign_set_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_stocks" ADD CONSTRAINT "campaign_stocks_campaignSetId_fkey" FOREIGN KEY ("campaignSetId") REFERENCES "campaign_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_stocks" ADD CONSTRAINT "campaign_stocks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_stocks" ADD CONSTRAINT "campaign_stocks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
