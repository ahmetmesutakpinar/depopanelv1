-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "externalShipmentId" TEXT,
ADD COLUMN     "externalTrackingNumber" TEXT,
ADD COLUMN     "shippingProvider" TEXT;
