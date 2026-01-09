/*
  Warnings:

  - The `status` column on the `picking_waves` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "WaveType" AS ENUM ('TIME_BASED', 'SKU_BASED', 'PRIORITY', 'MANUAL', 'MARKETPLACE', 'SHIPPING', 'COUNTRY', 'MIXED');

-- CreateEnum
CREATE TYPE "WaveStatus" AS ENUM ('CREATED', 'PICKING', 'PACKING', 'SHIPPED', 'CLOSED', 'CANCELLED', 'EXCEPTION');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'READY_TO_PICK';

-- AlterTable
ALTER TABLE "picking_waves" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "creationReason" TEXT,
ADD COLUMN     "cutOffTime" TIMESTAMP(3),
ADD COLUMN     "hasStockIssue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rules" JSONB,
ADD COLUMN     "stockIssueNote" TEXT,
ADD COLUMN     "totalItems" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "type" "WaveType" NOT NULL DEFAULT 'MANUAL',
DROP COLUMN "status",
ADD COLUMN     "status" "WaveStatus" NOT NULL DEFAULT 'CREATED';

-- CreateIndex
CREATE INDEX "inventory_counts_companyId_type_idx" ON "inventory_counts"("companyId", "type");

-- CreateIndex
CREATE INDEX "inventory_counts_type_idx" ON "inventory_counts"("type");

-- CreateIndex
CREATE INDEX "picking_waves_companyId_status_idx" ON "picking_waves"("companyId", "status");

-- CreateIndex
CREATE INDEX "picking_waves_companyId_type_idx" ON "picking_waves"("companyId", "type");

-- CreateIndex
CREATE INDEX "picking_waves_status_idx" ON "picking_waves"("status");

-- CreateIndex
CREATE INDEX "picking_waves_type_idx" ON "picking_waves"("type");

-- CreateIndex
CREATE INDEX "picking_waves_createdAt_idx" ON "picking_waves"("createdAt");

-- CreateIndex
CREATE INDEX "picking_waves_hasStockIssue_idx" ON "picking_waves"("hasStockIssue");
