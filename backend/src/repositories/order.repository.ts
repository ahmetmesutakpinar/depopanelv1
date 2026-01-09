import { prisma } from '../config/index.js';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { mapOrderFromPrisma, OrderDomain } from '../utils/prisma-mappers.js';
import { logger } from '../utils/logger.js';
import { toNumber } from '../utils/decimal.js';

/**
 * Domain alias
 */
export type OrderWithItems = OrderDomain;

export interface CreateOrderData {
  orderNumber: string;
  marketplaceOrderId?: string;
  status?: OrderStatus;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCity?: string;
  shippingDistrict?: string;
  shippingPostalCode?: string;
  billingAddress?: string;
  subtotal: number;
  taxAmount?: number;
  shippingCost?: number;
  discount?: number;
  total: number;
  customerNote?: string;
  integrationId?: string;
  warehouseId?: string;
  companyId: string;
  createdById?: string;
}

export interface CreateOrderItemData {
  orderId: string;
  productId: string;
  variantId?: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discount?: number;
  total: number;
}

export class OrderRepository {
  /* -------------------------------------------------- */
  /* FIND BY ID */
  /* -------------------------------------------------- */

  async findById(id: string): Promise<OrderWithItems | null> {
    const order = await prisma.order.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    if (!order) return null;

    // Type assertion needed because Prisma's inferred type doesn't match exactly
    const mapped = mapOrderFromPrisma(order as any);
    if (!mapped) {
      logger.error('[OrderRepository.findById] Mapping failed', { orderId: id });
      return null;
    }

    return mapped;
  }

  /* -------------------------------------------------- */
  /* FIND BY ID + COMPANY */
  /* -------------------------------------------------- */

  async findByIdAndCompany(
    id: string,
    companyId: string
  ): Promise<OrderWithItems | null> {
    const order = await prisma.order.findFirst({
      where: { id, companyId },
      include: this.defaultInclude(),
    });

    if (!order) return null;

    // Type assertion needed because Prisma's inferred type doesn't match exactly
    const mapped = mapOrderFromPrisma(order as any);
    if (!mapped) {
      logger.error('[OrderRepository.findByIdAndCompany] Mapping failed', {
        orderId: id,
        companyId,
      });
      return null;
    }

    return mapped;
  }

  /* -------------------------------------------------- */
  /* FIND BY MARKETPLACE ORDER ID */
  /* -------------------------------------------------- */

  async findByMarketplaceOrderId(
    companyId: string,
    marketplaceOrderId: string
  ): Promise<Order | null> {
    return prisma.order.findFirst({
      where: { companyId, marketplaceOrderId },
    });
  }

  /* -------------------------------------------------- */
  /* FIND BY COMPANY (LIST) */
  /* -------------------------------------------------- */

  async findByCompany(
    companyId: string,
    options?: {
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
  ): Promise<{ orders: OrderWithItems[]; total: number }> {
    const where: Prisma.OrderWhereInput = {
      companyId,
      ...(options?.status && { status: options.status }),
      ...(options?.integrationId && { integrationId: options.integrationId }),
      ...(options?.warehouseId && { warehouseId: options.warehouseId }),
      ...(options?.pickingWaveId && { pickingWaveId: options.pickingWaveId }),
      ...(options?.search && {
        OR: [
          { orderNumber: { contains: options.search, mode: 'insensitive' } },
          { customerName: { contains: options.search, mode: 'insensitive' } },
          { marketplaceOrderId: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
      ...(options?.startDate || options?.endDate
        ? {
            createdAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const orderBy: Prisma.OrderOrderByWithRelationInput = {
      [options?.sortBy || 'createdAt']: options?.sortOrder || 'desc',
    };

    // For reports: If skip and take are undefined, fetch all orders
    // This is used when limit is very high (> 5000) to include all historical orders
    const queryOptions: any = {
      where,
      orderBy,
      include: this.defaultInclude(),
    };
    
    // Only add skip/take if they are defined (for pagination)
    if (options?.skip !== undefined) {
      queryOptions.skip = options.skip;
    }
    if (options?.take !== undefined) {
      queryOptions.take = options.take;
    }

    const [rows, total] = await Promise.all([
      prisma.order.findMany(queryOptions),
      prisma.order.count({ where }),
    ]);

    const orders = rows
      .map(o => mapOrderFromPrisma(o as any))
      .filter((o): o is OrderWithItems => Boolean(o));

    return { orders, total };
  }

  /* -------------------------------------------------- */
  /* CREATE */
  /* -------------------------------------------------- */

  async create(
    data: CreateOrderData,
    items: Omit<CreateOrderItemData, 'orderId'>[]
  ): Promise<Order> {
    return prisma.order.create({
      data: {
        ...data,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate ?? 0,
            discount: item.discount ?? 0,
            total: item.total,
          })),
        },
      },
      include: { items: true },
    });
  }

  /* -------------------------------------------------- */
  /* UPDATE STATUS */
  /* -------------------------------------------------- */

  async updateStatus(
    id: string,
    status: OrderStatus,
    additionalData?: {
      cargoCompanyId?: string;
      trackingNumber?: string;
      shippedAt?: Date;
      deliveredAt?: Date;
      internalNote?: string;
    }
  ): Promise<Order> {
    const data: Prisma.OrderUpdateInput = {
      status,
      ...(additionalData?.cargoCompanyId !== undefined && {
        cargoCompanyId: additionalData.cargoCompanyId,
      }),
      ...(additionalData?.trackingNumber !== undefined && {
        trackingNumber: additionalData.trackingNumber,
      }),
      ...(additionalData?.shippedAt !== undefined && {
        shippedAt: additionalData.shippedAt,
      }),
      ...(additionalData?.deliveredAt !== undefined && {
        deliveredAt: additionalData.deliveredAt,
      }),
      ...(additionalData?.internalNote !== undefined && {
        internalNote: additionalData.internalNote,
      }),
    };

    return prisma.order.update({
      where: { id },
      data,
    });
  }

  /* -------------------------------------------------- */
  /* STATS */
  /* -------------------------------------------------- */

  async getOrderStats(
    companyId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalOrders: number;
    totalRevenue: number;
    pendingOrders: number;
    processingOrders: number;
    shippedOrders: number;
    deliveredOrders: number;
  }> {
    const dateFilter =
      startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {};

    const [stats, grouped] = await Promise.all([
      prisma.order.aggregate({
        where: { companyId, ...dateFilter },
        _count: true,
        _sum: { total: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { companyId, ...dateFilter },
        _count: true,
      }),
    ]);

    const countByStatus = (status: OrderStatus) =>
      grouped.find(g => g.status === status)?._count ?? 0;

    return {
      totalOrders: stats._count,
      totalRevenue: Number(stats._sum.total ?? 0),
      pendingOrders: countByStatus('PENDING'),
      processingOrders: countByStatus('PROCESSING'),
      shippedOrders: countByStatus('SHIPPED'),
      deliveredOrders: countByStatus('DELIVERED'),
    };
  }

  /* -------------------------------------------------- */
  /* INTERNAL INCLUDE HELPER */
  /* -------------------------------------------------- */

  private defaultInclude(): Prisma.OrderInclude {
    return {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              gtin: true,
              imageUrl: true,
            },
          },
          variant: {
            select: {
              id: true,
              sku: true,
              barcode: true,
              name: true,
            },
          },
        },
      },
      warehouse: {
        select: { id: true, name: true, code: true },
      },
      integration: {
        select: { id: true, type: true, name: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    };
  }

  /* -------------------------------------------------- */
  /* GET DAILY ORDERED PRODUCTS */
  /* -------------------------------------------------- */

  /**
   * Get products ordered on a specific date
   * Groups order items by product and returns aggregated data
   */
  async getDailyOrderedProducts(
    companyId: string,
    date: Date
  ): Promise<Array<{
    productId: string | null;
    variantId: string | null;
    sku: string;
    name: string;
    totalQuantity: number;
    totalRevenue: number;
    orderCount: number;
  }>> {
    // Start and end of the target date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all orders for the date
    const orders = await prisma.order.findMany({
      where: {
        companyId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
            variant: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
          },
        },
      },
    });

    // Aggregate products from order items
    const productMap = new Map<string, {
      productId: string | null;
      variantId: string | null;
      sku: string;
      name: string;
      totalQuantity: number;
      totalRevenue: number;
      orderIds: Set<string>;
    }>();

    for (const order of orders) {
      for (const item of order.items) {
        // STOCK LEDGER: Exclude unresolved products (productId = null)
        // These items cannot be properly aggregated for sales reports
        if (!item.productId) {
          // Skip unresolved products - they should be handled separately
          continue;
        }

        // Use productId + variantId as key
        const key = item.productId && item.variantId
          ? `${item.productId}-${item.variantId}`
          : item.productId || item.variantId || item.sku;

        const productName = item.product?.name || item.variant?.name || item.name;
        const productSku = item.product?.sku || item.variant?.sku || item.sku;

        if (!productMap.has(key)) {
          productMap.set(key, {
            productId: item.productId,
            variantId: item.variantId,
            sku: productSku,
            name: productName,
            totalQuantity: 0,
            totalRevenue: 0,
            orderIds: new Set(),
          });
        }

        const productData = productMap.get(key)!;
        productData.totalQuantity += item.quantity;
        // Convert Decimal to number safely using utility function
        productData.totalRevenue += toNumber(item.total);
        productData.orderIds.add(order.id);
      }
    }

    // Convert map to array and format response
    return Array.from(productMap.values()).map(product => ({
      productId: product.productId,
      variantId: product.variantId,
      sku: product.sku,
      name: product.name,
      totalQuantity: product.totalQuantity,
      totalRevenue: product.totalRevenue,
      orderCount: product.orderIds.size,
    }));
  }
}

export const orderRepository = new OrderRepository();
