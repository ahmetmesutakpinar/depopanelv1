/**
 * Stock Repository Interface
 * 
 * Defines the contract for stock/inventory persistence operations.
 * This interface is implementation-agnostic and depends only on domain entities.
 * 
 * Architecture:
 * - Domain layer depends on this interface (Dependency Inversion Principle)
 * - Infrastructure layer provides concrete implementation (Prisma-based)
 * - No Prisma types or infrastructure details exposed
 */

import { Stock } from '../domain/entities/stock.entity.js';
import { ProductId, CompanyId } from '../domain/value-objects/ids.vo.js';
import { Quantity } from '../domain/value-objects/quantity.vo.js';

/**
 * Options for finding stocks in a warehouse
 */
export interface FindWarehouseStocksOptions {
  skip?: number;
  take?: number;
  search?: string;
  lowStock?: boolean;
}

/**
 * Stock log entry
 */
export interface StockLog {
  id: string;
  type: string;
  quantity: number;
  previousQty: number;
  newQty: number;
  note: string | null;
  reference: string | null;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  userId: string | null;
  createdAt: Date;
}

/**
 * Stock Repository Interface
 * 
 * Defines all stock persistence operations using domain entities.
 */
export interface IStockRepository {
  /**
   * Find stock for a product in a warehouse
   */
  findStock(productId: ProductId | string, warehouseId: string, variantId?: string | null): Promise<Stock | null>;

  /**
   * Find or create stock for a product in a warehouse
   */
  findOrCreateStock(productId: ProductId | string, warehouseId: string, variantId?: string | null): Promise<Stock>;

  /**
   * Get all stocks for a product across all warehouses
   */
  getProductStocks(productId: ProductId | string): Promise<Stock[]>;

  /**
   * Get all stocks in a warehouse
   */
  getWarehouseStocks(warehouseId: string, options?: FindWarehouseStocksOptions): Promise<{
    stocks: Stock[];
    total: number;
  }>;

  /**
   * Update stock quantity and other fields
   */
  updateStock(id: string, stock: Partial<Stock>): Promise<Stock>;

  /**
   * Increase stock quantity
   */
  increaseStock(
    productId: ProductId | string,
    warehouseId: string,
    quantity: Quantity | number,
    variantId?: string | null
  ): Promise<Stock>;

  /**
   * Decrease stock quantity
   */
  decreaseStock(
    productId: ProductId | string,
    warehouseId: string,
    quantity: Quantity | number,
    variantId?: string | null
  ): Promise<Stock>;

  /**
   * Adjust stock to a specific quantity
   */
  adjustStock(
    productId: ProductId | string,
    warehouseId: string,
    newQuantity: Quantity | number,
    variantId?: string | null
  ): Promise<Stock>;

  /**
   * Transfer stock between warehouses
   */
  transferStock(
    productId: ProductId | string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: Quantity | number,
    variantId?: string | null
  ): Promise<void>;

  /**
   * Transfer stock between locations
   */
  transferStockBetweenLocations(
    productId: ProductId | string,
    warehouseId: string,
    fromLocationId: string,
    toLocationId: string,
    quantity: Quantity | number,
    variantId?: string | null
  ): Promise<void>;

  /**
   * Get stock movement logs
   */
  getStockLogs(options: {
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
  }>;

  /**
   * Get total stock value for a company
   */
  getTotalStockValue(companyId: CompanyId | string): Promise<number>;
}

