import { prisma } from '../../config/index.js';
import { logger } from '../logger.js';

/**
 * Orphan Cleaner Service
 * Cleans up orphaned ProductSource and OrderSource records
 * (records without valid integrationId, productId, or orderId)
 */
export class OrphanCleanerService {
  /**
   * Clean orphaned ProductSource records
   * - Records without integrationId
   * - Records without productId
   * - Records where integration doesn't exist
   * - Records where product doesn't exist
   */
  async cleanProductSources(): Promise<{
    deleted: number;
    orphans: number;
  }> {
    try {
      logger.info('🧹 ProductSource orphan cleanup başlatılıyor...');

      // Find orphaned records using raw query (more efficient for checking foreign key existence)
      const invalidIntegrationIds = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT ps.id
        FROM product_sources ps
        LEFT JOIN marketplace_integrations mi ON ps."integrationId" = mi.id
        WHERE mi.id IS NULL
      `;

      const invalidProductIds = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT ps.id
        FROM product_sources ps
        LEFT JOIN products p ON ps."productId" = p.id
        WHERE p.id IS NULL
      `;

      const allOrphanIds = [
        ...invalidIntegrationIds.map(r => r.id),
        ...invalidProductIds.map(r => r.id),
      ];

      const uniqueOrphanIds = [...new Set(allOrphanIds)];

      if (uniqueOrphanIds.length === 0) {
        logger.info('✅ ProductSource orphan kayıt bulunamadı');
        return { deleted: 0, orphans: 0 };
      }

      logger.info(`🧹 ${uniqueOrphanIds.length} orphan ProductSource kayıt bulundu, siliniyor...`);

      // Delete orphaned records
      const result = await prisma.productSource.deleteMany({
        where: {
          id: { in: uniqueOrphanIds },
        },
      });

      logger.info(`✅ ${result.count} orphan ProductSource kayıt silindi`);

      return {
        deleted: result.count,
        orphans: uniqueOrphanIds.length,
      };
    } catch (error) {
      logger.error('❌ ProductSource orphan cleanup hatası:', error);
      throw error;
    }
  }

  /**
   * Clean orphaned OrderSource records
   * - Records without integrationId
   * - Records without orderId
   * - Records where integration doesn't exist
   * - Records where order doesn't exist
   */
  async cleanOrderSources(): Promise<{
    deleted: number;
    orphans: number;
  }> {
    try {
      logger.info('🧹 OrderSource orphan cleanup başlatılıyor...');

      // Find orphaned records using raw query for better performance
      const invalidIntegrationIds = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT os.id
        FROM order_sources os
        LEFT JOIN marketplace_integrations mi ON os."integrationId" = mi.id
        WHERE mi.id IS NULL
      `;

      const invalidOrderIds = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT os.id
        FROM order_sources os
        LEFT JOIN orders o ON os."orderId" = o.id
        WHERE o.id IS NULL
      `;

      const allOrphanIds = [
        ...invalidIntegrationIds.map(r => r.id),
        ...invalidOrderIds.map(r => r.id),
      ];

      const uniqueOrphanIds = [...new Set(allOrphanIds)];

      if (uniqueOrphanIds.length === 0) {
        logger.info('✅ OrderSource orphan kayıt bulunamadı');
        return { deleted: 0, orphans: 0 };
      }

      logger.info(`🧹 ${uniqueOrphanIds.length} orphan OrderSource kayıt bulundu, siliniyor...`);

      // Delete orphaned records
      const result = await prisma.orderSource.deleteMany({
        where: {
          id: { in: uniqueOrphanIds },
        },
      });

      logger.info(`✅ ${result.count} orphan OrderSource kayıt silindi`);

      return {
        deleted: result.count,
        orphans: uniqueOrphanIds.length,
      };
    } catch (error) {
      logger.error('❌ OrderSource orphan cleanup hatası:', error);
      throw error;
    }
  }

  /**
   * Clean all orphaned records (ProductSource and OrderSource)
   */
  async cleanAll(): Promise<{
    productSources: { deleted: number; orphans: number };
    orderSources: { deleted: number; orphans: number };
  }> {
    logger.info('🧹 Tüm orphan kayıtlar temizleniyor...');

    const [productSources, orderSources] = await Promise.all([
      this.cleanProductSources(),
      this.cleanOrderSources(),
    ]);

    const totalDeleted = productSources.deleted + orderSources.deleted;
    const totalOrphans = productSources.orphans + orderSources.orphans;

    logger.info(`✅ Orphan cleanup tamamlandı: ${totalDeleted}/${totalOrphans} kayıt silindi`);

    return {
      productSources,
      orderSources,
    };
  }
}

export const orphanCleanerService = new OrphanCleanerService();

