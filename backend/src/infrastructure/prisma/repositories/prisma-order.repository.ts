/**
 * Prisma Order Repository Implementation
 * 
 * Implements IOrderRepository using Prisma ORM.
 * This is the infrastructure layer implementation.
 * 
 * Architecture:
 * - Implements repository interface (Dependency Inversion)
 * - Uses PrismaClient for database access
 * - Maps Prisma models to domain entities
 * - No business logic, only data access
 */

import { PrismaClient } from '@prisma/client';
import { IOrderRepository, OrderWithItems, FindOrdersOptions } from '../../../repositories/order.repository.interface.js';
import { Order, OrderStatus } from '../../../domain/entities/order.entity.js';
import { OrderItem } from '../../../domain/entities/order-item.entity.js';
import { CompanyId, OrderId } from '../../../domain/value-objects/ids.vo.js';
import { mapOrder, mapOrderItem } from './mappers.js';
import { mapOrderFromPrisma } from '../../../utils/prisma-mappers.js';
import { toNumber } from '../../../utils/decimal.js';
import { Prisma } from '@prisma/client';

export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: OrderId | string): Promise<OrderWithItems | null> {
    const record = await this.prisma.order.findUnique({
      where: { id: typeof id === 'string' ? id : id.value },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                barcode: true,
                gtin: true,
                name: true,
                locationAssignments: {
                  where: { isPrimary: true },
                  select: {
                    id: true,
                    isPrimary: true,
                    location: {
                      select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true },
                    },
                  },
                },
              },
            },
            variant: {
              select: {
                id: true,
                sku: true,
                barcode: true,
                name: true,
                locationAssignments: {
                  where: { isPrimary: true },
                  select: {
                    id: true,
                    isPrimary: true,
                    location: {
                      select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true },
                    },
                  },
                },
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
      },
    });

    if (!record) return null;

    // Use existing mapper that handles Decimal conversion
    const mapped = mapOrderFromPrisma(record);
    if (!mapped) return null;

    // TODO: Complete mapping to OrderWithItems type
    return mapped as OrderWithItems;
  }

  async findByIdAndCompany(id: OrderId | string, companyId: CompanyId | string): Promise<OrderWithItems | null> {
    const record = await this.prisma.order.findFirst({
      where: {
        id: typeof id === 'string' ? id : id.value,
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                barcode: true,
                gtin: true,
                name: true,
                locationAssignments: {
                  where: { isPrimary: true },
                  select: {
                    id: true,
                    isPrimary: true,
                    location: {
                      select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true },
                    },
                  },
                },
              },
            },
            variant: {
              select: {
                id: true,
                sku: true,
                barcode: true,
                name: true,
                locationAssignments: {
                  where: { isPrimary: true },
                  select: {
                    id: true,
                    isPrimary: true,
                    location: {
                      select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true },
                    },
                  },
                },
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
      },
    });

    if (!record) return null;

    const mapped = mapOrderFromPrisma(record);
    if (!mapped) return null;

    return mapped as OrderWithItems;
  }

  async findByMarketplaceOrderId(companyId: CompanyId | string, marketplaceOrderId: string): Promise<Order | null> {
    const record = await this.prisma.order.findFirst({
      where: {
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
        marketplaceOrderId,
      },
    });

    if (!record) return null;
    return mapOrder(record);
  }

  async findByCompany(companyId: CompanyId | string, options?: FindOrdersOptions): Promise<{
    orders: OrderWithItems[];
    total: number;
  }> {
    const where: Prisma.OrderWhereInput = {
      companyId: typeof companyId === 'string' ? companyId : companyId.value,
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

    const [records, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy,
        include: {
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
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    // TODO: Complete mapping for all orders
    const orders = records
      .map(record => {
        const mapped = mapOrderFromPrisma(record);
        return mapped ? (mapped as OrderWithItems) : null;
      })
      .filter((order): order is OrderWithItems => order !== null);

    return { orders, total };
  }

  async create(order: Order, items: OrderItem[]): Promise<Order> {
    const record = await this.prisma.order.create({
      data: {
        orderNumber: order.orderNumber,
        marketplaceOrderId: order.marketplaceOrderId,
        status: order.status,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        shippingAddress: order.shippingAddress,
        shippingCity: order.shippingCity,
        shippingDistrict: order.shippingDistrict,
        shippingPostalCode: order.shippingPostalCode,
        billingAddress: order.billingAddress,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        shippingCost: order.shippingCost,
        discount: order.discount,
        total: order.total,
        customerNote: order.customerNote,
        integrationId: order.integrationId,
        warehouseId: order.warehouseId,
        companyId: order.companyId,
        createdById: order.createdById,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            discount: item.discount,
            total: item.total,
          })),
        },
      },
      include: { items: true },
    });

    return mapOrder(record);
  }

  async updateStatus(id: OrderId | string, status: OrderStatus): Promise<Order> {
    const record = await this.prisma.order.update({
      where: { id: typeof id === 'string' ? id : id.value },
      data: { status },
    });

    return mapOrder(record);
  }

  async getOrderStats(companyId: CompanyId | string, options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    total: number;
    byStatus: Record<OrderStatus, number>;
    totalRevenue: number;
  }> {
    const where: Prisma.OrderWhereInput = {
      companyId: typeof companyId === 'string' ? companyId : companyId.value,
      ...(options?.startDate || options?.endDate
        ? {
            createdAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: {
          status: true,
          total: true,
        },
      }),
    ]);

    // TODO: Complete stats calculation
    const byStatus: Record<OrderStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      READY_TO_PICK: 0,
      PICKING: 0,
      PACKED: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
      RETURNED: 0,
    };

    orders.forEach(order => {
      const status = order.status as OrderStatus;
      if (status in byStatus) {
        byStatus[status] = (byStatus[status] || 0) + 1;
      }
    });

    const totalRevenue = orders.reduce((sum, order) => sum + toNumber(order.total), 0);

    return { total, byStatus, totalRevenue };
  }
}

