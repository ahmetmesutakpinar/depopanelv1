import { prisma } from '../config/index.js';
import { PickingWave, PickingStrategy, WaveStatus, Prisma } from '@prisma/client';

export interface CreatePickingWaveData {
  code: string;
  warehouseId: string;
  strategy: PickingStrategy;
  priority?: number;
  companyId: string;
  orderIds?: string[];
}

export interface UpdatePickingWaveData {
  status?: WaveStatus;
  priority?: number;
  assignedToId?: string;
  pickedById?: string;
  shippedById?: string;
  startedAt?: Date;
  completedAt?: Date;
  pickedAt?: Date;
  shippedAt?: Date;
  pickedItems?: Prisma.InputJsonValue;
}

export class PickingWaveRepository {
  async findByCompany(companyId: string, options?: {
    skip?: number;
    take?: number;
    status?: WaveStatus;
    warehouseId?: string;
    strategy?: PickingStrategy;
  }) {
    const where: Prisma.PickingWaveWhereInput = {
      companyId,
      ...(options?.status && { status: options.status as WaveStatus }),
      ...(options?.warehouseId && { warehouseId: options.warehouseId }),
      ...(options?.strategy && { strategy: options.strategy }),
    };

    const [waves, total] = await Promise.all([
      prisma.pickingWave.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              orders: true,
            },
          },
        },
      }),
      prisma.pickingWave.count({ where }),
    ]);

    return { waves, total };
  }

  async findById(id: string, companyId: string): Promise<(PickingWave & { orders: any[] }) | null> {
    return prisma.pickingWave.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        warehouse: true,
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        orders: {
          where: {
            status: {
              not: 'SHIPPED', // Paketlenmiş siparişleri gösterme
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
                    barcode: true,
                    gtin: true,
                  },
                },
                variant: {
                  select: {
                    id: true,
                    sku: true,
                    barcode: true,
                  },
                },
              },
            },
            orderSources: {
              include: {
                integration: {
                  select: {
                    id: true,
                    type: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async create(data: CreatePickingWaveData): Promise<PickingWave> {
    return prisma.$transaction(async (tx) => {
      const wave = await tx.pickingWave.create({
        data: {
          code: data.code,
          warehouseId: data.warehouseId,
          strategy: data.strategy,
          priority: data.priority || 0,
          companyId: data.companyId,
          status: 'PENDING', // Default status
        },
      });

      // Assign orders to wave
      if (data.orderIds && data.orderIds.length > 0) {
        await tx.order.updateMany({
          where: {
            id: { in: data.orderIds },
            companyId: data.companyId,
          },
          data: {
            pickingWaveId: wave.id,
          },
        });
      }

      return wave;
    });
  }

  async update(id: string, data: UpdatePickingWaveData): Promise<PickingWave> {
    // Convert UpdatePickingWaveData to Prisma.PickingWaveUpdateInput
    const updateData: Prisma.PickingWaveUpdateInput = {
      ...(data.status !== undefined && { status: data.status }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
      ...(data.pickedById !== undefined && { pickedById: data.pickedById }),
      ...(data.shippedById !== undefined && { shippedById: data.shippedById }),
      ...(data.startedAt !== undefined && { startedAt: data.startedAt }),
      ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
      ...(data.pickedAt !== undefined && { pickedAt: data.pickedAt }),
      ...(data.shippedAt !== undefined && { shippedAt: data.shippedAt }),
      ...(data.pickedItems !== undefined && { pickedItems: data.pickedItems }),
    };
    
    return prisma.pickingWave.update({
      where: { id },
      data: updateData,
    });
  }

  async addOrders(waveId: string, orderIds: string[]): Promise<void> {
    await prisma.order.updateMany({
      where: {
        id: { in: orderIds },
      },
      data: {
        pickingWaveId: waveId,
      },
    });
  }

  async removeOrders(waveId: string, orderIds: string[]): Promise<void> {
    await prisma.order.updateMany({
      where: {
        id: { in: orderIds },
        pickingWaveId: waveId,
      },
      data: {
        pickingWaveId: null,
      },
    });
  }

  async startWave(id: string): Promise<PickingWave> {
    return prisma.pickingWave.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  async completeWave(id: string): Promise<PickingWave> {
    return prisma.pickingWave.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Remove orders from wave
      await tx.order.updateMany({
        where: { pickingWaveId: id },
        data: { pickingWaveId: null },
      });

      // Delete wave
      await tx.pickingWave.delete({
        where: { id },
      });
    });
  }

  async generateWaveCode(companyId: string): Promise<string> {
    const count = await prisma.pickingWave.count({
      where: {
        companyId,
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return `WAVE-${date}-${String(count + 1).padStart(4, '0')}`;
  }
}

export const pickingWaveRepository = new PickingWaveRepository();

