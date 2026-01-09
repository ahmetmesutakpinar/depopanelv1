/**
 * Prisma Stock Repository Implementation
 * 
 * Implements IStockRepository using Prisma ORM.
 * This is the infrastructure layer implementation.
 * 
 * Architecture:
 * - Implements repository interface (Dependency Inversion)
 * - Uses PrismaClient for database access
 * - Maps Prisma models to domain entities
 * - No business logic, only data access
 */

import { PrismaClient } from '@prisma/client';
import { IStockRepository, StockLog, FindWarehouseStocksOptions } from '../../../repositories/stock.repository.interface.js';
import { Stock } from '../../../domain/entities/stock.entity.js';
import { ProductId, CompanyId } from '../../../domain/value-objects/ids.vo.js';
import { Quantity } from '../../../domain/value-objects/quantity.vo.js';
import { mapStock } from './mappers.js';
import { toNumber } from '../../../utils/decimal.js';
import { Prisma } from '@prisma/client';

export class PrismaStockRepository implements IStockRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findStock(productId: ProductId | string, warehouseId: string, variantId?: string | null): Promise<Stock | null> {
    const record = await this.prisma.stock.findFirst({
      where: {
        productId: typeof productId === 'string' ? productId : productId.value,
        warehouseId,
        variantId: variantId || null,
      },
    });

    if (!record) return null;
    return mapStock(record);
  }

  async findOrCreateStock(productId: ProductId | string, warehouseId: string, variantId?: string | null): Promise<Stock> {
    const existing = await this.findStock(productId, warehouseId, variantId);
    if (existing) return existing;

    // TODO: Get companyId from product
    const product = await this.prisma.product.findUnique({
      where: { id: typeof productId === 'string' ? productId : productId.value },
      select: { companyId: true },
    });

    if (!product) {
      throw new Error(`Product not found: ${typeof productId === 'string' ? productId : productId.value}`);
    }

    const record = await this.prisma.stock.create({
      data: {
        productId: typeof productId === 'string' ? productId : productId.value,
        warehouseId,
        variantId: variantId || null,
        quantity: 0,
        reservedQty: 0,
        minQuantity: 0,
        companyId: product.companyId,
      },
    });

    return mapStock(record);
  }

  async getProductStocks(productId: ProductId | string): Promise<Stock[]> {
    const records = await this.prisma.stock.findMany({
      where: {
        productId: typeof productId === 'string' ? productId : productId.value,
      },
    });

    return records.map(mapStock);
  }

  async getWarehouseStocks(warehouseId: string, options?: FindWarehouseStocksOptions): Promise<{
    stocks: Stock[];
    total: number;
  }> {
    const where: Prisma.StockWhereInput = {
      warehouseId,
      ...(options?.lowStock && {
        quantity: {
          lte: this.prisma.stock.fields.minQuantity,
        },
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

    const [records, total] = await Promise.all([
      this.prisma.stock.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { product: { name: 'asc' } },
      }),
      this.prisma.stock.count({ where }),
    ]);

    return {
      stocks: records.map(mapStock),
      total,
    };
  }

  async updateStock(id: string, stock: Partial<Stock>): Promise<Stock> {
    const record = await this.prisma.stock.update({
      where: { id },
      data: {
        ...(stock.quantity !== undefined && { quantity: stock.quantity }),
        ...(stock.reservedQty !== undefined && { reservedQty: stock.reservedQty }),
        ...(stock.minQuantity !== undefined && { minQuantity: stock.minQuantity }),
        ...(stock.locationId !== undefined && { locationId: stock.locationId }),
      },
    });

    return mapStock(record);
  }

  async increaseStock(
    productId: ProductId | string,
    warehouseId: string,
    quantity: Quantity | number,
    variantId?: string | null
  ): Promise<Stock> {
    const stock = await this.findOrCreateStock(productId, warehouseId, variantId);
    const qty = typeof quantity === 'number' ? quantity : quantity.value;

    const record = await this.prisma.stock.update({
      where: { id: stock.id },
      data: {
        quantity: { increment: qty },
      },
    });

    return mapStock(record);
  }

  async decreaseStock(
    productId: ProductId | string,
    warehouseId: string,
    quantity: Quantity | number,
    variantId?: string | null
  ): Promise<Stock> {
    const stock = await this.findOrCreateStock(productId, warehouseId, variantId);
    const qty = typeof quantity === 'number' ? quantity : quantity.value;

    // TODO: Add validation to prevent negative stock
    const record = await this.prisma.stock.update({
      where: { id: stock.id },
      data: {
        quantity: { decrement: qty },
      },
    });

    return mapStock(record);
  }

  async adjustStock(
    productId: ProductId | string,
    warehouseId: string,
    newQuantity: Quantity | number,
    variantId?: string | null
  ): Promise<Stock> {
    const stock = await this.findOrCreateStock(productId, warehouseId, variantId);
    const qty = typeof newQuantity === 'number' ? newQuantity : newQuantity.value;

    const record = await this.prisma.stock.update({
      where: { id: stock.id },
      data: {
        quantity: qty,
      },
    });

    return mapStock(record);
  }

  async transferStock(
    productId: ProductId | string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: Quantity | number,
    variantId?: string | null
  ): Promise<void> {
    const qty = typeof quantity === 'number' ? quantity : quantity.value;

    // TODO: Implement transaction for stock transfer
    await this.decreaseStock(productId, fromWarehouseId, qty, variantId);
    await this.increaseStock(productId, toWarehouseId, qty, variantId);
  }

  async transferStockBetweenLocations(
    productId: ProductId | string,
    warehouseId: string,
    fromLocationId: string,
    toLocationId: string,
    quantity: Quantity | number,
    variantId?: string | null
  ): Promise<void> {
    // TODO: Implement location-based stock transfer
    // This may require additional logic if locations are tracked separately
    const stock = await this.findStock(productId, warehouseId, variantId);
    if (!stock) {
      throw new Error('Stock not found for location transfer');
    }

    // TODO: Update locationId on stock record
    await this.updateStock(stock.id, { locationId: toLocationId });
  }

  async getStockLogs(options: {
    companyId?: CompanyId | string;
    productId?: ProductId | string;
    warehouseId?: string;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
  }): Promise<{
    logs: StockLog[];
    total: number;
  }> {
    const where: Prisma.StockLogWhereInput = {
      ...(options.companyId && { companyId: typeof options.companyId === 'string' ? options.companyId : options.companyId.value }),
      ...(options.productId && { productId: typeof options.productId === 'string' ? options.productId : options.productId.value }),
      ...(options.warehouseId && { warehouseId: options.warehouseId }),
      ...(options.startDate || options.endDate
        ? {
            createdAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.stockLog.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockLog.count({ where }),
    ]);

    // TODO: Complete mapping for StockLog
    const logs: StockLog[] = records.map(record => ({
      id: record.id,
      type: record.type,
      quantity: record.quantity,
      previousQty: record.previousQty,
      newQty: record.newQty,
      note: record.note,
      reference: record.reference,
      productId: record.productId,
      variantId: record.variantId,
      warehouseId: record.warehouseId,
      userId: record.userId,
      createdAt: record.createdAt,
    }));

    return { logs, total };
  }

  async getTotalStockValue(companyId: CompanyId | string): Promise<number> {
    // TODO: Implement stock value calculation (quantity * costPrice)
    const stocks = await this.prisma.stock.findMany({
      where: {
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
      },
      include: {
        product: {
          select: {
            costPrice: true,
          },
        },
      },
    });

    return stocks.reduce((total, stock) => {
      const costPrice = stock.product.costPrice ? toNumber(stock.product.costPrice) : 0;
      return total + stock.quantity * costPrice;
    }, 0);
  }
}

