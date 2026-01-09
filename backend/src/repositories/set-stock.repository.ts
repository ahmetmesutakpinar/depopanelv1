import { prisma } from '../config/index.js';
import { SetStock, Prisma } from '@prisma/client';

export interface CreateSetStockData {
  setProductId: string;
  warehouseId: string;
  locationId?: string;
  quantity?: number;
  reservedQty?: number;
}

export interface UpdateSetStockData {
  quantity?: number;
  reservedQty?: number;
}

export interface SetStockWithDetails extends SetStock {
  setProduct: {
    id: string;
    sku: string;
    name: string;
  };
  warehouse: {
    id: string;
    name: string;
    code: string;
  };
  location: {
    id: string;
    code: string;
    name: string | null;
  } | null;
}

export class SetStockRepository {
  /**
   * SET stok bul (setProductId + warehouseId + locationId)
   */
  async findSetStock(
    setProductId: string,
    warehouseId: string,
    locationId?: string
  ): Promise<SetStock | null> {
    // Prisma compound unique requires all fields, including nullable ones
    // If locationId is undefined, we need to use a different approach
    if (locationId === undefined) {
      // When locationId is not provided, we need to find by setProductId and warehouseId only
      // Since locationId is nullable in the unique constraint, we can query differently
      return prisma.setStock.findFirst({
        where: {
          setProductId,
          warehouseId,
          locationId: null,
        },
      });
    }
    
    return prisma.setStock.findUnique({
      where: {
        setProductId_warehouseId_locationId: {
          setProductId,
          warehouseId,
          locationId,
        },
      },
    });
  }

  /**
   * SET stok bul veya oluştur
   */
  async findOrCreateSetStock(
    setProductId: string,
    warehouseId: string,
    locationId?: string
  ): Promise<SetStock> {
    const existing = await this.findSetStock(setProductId, warehouseId, locationId);

    if (existing) {
      return existing;
    }

    return prisma.setStock.create({
      data: {
        setProductId,
        warehouseId,
        ...(locationId ? { locationId } : {}),
        quantity: 0,
        reservedQty: 0,
      },
    });
  }

  /**
   * SET'in tüm stoklarını getir
   */
  async findBySetProductId(setProductId: string): Promise<SetStockWithDetails[]> {
    return prisma.setStock.findMany({
      where: { setProductId },
      include: {
        setProduct: {
          select: { id: true, sku: true, name: true },
        },
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        location: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [
        { warehouse: { name: 'asc' } },
        { location: { code: 'asc' } },
      ],
    });
  }

  /**
   * Depoya göre SET stokları
   */
  async findByWarehouseId(
    warehouseId: string,
    options?: {
      skip?: number;
      take?: number;
      search?: string;
    }
  ): Promise<{ stocks: SetStockWithDetails[]; total: number }> {
    const where: Prisma.SetStockWhereInput = {
      warehouseId,
      ...(options?.search && {
        setProduct: {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { sku: { contains: options.search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [stocks, total] = await Promise.all([
      prisma.setStock.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        include: {
          setProduct: {
            select: { id: true, sku: true, name: true },
          },
          warehouse: {
            select: { id: true, name: true, code: true },
          },
          location: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: {
          setProduct: { name: 'asc' },
        },
      }),
      prisma.setStock.count({ where }),
    ]);

    return { stocks, total };
  }

  /**
   * SET stok oluştur
   */
  async create(data: CreateSetStockData): Promise<SetStock> {
    return prisma.setStock.create({
      data: {
        setProductId: data.setProductId,
        warehouseId: data.warehouseId,
        ...(data.locationId ? { locationId: data.locationId } : {}),
        quantity: data.quantity ?? 0,
        reservedQty: data.reservedQty ?? 0,
      },
    });
  }

  /**
   * SET stok güncelle
   */
  async update(id: string, data: UpdateSetStockData): Promise<SetStock> {
    return prisma.setStock.update({
      where: { id },
      data,
    });
  }

  /**
   * SET stok artır
   */
  async increaseQuantity(
    setProductId: string,
    warehouseId: string,
    quantity: number,
    locationId?: string
  ): Promise<SetStock> {
    const stock = await this.findOrCreateSetStock(setProductId, warehouseId, locationId);

    return prisma.setStock.update({
      where: { id: stock.id },
      data: {
        quantity: { increment: quantity },
      },
    });
  }

  /**
   * SET stok azalt
   */
  async decreaseQuantity(
    setProductId: string,
    warehouseId: string,
    quantity: number,
    locationId?: string
  ): Promise<SetStock> {
    const stock = await this.findSetStock(setProductId, warehouseId, locationId);

    if (!stock) {
      throw new Error('SET stok bulunamadı');
    }

    if (stock.quantity < quantity) {
      throw new Error(`Yetersiz SET stok. Mevcut: ${stock.quantity}, İstenen: ${quantity}`);
    }

    return prisma.setStock.update({
      where: { id: stock.id },
      data: {
        quantity: { decrement: quantity },
      },
    });
  }

  /**
   * SET stok rezervasyonu
   */
  async reserve(
    setProductId: string,
    warehouseId: string,
    quantity: number,
    locationId?: string
  ): Promise<SetStock> {
    const stock = await this.findSetStock(setProductId, warehouseId, locationId);

    if (!stock) throw new Error('SET stok bulunamadı');

    const available = stock.quantity - stock.reservedQty;
    if (available < quantity) {
      throw new Error(`Yetersiz SET stok. Kullanılabilir: ${available}`);
    }

    return prisma.setStock.update({
      where: { id: stock.id },
      data: {
        reservedQty: { increment: quantity },
      },
    });
  }

  /**
   * Rezervasyonu kaldır
   */
  async unreserve(
    setProductId: string,
    warehouseId: string,
    quantity: number,
    locationId?: string
  ): Promise<SetStock> {
    const stock = await this.findSetStock(setProductId, warehouseId, locationId);

    if (!stock) throw new Error('SET stok bulunamadı');

    return prisma.setStock.update({
      where: { id: stock.id },
      data: {
        reservedQty: {
          decrement: Math.min(quantity, stock.reservedQty),
        },
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.setStock.delete({ where: { id } });
  }

  async deleteBySetProductId(setProductId: string): Promise<number> {
    const result = await prisma.setStock.deleteMany({
      where: { setProductId },
    });
    return result.count;
  }
}

export const setStockRepository = new SetStockRepository();
