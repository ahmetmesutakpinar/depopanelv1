import { prisma } from '../config/index.js';
import { Warehouse, Prisma } from '@prisma/client';

export interface CreateWarehouseData {
  name: string;
  code: string;
  address?: string;
  city?: string;
  isDefault?: boolean;
  companyId: string;
}

export interface UpdateWarehouseData {
  name?: string;
  code?: string;
  address?: string;
  city?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export class WarehouseRepository {
  async findById(id: string): Promise<Warehouse | null> {
    return prisma.warehouse.findUnique({
      where: { id },
    });
  }

  async findByIdAndCompany(id: string, companyId: string): Promise<Warehouse | null> {
    return prisma.warehouse.findFirst({
      where: { id, companyId },
    });
  }

  async findByCompany(companyId: string, options?: {
    skip?: number;
    take?: number;
    search?: string;
    isActive?: boolean;
  }): Promise<{ warehouses: Warehouse[]; total: number }> {
    const where: Prisma.WarehouseWhereInput = {
      companyId,
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
      ...(options?.search && {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { code: { contains: options.search, mode: 'insensitive' } },
          { city: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [warehouses, total] = await Promise.all([
      prisma.warehouse.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
      prisma.warehouse.count({ where }),
    ]);

    return { warehouses, total };
  }

  async findDefaultByCompany(companyId: string): Promise<Warehouse | null> {
    return prisma.warehouse.findFirst({
      where: { companyId, isDefault: true },
    });
  }

  async create(data: CreateWarehouseData): Promise<Warehouse> {
    // If this is marked as default, unset other defaults
    if (data.isDefault) {
      await prisma.warehouse.updateMany({
        where: { companyId: data.companyId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return prisma.warehouse.create({
      data,
    });
  }

  async update(id: string, companyId: string, data: UpdateWarehouseData): Promise<Warehouse> {
    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.warehouse.updateMany({
        where: { companyId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return prisma.warehouse.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.warehouse.delete({
      where: { id },
    });
  }

  async existsByCode(companyId: string, code: string, excludeId?: string): Promise<boolean> {
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        companyId,
        code,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    return !!warehouse;
  }

  async getActiveWarehouses(companyId: string): Promise<Warehouse[]> {
    return prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  // Depo istatistiklerini getir
  // STOCK LEDGER: Calculate from StockLog movements instead of stock.quantity
  async getWarehouseStats(warehouseId: string) {
    try {
      const [
        totalStockResult,
        productCountResult,
        locationStats,
        lowStockCountResult,
        pendingOrderCount,
      ] = await Promise.all([
        // STOCK LEDGER: Calculate total stock from movements
        prisma.$queryRaw<[{ total: bigint | number | null }]>`
          WITH stock_balances AS (
            SELECT 
              sl."productId",
              sl."variantId",
              SUM(
                CASE 
                  WHEN sl.type IN ('IN', 'RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN') 
                  THEN sl.quantity
                  WHEN sl.type IN ('OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER') 
                  THEN -sl.quantity
                  ELSE 0
                END
              ) as current_quantity
            FROM stock_logs sl
            WHERE sl."warehouseId" = ${warehouseId}::uuid
            GROUP BY sl."productId", sl."variantId"
          )
          SELECT COALESCE(SUM(sb.current_quantity), 0) as total
          FROM stock_balances sb
          WHERE sb.current_quantity > 0
        `.catch(() => [{ total: 0 }]),
        // STOCK LEDGER: Count unique products with stock > 0 from movements
        prisma.$queryRaw<[{ count: bigint }]>`
          WITH stock_balances AS (
            SELECT 
              sl."productId",
              sl."variantId",
              SUM(
                CASE 
                  WHEN sl.type IN ('IN', 'RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN') 
                  THEN sl.quantity
                  WHEN sl.type IN ('OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER') 
                  THEN -sl.quantity
                  ELSE 0
                END
              ) as current_quantity
            FROM stock_logs sl
            WHERE sl."warehouseId" = ${warehouseId}::uuid
            GROUP BY sl."productId", sl."variantId"
          )
          SELECT COUNT(DISTINCT sb."productId") as count
          FROM stock_balances sb
          WHERE sb.current_quantity > 0
        `.catch(() => [{ count: BigInt(0) }]),
        // Lokasyon istatistikleri (unchanged - uses stock table for location assignment only)
        prisma.location.findMany({
          where: { warehouseId, isActive: true },
          select: {
            id: true,
            _count: {
              select: { stocks: true },
            },
          },
        }),
        // STOCK LEDGER: Calculate low stock count from movements
        prisma.$queryRaw<[{ count: bigint }]>`
          WITH stock_balances AS (
            SELECT 
              sl."productId",
              sl."variantId",
              SUM(
                CASE 
                  WHEN sl.type IN ('IN', 'RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN') 
                  THEN sl.quantity
                  WHEN sl.type IN ('OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER') 
                  THEN -sl.quantity
                  ELSE 0
                END
              ) as current_quantity,
              MAX(s.minQuantity) as min_quantity
            FROM stock_logs sl
            LEFT JOIN stocks s ON s."productId" = sl."productId" 
              AND s."warehouseId" = sl."warehouseId" 
              AND (s."variantId" = sl."variantId" OR (s."variantId" IS NULL AND sl."variantId" IS NULL))
            WHERE sl."warehouseId" = ${warehouseId}::uuid
            GROUP BY sl."productId", sl."variantId"
          )
          SELECT COUNT(DISTINCT sb."productId") as count
          FROM stock_balances sb
          WHERE sb.current_quantity > 0 
            AND sb.min_quantity > 0 
            AND sb.current_quantity <= sb.min_quantity
        `.catch(() => [{ count: BigInt(0) }]),
        // Bekleyen sipariş sayısı (unchanged - uses Orders table)
        prisma.order.count({
          where: {
            warehouseId,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
        }),
      ]);

      const totalLocations = locationStats.length;
      const usedLocations = locationStats.filter(l => l._count.stocks > 0).length;
      const totalStock = Number(totalStockResult[0]?.total || 0);
      const productCount = Number(productCountResult[0]?.count || 0);
      const lowStockCount = Number(lowStockCountResult[0]?.count || 0);

      return {
        totalStock,
        productCount,
        totalLocations,
        usedLocations,
        locationUsagePercent: totalLocations > 0 ? Math.round((usedLocations / totalLocations) * 100) : 0,
        lowStockCount,
        pendingOrderCount,
      };
    } catch (error) {
      console.error('getWarehouseStats error:', error);
      throw error;
    }
  }

  // Tüm depoların istatistiklerini toplu getir
  async getAllWarehouseStats(companyId: string) {
    const warehouses = await prisma.warehouse.findMany({
      where: { companyId },
      select: { id: true },
    });

    const statsPromises = warehouses.map(async (w) => {
      const stats = await this.getWarehouseStats(w.id);
      return { warehouseId: w.id, ...stats };
    });

    const allStats = await Promise.all(statsPromises);
    
    // Map olarak döndür
    const statsMap: Record<string, any> = {};
    allStats.forEach(s => {
      statsMap[s.warehouseId] = s;
    });
    
    return statsMap;
  }
}

export const warehouseRepository = new WarehouseRepository();

