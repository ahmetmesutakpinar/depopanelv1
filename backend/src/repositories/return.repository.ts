import { prisma } from '../config/index.js';
import { Return, Prisma } from '@prisma/client';

export interface CreateReturnData {
  returnNumber: string;
  orderId: string;
  reason: string;
  note?: string;
  status?: string;
}

export interface CreateReturnItemData {
  orderItemId: string;
  quantity: number;
  reason?: string;
}

export interface UpdateReturnData {
  status?: string;
  note?: string;
}

export interface ReturnWithRelations extends Return {
  order: {
    id: string;
    orderNumber: string;
    integration?: {
      id: string;
      name: string;
      type: string;
    } | null;
    warehouse?: {
      id: string;
      name: string;
    } | null;
  };
  items: Array<{
    id: string;
    orderItemId: string;
    quantity: number;
    reason?: string | null;
    orderItem: {
      id: string;
      productId: string | null;
      variantId: string | null;
      product?: {
        id: string;
        name: string;
        sku: string;
      } | null;
      variant?: {
        id: string;
        name: string;
        sku: string;
      } | null;
    };
  }>;
}

export class ReturnRepository {
  async findByCompany(companyId: string, options?: {
    skip?: number;
    take?: number;
    search?: string;
    status?: string;
    orderId?: string;
  }): Promise<{ returns: ReturnWithRelations[]; total: number }> {
    const where: Prisma.ReturnWhereInput = {
      order: {
        companyId,
      },
      ...(options?.status && { status: options.status }),
      ...(options?.orderId && { orderId: options.orderId }),
      ...(options?.search && {
        OR: [
          { returnNumber: { contains: options.search, mode: 'insensitive' } },
          { reason: { contains: options.search, mode: 'insensitive' } },
          { order: { orderNumber: { contains: options.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: {
          order: {
            include: {
              integration: true,
              warehouse: true,
            },
          },
          items: {
            include: {
              orderItem: {
                include: {
                  product: true,
                  variant: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: options?.skip,
        take: options?.take,
      }),
      prisma.return.count({ where }),
    ]);

    return { returns: returns as ReturnWithRelations[], total };
  }

  async findById(id: string, companyId?: string): Promise<ReturnWithRelations | null> {
    const where: Prisma.ReturnWhereInput = {
      id,
      ...(companyId && {
        order: {
          companyId,
        },
      }),
    };

    const returnRecord = await prisma.return.findFirst({
      where,
      include: {
        order: {
          include: {
            integration: true,
            warehouse: true,
            items: {
              include: {
                product: true,
                variant: true,
              },
            },
          },
        },
        items: {
          include: {
            orderItem: {
              include: {
                product: true,
                variant: true,
              },
            },
          },
        },
      },
    });

    return returnRecord as ReturnWithRelations | null;
  }

  async create(
    data: CreateReturnData,
    items: CreateReturnItemData[]
  ): Promise<ReturnWithRelations> {
    const returnRecord = await prisma.return.create({
      data: {
        returnNumber: data.returnNumber,
        orderId: data.orderId,
        reason: data.reason,
        note: data.note,
        status: data.status || 'PENDING',
        items: {
          create: items.map(item => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            reason: item.reason,
          })),
        },
      },
      include: {
        order: true,
        items: {
          include: {
            orderItem: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    return returnRecord as ReturnWithRelations;
  }

  async update(id: string, data: UpdateReturnData): Promise<Return> {
    return prisma.return.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.return.delete({
      where: { id },
    });
  }
}

export const returnRepository = new ReturnRepository();

