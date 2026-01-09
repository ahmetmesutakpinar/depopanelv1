import { prisma } from '../config/index.js';
import { Stock, StockLog, StockLogType, Prisma } from '@prisma/client';

export interface UpdateStockData {
  quantity?: number;
  reservedQty?: number;
  minQuantity?: number;
}

export interface CreateStockLogData {
  type: StockLogType;
  quantity: number;
  previousQty: number;
  newQty: number;
  note?: string;
  reference?: string;
  productId: string;
  variantId?: string;
  warehouseId: string;
  userId?: string;
}

export class StockRepository {
  // ==================== STOCK ====================

  async findStock(productId: string, warehouseId: string, variantId?: string): Promise<Stock | null> {
    return prisma.stock.findFirst({
      where: {
        productId,
        warehouseId,
        variantId: variantId || null,
      },
    });
  }

  async findOrCreateStock(productId: string, warehouseId: string, variantId?: string): Promise<Stock> {
    const existing = await this.findStock(productId, warehouseId, variantId);
    
    if (existing) {
      return existing;
    }

    return prisma.stock.create({
      data: {
        productId,
        warehouseId,
        variantId: variantId || null,
        quantity: 0,
        reservedQty: 0,
        minQuantity: 0,
      },
    });
  }

  async getProductStocks(productId: string): Promise<Stock[]> {
    return prisma.stock.findMany({
      where: { productId },
      include: {
        warehouse: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  }

  async getWarehouseStocks(warehouseId: string, options?: {
    skip?: number;
    take?: number;
    search?: string;
    lowStock?: boolean;
  }): Promise<{ stocks: any[]; total: number }> {
    const where: Prisma.StockWhereInput = {
      warehouseId,
      ...(options?.lowStock && {
        quantity: { lte: prisma.stock.fields.minQuantity },
      }),
      ...(options?.search && {
        product: {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { sku: { contains: options.search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [stocks, total] = await Promise.all([
      prisma.stock.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        include: {
          product: {
            select: { id: true, name: true, sku: true, barcode: true, imageUrl: true },
          },
          variant: {
            select: { id: true, name: true, sku: true },
          },
        },
        orderBy: { product: { name: 'asc' } },
      }),
      prisma.stock.count({ where }),
    ]);

    return { stocks, total };
  }

  async updateStock(id: string, data: UpdateStockData): Promise<Stock> {
    return prisma.stock.update({
      where: { id },
      data,
    });
  }

  /**
   * Increase stock quantity
   */
  async increaseStock(
    productId: string,
    variantId: string | undefined,
    warehouseId: string,
    quantity: number,
    locationId?: string,
    companyId?: string
  ): Promise<Stock> {
    const stock = await this.findOrCreateStock(productId, warehouseId, variantId);

    return prisma.stock.update({
      where: { id: stock.id },
      data: {
        quantity: { increment: quantity },
      },
    });
  }

  /**
   * Decrease stock quantity
   */
  /**
   * Decrease stock using StockLog-only approach
   * 
   * REFACTORED: Now uses adjustStock() with StockLogType.OUT to maintain
   * ledger-based approach and avoid direct stock.quantity mutations.
   * 
   * @param productId Product ID
   * @param variantId Optional variant ID
   * @param warehouseId Warehouse ID
   * @param quantity Quantity to decrease
   * @param locationId Optional location ID (not used in current implementation)
   * @param companyId Optional company ID (not used in current implementation)
   * @returns Updated stock
   */
  async decreaseStock(
    productId: string,
    variantId: string | undefined,
    warehouseId: string,
    quantity: number,
    locationId?: string,
    companyId?: string
  ): Promise<Stock> {
    // Check current stock before decreasing
    const stock = await this.findOrCreateStock(productId, warehouseId, variantId);

    if (stock.quantity < quantity) {
      throw new Error(`Insufficient stock: ${stock.quantity} available, ${quantity} requested`);
    }

    // Use adjustStock() with OUT type (creates StockLog entry)
    const result = await this.adjustStock(
      productId,
      warehouseId,
      quantity,
      'OUT',
      undefined, // userId
      'Stock decreased', // note
      undefined, // reference
      variantId
    );

    return result.stock;
  }

  /**
   * Adjust stock using StockLog-only approach (ledger-based)
   * 
   * REFACTORED: StockLog is now the source of truth. stock.quantity is updated
   * for backward compatibility only (deprecated field).
   * 
   * @param productId Product ID
   * @param warehouseId Warehouse ID
   * @param quantity Quantity to adjust
   * @param type StockLogType (IN, OUT, ADJUSTMENT, etc.)
   * @param userId Optional user ID
   * @param note Optional note
   * @param reference Optional reference
   * @param variantId Optional variant ID
   * @returns Updated stock and created log
   */
  async adjustStock(
    productId: string,
    warehouseId: string,
    quantity: number,
    type: StockLogType,
    userId?: string,
    note?: string,
    reference?: string,
    variantId?: string
  ): Promise<{ stock: Stock; log: StockLog }> {
    return prisma.$transaction(async (tx) => {
      // 1. Find or create stock
      let stock = await tx.stock.findFirst({
        where: {
          productId,
          warehouseId,
          variantId: variantId || null,
        },
      });

      if (!stock) {
        stock = await tx.stock.create({
          data: {
            productId,
            warehouseId,
            variantId: variantId || null,
            quantity: 0,
            reservedQty: 0,
            minQuantity: 0,
          },
        });
      }

      // 2. Calculate new quantity based on movement type
      // StockLog is the source of truth, stock.quantity is for backward compatibility
      const previousQty = stock.quantity;
      let newQty = previousQty;

      switch (type) {
        case 'IN':
        case 'RETURN':
        case 'IN_CANCEL':  // Order cancellation (stock returned)
        case 'IN_RETURN':  // Order return (stock returned)
        case 'RETURN_SET_READY':
        case 'RETURN_SET_COMPONENT':
        case 'PACKING_IN':
          newQty = previousQty + Math.abs(quantity);
          break;
        case 'OUT':
        case 'OUT_SET_READY':
        case 'OUT_SET_COMPONENT':
          newQty = Math.max(0, previousQty - Math.abs(quantity));
          break;
        case 'ADJUSTMENT':
          newQty = quantity; // Direct set
          break;
        case 'TRANSFER':
          newQty = previousQty - Math.abs(quantity); // Source warehouse
          break;
        default:
          // Unknown type, don't change quantity
          newQty = previousQty;
      }

      // 3. Create StockLog entry (IMMUTABLE LEDGER - Source of Truth)
      const log = await tx.stockLog.create({
        data: {
          type,
          quantity: Math.abs(quantity),
          previousQty,
          newQty,
          note,
          reference,
          productId,
          variantId: variantId || null,
          warehouseId,
          userId,
        },
      });

      // 4. Update stock.quantity for backward compatibility (DEPRECATED)
      // NOTE: This field is deprecated. Stock should be calculated from StockLog.
      // We update it here only to maintain compatibility with existing queries.
      const updatedStock = await tx.stock.update({
        where: { id: stock.id },
        data: { quantity: newQty },
      });

      return { stock: updatedStock, log };
    });
  }

  async transferStock(
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    userId?: string,
    note?: string,
    variantId?: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Get source stock
      const sourceStock = await tx.stock.findFirst({
        where: {
          productId,
          warehouseId: fromWarehouseId,
          variantId: variantId || null,
        },
      });

      if (!sourceStock || sourceStock.quantity < quantity) {
        throw new Error('Yetersiz stok');
      }

      // Decrease source
      await tx.stock.update({
        where: { id: sourceStock.id },
        data: { quantity: { decrement: quantity } },
      });

      // Log source
      await tx.stockLog.create({
        data: {
          type: 'TRANSFER',
          quantity,
          previousQty: sourceStock.quantity,
          newQty: sourceStock.quantity - quantity,
          note: note || `Transfer: ${toWarehouseId}`,
          productId,
          variantId: variantId || null,
          warehouseId: fromWarehouseId,
          userId,
        },
      });

      // Find or create destination stock
      let destStock = await tx.stock.findFirst({
        where: {
          productId,
          warehouseId: toWarehouseId,
          variantId: variantId || null,
        },
      });

      if (!destStock) {
        destStock = await tx.stock.create({
          data: {
            productId,
            warehouseId: toWarehouseId,
            variantId: variantId || null,
            quantity: 0,
            reservedQty: 0,
            minQuantity: 0,
          },
        });
      }

      // Increase destination
      await tx.stock.update({
        where: { id: destStock.id },
        data: { quantity: { increment: quantity } },
      });

      // Log destination
      await tx.stockLog.create({
        data: {
          type: 'IN',
          quantity,
          previousQty: destStock.quantity,
          newQty: destStock.quantity + quantity,
          note: note || `Transfer: ${fromWarehouseId}`,
          productId,
          variantId: variantId || null,
          warehouseId: toWarehouseId,
          userId,
        },
      });
    });
  }

  async transferStockBetweenLocations(
    productId: string,
    fromLocationId: string,
    toLocationId: string,
    quantity: number,
    userId?: string,
    note?: string,
    variantId?: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Get source location and stock
      const fromLocation = await tx.location.findUnique({
        where: { id: fromLocationId },
        include: { warehouse: true },
      });

      if (!fromLocation) {
        throw new Error('Kaynak lokasyon bulunamadı');
      }

      const sourceStock = await tx.stock.findFirst({
        where: {
          productId,
          warehouseId: fromLocation.warehouseId,
          locationId: fromLocationId,
          variantId: variantId || null,
        },
      });

      if (!sourceStock || sourceStock.quantity < quantity) {
        throw new Error('Yetersiz stok');
      }

      // Get destination location
      const toLocation = await tx.location.findUnique({
        where: { id: toLocationId },
        include: { warehouse: true },
      });

      if (!toLocation) {
        throw new Error('Hedef lokasyon bulunamadı');
      }

      // If locations are in different warehouses, use warehouse transfer
      if (fromLocation.warehouseId !== toLocation.warehouseId) {
        throw new Error('Farklı depolardaki lokasyonlar arasında transfer yapılamaz. Önce depo transferi yapın.');
      }

      // Decrease source stock
      await tx.stock.update({
        where: { id: sourceStock.id },
        data: { quantity: { decrement: quantity } },
      });

      // Log source
      await tx.stockLog.create({
        data: {
          type: 'TRANSFER',
          quantity,
          previousQty: sourceStock.quantity,
          newQty: sourceStock.quantity - quantity,
          note: note || `Raf transferi: ${toLocation.code}`,
          productId,
          variantId: variantId || null,
          warehouseId: fromLocation.warehouseId,
          userId,
        },
      });

      // Find or create destination stock
      let destStock = await tx.stock.findFirst({
        where: {
          productId,
          warehouseId: toLocation.warehouseId,
          locationId: toLocationId,
          variantId: variantId || null,
        },
      });

      if (!destStock) {
        destStock = await tx.stock.create({
          data: {
            productId,
            warehouseId: toLocation.warehouseId,
            locationId: toLocationId,
            variantId: variantId || null,
            quantity: 0,
            reservedQty: 0,
            minQuantity: 0,
          },
        });
      }

      // Increase destination stock
      await tx.stock.update({
        where: { id: destStock.id },
        data: { quantity: { increment: quantity } },
      });

      // Log destination
      await tx.stockLog.create({
        data: {
          type: 'IN',
          quantity,
          previousQty: destStock.quantity,
          newQty: destStock.quantity + quantity,
          note: note || `Raf transferi: ${fromLocation.code}`,
          productId,
          variantId: variantId || null,
          warehouseId: toLocation.warehouseId,
          userId,
        },
      });
    });
  }

  // ==================== STOCK LOGS ====================

  async getStockLogs(options: {
    productId?: string;
    warehouseId?: string;
    type?: StockLogType;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
  }): Promise<{ logs: StockLog[]; total: number }> {
    const where: Prisma.StockLogWhereInput = {
      ...(options.productId && { productId: options.productId }),
      ...(options.warehouseId && { warehouseId: options.warehouseId }),
      ...(options.type && { type: options.type }),
      ...(options.startDate || options.endDate
        ? {
            createdAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.stockLog.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: { id: true, name: true, sku: true },
          },
          warehouse: {
            select: { id: true, name: true, code: true },
          },
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.stockLog.count({ where }),
    ]);

    return { logs, total };
  }

  async getTotalStockValue(companyId: string): Promise<number> {
    try {
      // STOCK LEDGER: Calculate from StockLog movements instead of stock.quantity
      const result = await prisma.$queryRaw<[{ total: bigint | number | null }]>`
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
          INNER JOIN products p ON sl."productId" = p.id
          WHERE p."companyId" = ${companyId}
          GROUP BY sl."productId", sl."variantId"
          HAVING SUM(
            CASE 
              WHEN sl.type IN ('IN', 'RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN') 
              THEN sl.quantity
              WHEN sl.type IN ('OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER') 
              THEN -sl.quantity
              ELSE 0
            END
          ) > 0
        )
        SELECT COALESCE(SUM(sb.current_quantity * COALESCE(pv.price, p.price)), 0) as total
        FROM stock_balances sb
        INNER JOIN products p ON sb."productId" = p.id
        LEFT JOIN product_variants pv ON sb."variantId" = pv.id
      `;
      const total = result[0]?.total;
      if (total === null || total === undefined) return 0;
      return Number(total);
    } catch (error: any) {
      const { logger } = await import('../utils/logger.js');
      logger.error('[calculateTotalStockValue] Stok değeri hesaplama hatası', {
        companyId,
        error: error?.message || String(error),
        stack: error?.stack,
      });
      // Fallback: return 0 if query fails
      return 0;
    }
  }

  /**
   * STOCK LEDGER: Calculate current stock quantity from StockLog movements
   * Stock = SUM(IN movements) - SUM(OUT movements)
   */
  async calculateStockFromMovements(
    productId: string,
    warehouseId: string,
    variantId?: string | null
  ): Promise<number> {
    const result = await prisma.stockLog.groupBy({
      by: ['productId', 'variantId', 'warehouseId'],
      where: {
        productId,
        warehouseId,
        variantId: variantId || null,
      },
      _sum: {
        quantity: true,
      },
    });

    if (result.length === 0) return 0;

    // Calculate net stock from movements
    // IN types: positive quantity
    // OUT types: negative quantity
    const movements = await prisma.stockLog.findMany({
      where: {
        productId,
        warehouseId,
        variantId: variantId || null,
      },
      select: {
        type: true,
        quantity: true,
      },
    });

    let stock = 0;
    for (const movement of movements) {
      if (['IN', 'RETURN', 'IN_CANCEL', 'IN_RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN'].includes(movement.type)) {
        stock += movement.quantity;
      } else if (['OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER'].includes(movement.type)) {
        stock -= movement.quantity;
      }
    }

    return Math.max(0, stock); // Stock cannot be negative
  }

  /**
   * STOCK LEDGER: Calculate stock for multiple products/warehouses from movements
   * Returns map of (productId-variantId-warehouseId) -> quantity
   */
  async calculateStocksFromMovements(
    filters?: {
      productId?: string;
      warehouseId?: string;
      variantId?: string | null;
    }
  ): Promise<Map<string, number>> {
    const where: any = {};
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.variantId !== undefined) where.variantId = filters.variantId;

    const movements = await prisma.stockLog.findMany({
      where,
      select: {
        productId: true,
        variantId: true,
        warehouseId: true,
        type: true,
        quantity: true,
      },
    });

    const stockMap = new Map<string, number>();

    for (const movement of movements) {
      const key = `${movement.productId}-${movement.variantId || 'null'}-${movement.warehouseId}`;
      const current = stockMap.get(key) || 0;

      if (['IN', 'RETURN', 'IN_CANCEL', 'IN_RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN'].includes(movement.type)) {
        stockMap.set(key, current + movement.quantity);
      } else if (['OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER'].includes(movement.type)) {
        stockMap.set(key, Math.max(0, current - movement.quantity));
      }
    }

    return stockMap;
  }

  /**
   * STOCK LEDGER: Get stock summary for products (calculated from StockLog)
   * Returns available stock, reserved stock, and last movement date per product
   */
  async getStockSummary(
    companyId: string,
    filters?: {
      productIds?: string[];
      warehouseId?: string;
    }
  ): Promise<Array<{
    productId: string;
    warehouseId: string;
    variantId: string | null;
    availableStock: number;
    reservedStock: number;
    lastMovementAt: Date | null;
  }>> {
    // Build where clause
    const where: any = {
      product: {
        companyId,
      },
    };

    if (filters?.productIds && filters.productIds.length > 0) {
      where.productId = { in: filters.productIds };
    }

    if (filters?.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    // Get all movements grouped by product+warehouse+variant
    const movements = await prisma.stockLog.findMany({
      where,
      select: {
        productId: true,
        variantId: true,
        warehouseId: true,
        type: true,
        quantity: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate stock per product+warehouse+variant
    const stockMap = new Map<string, {
      availableStock: number;
      reservedStock: number;
      lastMovementAt: Date | null;
    }>();

    for (const movement of movements) {
      const key = `${movement.productId}-${movement.variantId || 'null'}-${movement.warehouseId}`;
      
      if (!stockMap.has(key)) {
        stockMap.set(key, {
          availableStock: 0,
          reservedStock: 0,
          lastMovementAt: null,
        });
      }

      const stock = stockMap.get(key)!;

      // Update last movement date
      if (!stock.lastMovementAt || movement.createdAt > stock.lastMovementAt) {
        stock.lastMovementAt = movement.createdAt;
      }

      // Calculate available stock (IN movements - OUT movements)
      if (['IN', 'RETURN', 'IN_CANCEL', 'IN_RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN'].includes(movement.type)) {
        stock.availableStock += movement.quantity;
      } else if (['OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER'].includes(movement.type)) {
        stock.availableStock = Math.max(0, stock.availableStock - movement.quantity);
      }

      // TODO: Reserved stock calculation (if reserved movements are tracked)
      // For now, reservedStock is 0
    }

    // Convert map to array
    return Array.from(stockMap.entries()).map(([key, stock]) => {
      const [productId, variantIdStr, warehouseId] = key.split('-');
      return {
        productId,
        warehouseId,
        variantId: variantIdStr === 'null' ? null : variantIdStr,
        availableStock: stock.availableStock,
        reservedStock: stock.reservedStock,
        lastMovementAt: stock.lastMovementAt,
      };
    });
  }
}

export const stockRepository = new StockRepository();

