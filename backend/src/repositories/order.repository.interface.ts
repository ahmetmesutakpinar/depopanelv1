/**
 * Order Repository Interface
 * 
 * Defines the contract for order persistence operations.
 * This interface is implementation-agnostic and depends only on domain entities.
 * 
 * Architecture:
 * - Domain layer depends on this interface (Dependency Inversion Principle)
 * - Infrastructure layer provides concrete implementation (Prisma-based)
 * - No Prisma types or infrastructure details exposed
 */

import { Order, OrderStatus } from '../domain/entities/order.entity.js';
import { OrderItem } from '../domain/entities/order-item.entity.js';
import { CompanyId, OrderId } from '../domain/value-objects/ids.vo.js';

/**
 * Options for finding orders by company
 */
export interface FindOrdersOptions {
  skip?: number;
  take?: number;
  search?: string;
  status?: OrderStatus;
  integrationId?: string;
  warehouseId?: string;
  pickingWaveId?: string;
  startDate?: Date;
  endDate?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Order with items and relations
 */
export interface OrderWithItems extends Order {
  items: OrderItem[];
  warehouse: {
    id: string;
    name: string;
    code: string;
  } | null;
  integration: {
    id: string;
    type: string;
    name: string;
  } | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

/**
 * Order Repository Interface
 * 
 * Defines all order persistence operations using domain entities.
 */
export interface IOrderRepository {
  /**
   * Find order by ID
   */
  findById(id: OrderId | string): Promise<OrderWithItems | null>;

  /**
   * Find order by ID and company (for multi-tenant security)
   */
  findByIdAndCompany(id: OrderId | string, companyId: CompanyId | string): Promise<OrderWithItems | null>;

  /**
   * Find order by marketplace order ID
   */
  findByMarketplaceOrderId(companyId: CompanyId | string, marketplaceOrderId: string): Promise<Order | null>;

  /**
   * Find orders by company with optional filters
   */
  findByCompany(companyId: CompanyId | string, options?: FindOrdersOptions): Promise<{
    orders: OrderWithItems[];
    total: number;
  }>;

  /**
   * Create a new order with items
   */
  create(order: Order, items: OrderItem[]): Promise<Order>;

  /**
   * Update order status
   */
  updateStatus(id: OrderId | string, status: OrderStatus): Promise<Order>;

  /**
   * Get order statistics for a company
   */
  getOrderStats(companyId: CompanyId | string, options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    total: number;
    byStatus: Record<OrderStatus, number>;
    totalRevenue: number;
  }>;
}

