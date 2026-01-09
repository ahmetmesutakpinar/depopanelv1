-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('DEDICATED', 'SHARED');

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "locationType" "LocationType" NOT NULL DEFAULT 'SHARED';

-- CreateTable
CREATE TABLE "product_location_assignments" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "locationId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_location_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_location_assignments_productId_variantId_locationId_key" ON "product_location_assignments"("productId", "variantId", "locationId");

-- AddForeignKey
ALTER TABLE "product_location_assignments" ADD CONSTRAINT "product_location_assignments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_location_assignments" ADD CONSTRAINT "product_location_assignments_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_location_assignments" ADD CONSTRAINT "product_location_assignments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
