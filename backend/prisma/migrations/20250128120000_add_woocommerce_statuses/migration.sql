-- AlterEnum
-- This migration adds WooCommerce order statuses to OrderStatus enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "OrderStatus" ADD VALUE 'WC_PENDING';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_ON_HOLD';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_COMPLETED';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_CANCELLED';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_REFUNDED';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_FAILED';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_SHIPPED';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE 'WC_TRASH';

