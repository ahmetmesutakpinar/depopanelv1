-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_warehouseId_fkey";

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
