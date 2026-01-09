import { prisma } from '../config/index.js';
import { InventoryCount, InventoryCountItem, CountingStatus, Prisma } from '@prisma/client';

export interface CreateInventoryCountData {
  code: string;
  warehouseId: string;
  locationId?: string;
  type: string; // FULL, PARTIAL, CYCLE
  notes?: string;
  companyId: string;
  createdById: string;
}

export interface UpdateInventoryCountData {
  status?: CountingStatus;
  notes?: string;
  explanation?: string;
  startedAt?: Date;
  completedAt?: Date;
  approvedAt?: Date;
  approvedById?: string;
}

export interface CreateCountItemData {
  countId: string;
  productId: string;
  variantId?: string;
  locationId?: string;
  systemQty: number;
  countedQty: number;
  targetQty?: number;
  notes?: string;
  countedById?: string;
}

export class InventoryCountRepository {
  async findByCompany(companyId: string, options?: {
    skip?: number;
    take?: number;
    status?: CountingStatus;
    warehouseId?: string;
    search?: string;
  }) {
    const where: Prisma.InventoryCountWhereInput = {
      companyId,
      ...(options?.status && { status: options.status }),
      ...(options?.warehouseId && { warehouseId: options.warehouseId }),
      ...(options?.search && {
        OR: [
          { code: { contains: options.search, mode: 'insensitive' } },
          { notes: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [counts, total] = await Promise.all([
      prisma.inventoryCount.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          location: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      prisma.inventoryCount.count({ where }),
    ]);

    return { counts, total };
  }

  async findById(id: string, companyId?: string): Promise<(InventoryCount & { items: InventoryCountItem[] }) | null> {
    return prisma.inventoryCount.findFirst({
      where: {
        id,
        ...(companyId && { companyId }), // companyId varsa filtrele, yoksa sadece id ile bul
      },
      include: {
        warehouse: true,
        location: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
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
            location: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            countedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
  }

  async create(data: CreateInventoryCountData): Promise<InventoryCount> {
    return prisma.inventoryCount.create({
      data,
    });
  }

  async update(id: string, data: UpdateInventoryCountData): Promise<InventoryCount> {
    return prisma.inventoryCount.update({
      where: { id },
      data,
    });
  }

  async addItem(data: CreateCountItemData): Promise<InventoryCountItem> {
    const difference = data.countedQty - data.systemQty;
    
    return prisma.inventoryCountItem.create({
      data: {
        ...data,
        difference,
        countedAt: new Date(),
      },
    });
  }

  async updateItem(id: string, data: {
    countedQty?: number;
    notes?: string;
    countedById?: string;
  }): Promise<InventoryCountItem> {
    const item = await prisma.inventoryCountItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new Error('Count item not found');
    }

    const countedQty = data.countedQty ?? item.countedQty;
    const difference = countedQty - item.systemQty;

    return prisma.inventoryCountItem.update({
      where: { id },
      data: {
        ...data,
        countedQty,
        difference,
        countedAt: new Date(),
      },
    });
  }

  async completeCount(id: string, explanation?: string): Promise<InventoryCount> {
    return prisma.inventoryCount.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...(explanation && { notes: explanation }), // Store explanation in notes for now
      },
    });
  }

  async approveCount(id: string, approvedById: string): Promise<InventoryCount> {
    // NOT: Stok güncellemesi yapılmıyor - sayım sadece kayıt olarak kalıyor
    const count = await this.findById(id, '');
    if (!count) {
      throw new Error('Count not found');
    }

    // Sadece sayım durumunu güncelle, stokları değiştirme
    return prisma.inventoryCount.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById,
      },
    });
  }

  async deleteItem(id: string): Promise<void> {
    await prisma.inventoryCountItem.delete({
      where: { id },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.inventoryCount.delete({
      where: { id },
    });
  }
}

export const inventoryCountRepository = new InventoryCountRepository();

