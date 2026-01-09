-- CreateTable
CREATE TABLE "product_sources" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "externalSku" TEXT,
    "externalBarcode" TEXT,
    "externalPrice" DECIMAL(10,2),
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sources" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "externalStatus" TEXT,
    "externalCustomerId" TEXT,
    "shippingProvider" TEXT,
    "shippingBarcode" TEXT,
    "shippingTrackingUrl" TEXT,
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_sources_integrationId_externalProductId_idx" ON "product_sources"("integrationId", "externalProductId");

-- CreateIndex
CREATE INDEX "product_sources_productId_idx" ON "product_sources"("productId");

-- CreateIndex
CREATE INDEX "product_sources_integrationId_idx" ON "product_sources"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "product_sources_productId_integrationId_key" ON "product_sources"("productId", "integrationId");

-- CreateIndex
CREATE INDEX "order_sources_integrationId_externalOrderId_idx" ON "order_sources"("integrationId", "externalOrderId");

-- CreateIndex
CREATE INDEX "order_sources_orderId_idx" ON "order_sources"("orderId");

-- CreateIndex
CREATE INDEX "order_sources_integrationId_idx" ON "order_sources"("integrationId");

-- CreateIndex
CREATE INDEX "order_sources_shippingBarcode_idx" ON "order_sources"("shippingBarcode");

-- CreateIndex
CREATE UNIQUE INDEX "order_sources_orderId_integrationId_key" ON "order_sources"("orderId", "integrationId");

-- AddForeignKey
ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "marketplace_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sources" ADD CONSTRAINT "order_sources_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sources" ADD CONSTRAINT "order_sources_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "marketplace_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
