-- CreateEnum
CREATE TYPE "OrderIngestionStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "order_ingestions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "marketplace" "MarketplaceType" NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "internalOrderId" TEXT,
    "status" "OrderIngestionStatus" NOT NULL,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "order_ingestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_ingestions_companyId_idx" ON "order_ingestions"("companyId");

-- CreateIndex
CREATE INDEX "order_ingestions_marketplace_externalOrderId_idx" ON "order_ingestions"("marketplace", "externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_ingestions_internalOrderId_key" ON "order_ingestions"("internalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_ingestions_companyId_marketplace_externalOrderId_status_key" ON "order_ingestions"("companyId", "marketplace", "externalOrderId", "status");

-- AddForeignKey
ALTER TABLE "order_ingestions" ADD CONSTRAINT "order_ingestions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_ingestions" ADD CONSTRAINT "order_ingestions_internalOrderId_fkey" FOREIGN KEY ("internalOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

