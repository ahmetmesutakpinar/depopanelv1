import { campaignSetRepository, CreateCampaignSetData, UpdateCampaignSetData } from '../repositories/campaign-set.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { stockRepository } from '../repositories/stock.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { ConflictError, NotFoundError, AppError } from '../middleware/error.middleware.js';
import { prisma } from '../config/index.js';

class CampaignSetService {
  async getCampaignSets(companyId: string, options?: {
    page?: number;
    limit?: number;
    isActive?: boolean;
    search?: string;
  }) {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    return campaignSetRepository.findByCompany(companyId, {
      skip,
      take,
      isActive: options?.isActive,
      search: options?.search,
    });
  }

  async getCampaignSetById(id: string, companyId: string) {
    const set = await campaignSetRepository.findById(id, companyId);
    if (!set) {
      throw new NotFoundError('Kampanyalı set bulunamadı');
    }
    return set;
  }

  async createCampaignSet(companyId: string, data: Omit<CreateCampaignSetData, 'companyId'>) {
    // SKU kontrolü
    const skuExists = await campaignSetRepository.existsBySku(companyId, data.sku);
    if (skuExists) {
      throw new ConflictError('Bu SKU zaten kullanımda');
    }

    // Ürünleri kontrol et
    for (const item of data.items) {
      const product = await productRepository.findByIdAndCompany(item.productId, companyId);
      if (!product) {
        throw new NotFoundError(`Ürün bulunamadı: ${item.productId}`);
      }
      if (item.variantId) {
        const variant = product.variants?.find(v => v.id === item.variantId);
        if (!variant) {
          throw new NotFoundError(`Varyant bulunamadı: ${item.variantId}`);
        }
      }
    }

    return campaignSetRepository.create({
      ...data,
      companyId,
    });
  }

  async updateCampaignSet(id: string, companyId: string, data: UpdateCampaignSetData) {
    await this.getCampaignSetById(id, companyId);
    
    // If items are being updated, validate them
    if (data.items !== undefined) {
      // Validate that at least one item is provided
      if (data.items.length === 0) {
        throw new AppError('En az bir ürün eklenmeli', 400);
      }
      
      // Validate products and variants
      for (const item of data.items) {
        const product = await productRepository.findByIdAndCompany(item.productId, companyId);
        if (!product) {
          throw new NotFoundError(`Ürün bulunamadı: ${item.productId}`);
        }
        if (item.variantId) {
          const variant = product.variants?.find(v => v.id === item.variantId);
          if (!variant) {
            throw new NotFoundError(`Varyant bulunamadı: ${item.variantId}`);
          }
        }
      }
    }
    
    return campaignSetRepository.update(id, data);
  }

  async deleteCampaignSet(id: string, companyId: string) {
    await this.getCampaignSetById(id, companyId);
    return campaignSetRepository.delete(id);
  }

  /**
   * Kampanyalı set oluşturma - her üründen belirtilen miktarda stok düşer
   * Örnek: 50 adet 3'lü set yapıldığında, her üründen 50 adet stok düşer
   */
  async createCampaignStock(
    campaignSetId: string,
    companyId: string,
    data: {
      warehouseId: string;
      locationId?: string;
      setQuantity: number; // Kaç adet set oluşturulacak
    }
  ) {
    const campaignSet = await this.getCampaignSetById(campaignSetId, companyId);

    // Depo kontrolü
    const warehouse = await warehouseRepository.findByIdAndCompany(data.warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Lokasyon kontrolü
    if (data.locationId) {
      const location = await prisma.location.findFirst({
        where: {
          id: data.locationId,
          warehouseId: data.warehouseId,
        },
      });
      if (!location) {
        throw new NotFoundError('Lokasyon bulunamadı');
      }
    }

    // Her set item'ı için stok kontrolü ve düşürme
    return prisma.$transaction(async (tx) => {
      for (const item of campaignSet.items) {
        // Her üründen setQuantity kadar stok düşür
        const requiredQuantity = item.quantity * data.setQuantity;
        
        // Ürün stoğunu kontrol et
        const stock = await tx.stock.findFirst({
          where: {
            productId: item.productId,
            variantId: item.variantId || null,
            warehouseId: data.warehouseId,
            locationId: data.locationId || null,
          },
        });

        if (!stock || stock.quantity < requiredQuantity) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { name: true, sku: true },
          });
          throw new AppError(
            `Yetersiz stok: ${product?.name || item.productId} için ${requiredQuantity} adet gerekli, mevcut: ${stock?.quantity || 0}`,
            400
          );
        }

        // Stok düşür
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            quantity: {
              decrement: requiredQuantity,
            },
          },
        });

        // Stok log oluştur
        await tx.stockLog.create({
          data: {
            type: 'OUT',
            quantity: requiredQuantity,
            previousQty: stock.quantity,
            newQty: stock.quantity - requiredQuantity,
            note: `Kampanyalı set oluşturma: ${campaignSet.name} (${data.setQuantity} adet)`,
            reference: campaignSetId,
            productId: item.productId,
            variantId: item.variantId || null,
            warehouseId: data.warehouseId,
          },
        });
      }

      // Kampanya stoğunu oluştur veya güncelle
      const campaignStock = await tx.campaignStock.upsert({
        where: {
          campaignSetId_warehouseId_locationId: {
            campaignSetId,
            warehouseId: data.warehouseId,
            locationId: data.locationId || '',
          },
        },
        create: {
          campaignSetId,
          warehouseId: data.warehouseId,
          locationId: data.locationId || null,
          quantity: data.setQuantity,
          reservedQty: 0,
        },
        update: {
          quantity: {
            increment: data.setQuantity,
          },
        },
      });

      return campaignStock;
    });
  }

  /**
   * Kampanyalı set satışı - kampanya stoğundan düşer
   */
  async sellCampaignSet(
    campaignSetId: string,
    companyId: string,
    data: {
      warehouseId: string;
      quantity: number; // Kaç adet set satılacak
      orderId?: string; // İsteğe bağlı sipariş ID
    }
  ) {
    const campaignSet = await this.getCampaignSetById(campaignSetId, companyId);

    // Kampanya stoğunu kontrol et
    const campaignStock = await campaignSetRepository.getCampaignStock(
      campaignSetId,
      data.warehouseId
    );

    if (!campaignStock || campaignStock.quantity < data.quantity) {
      throw new AppError(
        `Yetersiz kampanya stoğu: ${data.quantity} adet gerekli, mevcut: ${campaignStock?.quantity || 0}`,
        400
      );
    }

    // Kampanya stoğundan düş
    return prisma.$transaction(async (tx) => {
      await tx.campaignStock.update({
        where: { id: campaignStock.id },
        data: {
          quantity: {
            decrement: data.quantity,
          },
        },
      });

      // Log oluştur (isteğe bağlı)
      if (data.orderId) {
        // Order item olarak eklenebilir
      }

      return campaignStock;
    });
  }

  async getCampaignStock(campaignSetId: string, companyId: string, warehouseId?: string) {
    await this.getCampaignSetById(campaignSetId, companyId);
    
    const where: any = { campaignSetId };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    return prisma.campaignStock.findMany({
      where,
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
    });
  }
}

export const campaignSetService = new CampaignSetService();

