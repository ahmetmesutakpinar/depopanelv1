import { prisma } from '../config/index.js';
import { Transfer, TransferStatus, Prisma } from '@prisma/client';
import { withCompanyScope } from '../utils/company-scope.js';

export interface CreateTransferData {
  code: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  notes?: string;
  createdById: string;
  companyId: string;
  items: {
    productId: string;
    variantId?: string;
    quantity: number;
    notes?: string;
  }[];
}

export interface UpdateTransferData {
  status?: TransferStatus;
  notes?: string;
  approvedById?: string;
  completedById?: string;
  approvedAt?: Date;
  shippedAt?: Date;
  completedAt?: Date;
}

export interface TransferWithDetails extends Transfer {
  items: {
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    notes: string | null;
  }[];
  fromWarehouse: {
    id: string;
    name: string;
    code: string;
  };
  toWarehouse: {
    id: string;
    name: string;
    code: string;
  };
}

export class TransferRepository {
  /**
   * ID ve companyId ile transfer bul
   */
  async findByIdAndCompany(
    id: string,
    companyId: string
  ): Promise<TransferWithDetails | null> {
    return prisma.transfer.findFirst({
      where: withCompanyScope({ id }, companyId),
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            variantId: true,
            quantity: true,
            notes: true,
          },
        },
        fromWarehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        toWarehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  /**
   * Şirkete ait transferleri listele
   */
  async findByCompany(
    companyId: string,
    options?: {
      skip?: number;
      take?: number;
      status?: TransferStatus;
      fromWarehouseId?: string;
      toWarehouseId?: string;
      search?: string;
    }
  ): Promise<{ transfers: TransferWithDetails[]; total: number }> {
    const where = withCompanyScope(
      {
        ...(options?.status && { status: options.status }),
        ...(options?.fromWarehouseId && { fromWarehouseId: options.fromWarehouseId }),
        ...(options?.toWarehouseId && { toWarehouseId: options.toWarehouseId }),
        ...(options?.search && {
          OR: [
            { code: { contains: options.search, mode: 'insensitive' as Prisma.QueryMode } },
            { notes: { contains: options.search, mode: 'insensitive' as Prisma.QueryMode } },
          ],
        }),
      },
      companyId
    );

    const [transfers, total] = await Promise.all([
      prisma.transfer.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              quantity: true,
              notes: true,
            },
          },
          fromWarehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          toWarehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      prisma.transfer.count({ where }),
    ]);

    return { transfers, total };
  }

  /**
   * Yeni transfer oluştur
   */
  async create(data: CreateTransferData): Promise<Transfer> {
    return prisma.transfer.create({
      data: {
        code: data.code,
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        notes: data.notes,
        createdById: data.createdById,
        companyId: data.companyId,
        status: 'PENDING',
        items: {
          create: data.items,
        },
      },
      include: {
        items: true,
      },
    });
  }

  /**
   * Transfer güncelle
   */
  async update(
    id: string,
    companyId: string,
    data: UpdateTransferData
  ): Promise<Transfer> {
    // Company isolation kontrolü
    const existing = await prisma.transfer.findFirst({
      where: withCompanyScope({ id }, companyId),
    });

    if (!existing) {
      throw new Error('Transfer not found or access denied');
    }

    return prisma.transfer.update({
      where: { id },
      data,
    });
  }

  /**
   * Transfer sil
   */
  async delete(id: string, companyId: string): Promise<void> {
    const existing = await prisma.transfer.findFirst({
      where: withCompanyScope({ id }, companyId),
    });

    if (!existing) {
      throw new Error('Transfer not found or access denied');
    }

    // Sadece PENDING durumundaki transferler silinebilir
    if (existing.status !== 'PENDING') {
      throw new Error('Only pending transfers can be deleted');
    }

    await prisma.transfer.delete({
      where: { id },
    });
  }

  /**
   * Transfer code ile var mı kontrol et
   */
  async existsByCode(code: string, companyId: string, excludeId?: string): Promise<boolean> {
    const transfer = await prisma.transfer.findFirst({
      where: withCompanyScope(
        {
          code,
          ...(excludeId && { NOT: { id: excludeId } }),
        },
        companyId
      ),
    });
    return !!transfer;
  }

  /**
   * Transfer item ekle
   */
  async addItem(
    transferId: string,
    companyId: string,
    item: {
      productId: string;
      variantId?: string;
      quantity: number;
      notes?: string;
    }
  ): Promise<void> {
    // Company isolation kontrolü
    const transfer = await prisma.transfer.findFirst({
      where: withCompanyScope({ id: transferId }, companyId),
    });

    if (!transfer) {
      throw new Error('Transfer not found or access denied');
    }

    if (transfer.status !== 'PENDING') {
      throw new Error('Cannot add items to non-pending transfer');
    }

    await prisma.transferItem.create({
      data: {
        transferId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        notes: item.notes,
      },
    });
  }

  /**
   * Transfer item güncelle
   */
  async updateItem(
    itemId: string,
    transferId: string,
    companyId: string,
    data: {
      quantity?: number;
      notes?: string;
    }
  ): Promise<void> {
    // Company isolation kontrolü
    const transfer = await prisma.transfer.findFirst({
      where: withCompanyScope({ id: transferId }, companyId),
    });

    if (!transfer) {
      throw new Error('Transfer not found or access denied');
    }

    if (transfer.status !== 'PENDING') {
      throw new Error('Cannot update items of non-pending transfer');
    }

    await prisma.transferItem.update({
      where: { id: itemId },
      data,
    });
  }

  /**
   * Transfer item sil
   */
  async deleteItem(itemId: string, transferId: string, companyId: string): Promise<void> {
    // Company isolation kontrolü
    const transfer = await prisma.transfer.findFirst({
      where: withCompanyScope({ id: transferId }, companyId),
    });

    if (!transfer) {
      throw new Error('Transfer not found or access denied');
    }

    if (transfer.status !== 'PENDING') {
      throw new Error('Cannot delete items from non-pending transfer');
    }

    await prisma.transferItem.delete({
      where: { id: itemId },
    });
  }
}

export const transferRepository = new TransferRepository();

