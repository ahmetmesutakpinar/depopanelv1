import { prisma } from '../config/index.js';
import { ProductSetItem, Prisma } from '@prisma/client';

export interface CreateProductSetItemData {
  setProductId: string;
  componentSku: string;
  componentProductId: string;
  quantity: number;
}

export interface UpdateProductSetItemData {
  componentSku?: string;
  componentProductId?: string;
  quantity?: number;
}

export interface ProductSetItemWithDetails extends ProductSetItem {
  setProduct: {
    id: string;
    sku: string;
    name: string;
  };
  componentProduct: {
    id: string;
    sku: string;
    name: string;
  };
}

export class ProductSetRepository {
  /**
   * SET içindeki tüm ürünleri getir
   */
  async findBySetProductId(setProductId: string): Promise<ProductSetItemWithDetails[]> {
    return prisma.productSetItem.findMany({
      where: { setProductId },
      include: {
        setProduct: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        componentProduct: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
      orderBy: {
        componentProduct: {
          name: 'asc',
        },
      },
    });
  }

  /**
   * Component ürünün hangi SET'lerde kullanıldığını bul
   */
  async findByComponentProductId(componentProductId: string): Promise<ProductSetItemWithDetails[]> {
    return prisma.productSetItem.findMany({
      where: { componentProductId },
      include: {
        setProduct: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        componentProduct: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * SET item oluştur
   */
  async create(data: CreateProductSetItemData): Promise<ProductSetItem> {
    return prisma.productSetItem.create({
      data,
    });
  }

  /**
   * Birden fazla SET item oluştur (transaction içinde)
   */
  async createMany(items: CreateProductSetItemData[]): Promise<number> {
    const result = await prisma.productSetItem.createMany({
      data: items,
      skipDuplicates: true,
    });
    return result.count;
  }

  /**
   * SET item güncelle
   */
  async update(id: string, data: UpdateProductSetItemData): Promise<ProductSetItem> {
    return prisma.productSetItem.update({
      where: { id },
      data,
    });
  }

  /**
   * SET item sil
   */
  async delete(id: string): Promise<void> {
    await prisma.productSetItem.delete({
      where: { id },
    });
  }

  /**
   * SET'in tüm item'larını sil
   */
  async deleteBySetProductId(setProductId: string): Promise<number> {
    const result = await prisma.productSetItem.deleteMany({
      where: { setProductId },
    });
    return result.count;
  }

  /**
   * SET item bul (ID ile)
   */
  async findById(id: string): Promise<ProductSetItemWithDetails | null> {
    return prisma.productSetItem.findUnique({
      where: { id },
      include: {
        setProduct: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        componentProduct: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * SET ve component product ID'si ile item bul
   */
  async findBySetAndComponent(
    setProductId: string,
    componentProductId: string
  ): Promise<ProductSetItem | null> {
    return prisma.productSetItem.findUnique({
      where: {
        setProductId_componentProductId: {
          setProductId,
          componentProductId,
        },
      },
    });
  }

  /**
   * Component SKU ile SET item bul
   */
  async findByComponentSku(setProductId: string, componentSku: string): Promise<ProductSetItemWithDetails | null> {
    return prisma.productSetItem.findFirst({
      where: {
        setProductId,
        componentSku,
      },
      include: {
        setProduct: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        componentProduct: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
    });
  }
}

export const productSetRepository = new ProductSetRepository();

