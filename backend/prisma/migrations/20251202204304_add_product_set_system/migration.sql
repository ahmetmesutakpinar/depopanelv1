-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PRODUCT', 'SET');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockLogType" ADD VALUE 'OUT_SET_READY';
ALTER TYPE "StockLogType" ADD VALUE 'OUT_SET_COMPONENT';
ALTER TYPE "StockLogType" ADD VALUE 'PACKING_IN';
ALTER TYPE "StockLogType" ADD VALUE 'RETURN_SET_READY';
ALTER TYPE "StockLogType" ADD VALUE 'RETURN_SET_COMPONENT';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "stock_logs" ADD COLUMN     "components" JSONB,
ADD COLUMN     "setSku" TEXT;

-- CreateTable
CREATE TABLE "product_set_items" (
    "id" TEXT NOT NULL,
    "setProductId" TEXT NOT NULL,
    "componentSku" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_set_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_stocks" (
    "id" TEXT NOT NULL,
    "setProductId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_set_items_setProductId_idx" ON "product_set_items"("setProductId");

-- CreateIndex
CREATE INDEX "product_set_items_componentProductId_idx" ON "product_set_items"("componentProductId");

-- CreateIndex
CREATE INDEX "product_set_items_componentSku_idx" ON "product_set_items"("componentSku");

-- CreateIndex
CREATE UNIQUE INDEX "product_set_items_setProductId_componentProductId_key" ON "product_set_items"("setProductId", "componentProductId");

-- CreateIndex
CREATE INDEX "set_stocks_setProductId_idx" ON "set_stocks"("setProductId");

-- CreateIndex
CREATE INDEX "set_stocks_warehouseId_idx" ON "set_stocks"("warehouseId");

-- CreateIndex
CREATE INDEX "set_stocks_locationId_idx" ON "set_stocks"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "set_stocks_setProductId_warehouseId_locationId_key" ON "set_stocks"("setProductId", "warehouseId", "locationId");

-- CreateIndex
CREATE INDEX "products_type_idx" ON "products"("type");

-- CreateIndex
CREATE INDEX "stock_logs_setSku_idx" ON "stock_logs"("setSku");

-- AddForeignKey
ALTER TABLE "product_set_items" ADD CONSTRAINT "product_set_items_setProductId_fkey" FOREIGN KEY ("setProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_set_items" ADD CONSTRAINT "product_set_items_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_stocks" ADD CONSTRAINT "set_stocks_setProductId_fkey" FOREIGN KEY ("setProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_stocks" ADD CONSTRAINT "set_stocks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_stocks" ADD CONSTRAINT "set_stocks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
