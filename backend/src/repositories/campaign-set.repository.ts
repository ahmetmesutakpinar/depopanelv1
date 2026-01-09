import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/index.js';

export interface CreateCampaignSetData {
  name: string;
  sku: string;
  description?: string;
  price: number;
  companyId: string;
  items: {
    productId: string;
    variantId?: string;
    quantity: number;
  }[];
}

export interface UpdateCampaignSetData {
  name?: string;
  description?: string;
  price?: number;
  isActive?: boolean;
  items?: {
    productId: string;
    variantId?: string;
    quantity: number;
  }[];
}

export interface CampaignSetWithItems {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: Prisma.Decimal;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    product: {
      id: string;
      name: string;
      sku: string;
    };
    variant: {
      id: string;
      name: string;
      sku: string;
    } | null;
  }[];
  stocks: {
    id: string;
    warehouseId: string;
    locationId: string | null;
    quantity: number;
    reservedQty: number;
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
  }[];
}

export class CampaignSetRepository {
  async findByCompany(companyId: string, options?: {
    skip?: number;
    take?: number;
    isActive?: boolean;
    search?: string;
  }) {
    const where: Prisma.CampaignSetWhereInput = {
      companyId,
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
      ...(options?.search && {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { sku: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [sets, total] = await Promise.all([
      prisma.campaignSet.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
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
          stocks: {
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
            },
          },
        },
      }),
      prisma.campaignSet.count({ where }),
    ]);

    return { sets, total };
  }

  async findById(id: string, companyId: string): Promise<CampaignSetWithItems | null> {
    return prisma.campaignSet.findFirst({
      where: {
        id,
        companyId,
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
        stocks: {
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
          },
        },
      },
    });
  }

  async findBySku(companyId: string, sku: string) {
    return prisma.campaignSet.findFirst({
      where: {
        companyId,
        sku,
      },
    });
  }

  async existsBySku(companyId: string, sku: string): Promise<boolean> {
    const count = await prisma.campaignSet.count({
      where: {
        companyId,
        sku,
      },
    });
    return count > 0;
  }

  async create(data: CreateCampaignSetData) {
    return prisma.$transaction(async (tx) => {
      const campaignSet = await tx.campaignSet.create({
        data: {
          name: data.name,
          sku: data.sku,
          description: data.description,
          price: data.price,
          companyId: data.companyId,
          items: {
            create: data.items.map(item => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
            })),
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

      return campaignSet;
    });
  }

  async update(id: string, data: UpdateCampaignSetData) {
    const { items, ...updateData } = data;
    
    return prisma.$transaction(async (tx) => {
      // If items are provided, delete existing items and create new ones
      if (items !== undefined) {
        // Delete existing items
        await tx.campaignSetItem.deleteMany({
          where: { campaignSetId: id },
        });
        
        // Create new items
        if (items.length > 0) {
          await tx.campaignSetItem.createMany({
            data: items.map(item => ({
              campaignSetId: id,
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
            })),
          });
        }
      }
      
      // Update campaign set fields
      return tx.campaignSet.update({
        where: { id },
        data: updateData,
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
    });
  }

  async delete(id: string) {
    return prisma.campaignSet.delete({
      where: { id },
    });
  }

  async addItems(campaignSetId: string, items: {
    productId: string;
    variantId?: string;
    quantity: number;
  }[]) {
    return prisma.$transaction(async (tx) => {
      await tx.campaignSetItem.createMany({
        data: items.map(item => ({
          campaignSetId,
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
        })),
        skipDuplicates: true,
      });
    });
  }

  async removeItem(campaignSetId: string, itemId: string) {
    return prisma.campaignSetItem.delete({
      where: { id: itemId },
    });
  }

  async updateItemQuantity(itemId: string, quantity: number) {
    return prisma.campaignSetItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  // Kampanya stoğu işlemleri
  async getCampaignStock(campaignSetId: string, warehouseId: string, locationId?: string) {
    return prisma.campaignStock.findFirst({
      where: {
        campaignSetId,
        warehouseId,
        locationId: locationId || null,
      },
    });
  }

  async createOrUpdateCampaignStock(campaignSetId: string, warehouseId: string, locationId: string | null, quantity: number) {
    return prisma.campaignStock.upsert({
      where: {
        campaignSetId_warehouseId_locationId: {
          campaignSetId,
          warehouseId,
          locationId: locationId || '',
        },
      },
      create: {
        campaignSetId,
        warehouseId,
        locationId: locationId || null,
        quantity,
        reservedQty: 0,
      },
      update: {
        quantity: {
          increment: quantity,
        },
      },
    });
  }

  async reserveCampaignStock(campaignSetId: string, warehouseId: string, quantity: number) {
    return prisma.campaignStock.updateMany({
      where: {
        campaignSetId,
        warehouseId,
        quantity: {
          gte: quantity,
        },
      },
      data: {
        reservedQty: {
          increment: quantity,
        },
        quantity: {
          decrement: quantity,
        },
      },
    });
  }

  async releaseCampaignStock(campaignSetId: string, warehouseId: string, quantity: number) {
    return prisma.campaignStock.updateMany({
      where: {
        campaignSetId,
        warehouseId,
        reservedQty: {
          gte: quantity,
        },
      },
      data: {
        reservedQty: {
          decrement: quantity,
        },
        quantity: {
          increment: quantity,
        },
      },
    });
  }
}

export const campaignSetRepository = new CampaignSetRepository();

