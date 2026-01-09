import { prisma } from '../config/index.js';
import { MarketplaceIntegration, MarketplaceType, IntegrationStatus } from '@prisma/client';
import { withCompanyScope } from '../utils/company-scope.js';

export interface CreateIntegrationData {
  type: MarketplaceType;
  name: string;
  apiUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  sellerId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  settings?: any;
  status?: IntegrationStatus;
  companyId: string;
}

export interface UpdateIntegrationData {
  name?: string;
  apiUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  sellerId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  settings?: any;
  status?: IntegrationStatus;
  isActive?: boolean;
  lastSyncAt?: Date;
}

export class IntegrationRepository {
  /**
   * ID ve companyId ile entegrasyon bul
   */
  async findByIdAndCompany(
    id: string,
    companyId: string
  ): Promise<MarketplaceIntegration | null> {
    return prisma.marketplaceIntegration.findFirst({
      where: withCompanyScope({ id }, companyId),
    });
  }

  /**
   * Type ve companyId ile entegrasyon bul
   */
  async findByTypeAndCompany(
    type: MarketplaceType,
    companyId: string
  ): Promise<MarketplaceIntegration | null> {
    return prisma.marketplaceIntegration.findFirst({
      where: withCompanyScope({ type }, companyId),
    });
  }

  /**
   * Şirkete ait tüm entegrasyonları listele (yalnızca aktif olanlar)
   */
  async findByCompany(
    companyId: string,
    options?: {
      includeInactive?: boolean;
      status?: IntegrationStatus;
    }
  ): Promise<MarketplaceIntegration[]> {
    const where = withCompanyScope(
      {
        ...(options?.includeInactive ? {} : { isActive: true }),
        ...(options?.status && { status: options.status }),
      },
      companyId
    );

    return prisma.marketplaceIntegration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Aktif entegrasyonları getir (cron jobs için)
   */
  async findActiveIntegrations(companyId: string): Promise<MarketplaceIntegration[]> {
    return prisma.marketplaceIntegration.findMany({
      where: withCompanyScope(
        {
          isActive: true,
          status: 'ACTIVE' as IntegrationStatus,
        },
        companyId
      ),
    });
  }

  /**
   * Tüm aktif entegrasyonları getir (tüm şirketler - SUPER_ADMIN için)
   */
  async findAllActiveIntegrations(): Promise<MarketplaceIntegration[]> {
    return prisma.marketplaceIntegration.findMany({
      where: {
        isActive: true,
        status: 'ACTIVE',
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Yeni entegrasyon oluştur
   */
  async create(data: CreateIntegrationData): Promise<MarketplaceIntegration> {
    return prisma.marketplaceIntegration.create({
      data: {
        type: data.type,
        name: data.name,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        sellerId: data.sellerId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiry: data.tokenExpiry,
        settings: data.settings,
        status: data.status || 'INACTIVE',
        isActive: true,
        companyId: data.companyId,
      },
    });
  }

  /**
   * Entegrasyonu güncelle
   */
  async update(
    id: string,
    companyId: string,
    data: UpdateIntegrationData
  ): Promise<MarketplaceIntegration> {
    // Company isolation kontrolü
    const existing = await this.findByIdAndCompany(id, companyId);
    if (!existing) {
      throw new Error('Integration not found or access denied');
    }

    return prisma.marketplaceIntegration.update({
      where: { id },
      data,
    });
  }

  /**
   * Soft delete (isActive = false)
   */
  async softDelete(id: string, companyId: string): Promise<MarketplaceIntegration> {
    const existing = await this.findByIdAndCompany(id, companyId);
    if (!existing) {
      throw new Error('Integration not found or access denied');
    }

    return prisma.marketplaceIntegration.update({
      where: { id },
      data: {
        isActive: false,
        status: 'INACTIVE',
      },
    });
  }

  /**
   * Hard delete (kalıcı silme)
   */
  async hardDelete(id: string, companyId: string): Promise<void> {
    const existing = await this.findByIdAndCompany(id, companyId);
    if (!existing) {
      throw new Error('Integration not found or access denied');
    }

    await prisma.marketplaceIntegration.delete({
      where: { id },
    });
  }

  /**
   * Entegrasyona ait tüm verileri temizle (cascade delete alternatifi)
   */
  async cleanupIntegrationData(
    integrationId: string,
    companyId: string
  ): Promise<{
    deletedMarketplaceProducts: number;
    deletedProductSources: number;
    deletedOrderSources: number;
    deletedOrders: number;
    deletedProducts: number;
    deletedSetItems: number;
  }> {
    const existing = await this.findByIdAndCompany(integrationId, companyId);
    if (!existing) {
      throw new Error('Integration not found or access denied');
    }

    // Transaction içinde tüm ilgili verileri sil
    const result = await prisma.$transaction(async (tx) => {
      // 1. Bu entegrasyondan gelen product ID'lerini bul
      const productSources = await tx.productSource.findMany({
        where: { integrationId },
        select: { productId: true },
      });
      const productIds = productSources.map(ps => ps.productId);

      // 2. MarketplaceProduct kayıtlarını sil
      const deletedMarketplaceProducts = await tx.marketplaceProduct.deleteMany({
        where: { integrationId },
      });

      // 3. ProductSource kayıtlarını sil
      const deletedProductSources = await tx.productSource.deleteMany({
        where: { integrationId },
      });

      // 4. OrderSource kayıtlarını sil
      const deletedOrderSources = await tx.orderSource.deleteMany({
        where: { integrationId },
      });

      // 5. Orders ve OrderItems'ları sil
      let deletedOrders = 0;
      const ordersToDelete = await tx.order.findMany({
        where: { integrationId },
        select: { id: true },
      });

      if (ordersToDelete.length > 0) {
        await tx.orderItem.deleteMany({
          where: { orderId: { in: ordersToDelete.map(o => o.id) } },
        });

        const deleted = await tx.order.deleteMany({
          where: { id: { in: ordersToDelete.map(o => o.id) } },
        });
        deletedOrders = deleted.count;
      }

      // 6. SET'leri temizle
      let deletedSetItems = 0;
      if (productIds.length > 0) {
        const deletedSetItemsResult = await tx.productSetItem.deleteMany({
          where: {
            OR: [
              { componentProductId: { in: productIds } },
              { setProductId: { in: productIds } },
            ],
          },
        });
        deletedSetItems = deletedSetItemsResult.count;

        // Campaign set items
        await tx.campaignSetItem.deleteMany({
          where: { productId: { in: productIds } },
        });

        // Boş campaign sets
        const emptyCampaignSets = await tx.campaignSet.findMany({
          where: {
            companyId,
            items: { none: {} },
          },
          select: { id: true },
        });

        if (emptyCampaignSets.length > 0) {
          await tx.campaignSet.deleteMany({
            where: { id: { in: emptyCampaignSets.map(cs => cs.id) } },
          });
        }
      }

      // 7. Başka kaynağı olmayan ürünleri sil
      let deletedProducts = 0;
      if (productIds.length > 0) {
        const productsToDelete: string[] = [];
        for (const productId of productIds) {
          const otherSources = await tx.productSource.count({
            where: { productId },
          });
          const otherMarketplace = await tx.marketplaceProduct.count({
            where: { productId },
          });

          if (otherSources === 0 && otherMarketplace === 0) {
            productsToDelete.push(productId);
          }
        }

        if (productsToDelete.length > 0) {
          await tx.stock.deleteMany({
            where: { productId: { in: productsToDelete } },
          });
          await tx.stockLog.deleteMany({
            where: { productId: { in: productsToDelete } },
          });
          const deleted = await tx.product.deleteMany({
            where: { id: { in: productsToDelete } },
          });
          deletedProducts = deleted.count;
        }
      }

      // 8. Integration'ı soft delete yap
      await tx.marketplaceIntegration.update({
        where: { id: integrationId },
        data: {
          isActive: false,
          status: 'INACTIVE',
        },
      });

      return {
        deletedMarketplaceProducts: deletedMarketplaceProducts.count,
        deletedProductSources: deletedProductSources.count,
        deletedOrderSources: deletedOrderSources.count,
        deletedOrders,
        deletedProducts,
        deletedSetItems,
      };
    });

    return result;
  }

  /**
   * Token güncelle
   */
  async updateToken(
    id: string,
    companyId: string,
    accessToken: string,
    refreshToken?: string,
    tokenExpiry?: Date
  ): Promise<MarketplaceIntegration> {
    const existing = await this.findByIdAndCompany(id, companyId);
    if (!existing) {
      throw new Error('Integration not found or access denied');
    }

    return prisma.marketplaceIntegration.update({
      where: { id },
      data: {
        accessToken,
        ...(refreshToken && { refreshToken }),
        ...(tokenExpiry && { tokenExpiry }),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Son senkronizasyon zamanını güncelle
   */
  async updateLastSync(id: string, companyId: string): Promise<void> {
    const existing = await this.findByIdAndCompany(id, companyId);
    if (!existing) {
      throw new Error('Integration not found or access denied');
    }

    await prisma.marketplaceIntegration.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });
  }

  /**
   * Entegrasyon var mı kontrol et
   */
  async existsByType(
    type: MarketplaceType,
    companyId: string,
    excludeId?: string
  ): Promise<boolean> {
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: withCompanyScope(
        {
          type,
          ...(excludeId && { NOT: { id: excludeId } }),
        },
        companyId
      ),
    });
    return !!integration;
  }
}

export const integrationRepository = new IntegrationRepository();

