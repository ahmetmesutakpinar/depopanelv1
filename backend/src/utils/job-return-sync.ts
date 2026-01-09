import { prisma } from '../config/index.js';
import { createMarketplaceIntegrationWithDecryption } from './integration-helper.js';
import { orderRepository } from '../repositories/order.repository.js';
import { logger } from './logger.js';
import { MarketplaceType } from '@prisma/client';
import { generateOrderNumber } from './helpers.js';
import { runJobWithRetry, circuitBreaker } from './job-wrapper.js';

/**
 * Marketplace'lerden iadeleri çeker ve sisteme kaydeder
 * 
 * DISABLED v3.1: API integrations hard reset
 */
export async function syncReturns(): Promise<void> {
  // v3.1 HARD RESET: Disable return sync
  const { env } = await import('../config/env.js');
  if (env.INTEGRATIONS_DISABLED) {
    logger.info('⏸️ [v3.1] Return sync disabled (hard reset mode)');
    return;
  }

  logger.info('🔄 İade senkronizasyonu başladı...');

  try {
    // Get all active integrations
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: { status: 'ACTIVE' },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    });

    for (const integration of integrations) {
      // Status guard: Only sync ACTIVE integrations
      if (integration.status !== 'ACTIVE') {
        logger.warn(`[${integration.type}] Entegrasyon aktif değil (status: ${integration.status}), sync atlanıyor`);
        continue;
      }

      // Check circuit breaker
      if (circuitBreaker.isOpen(integration.id)) {
        logger.warn(`[${integration.type}] Circuit breaker açık, iade sync atlanıyor (ID: ${integration.id})`);
        continue;
      }

      try {
        // Only WooCommerce supports refunds for now
        if (integration.type === 'WOOCOMMERCE') {
          await runJobWithRetry(
            {
              jobName: 'RETURN_SYNC',
              integrationId: integration.id,
              companyId: integration.companyId,
              metadata: {
                marketplaceType: integration.type,
                companyName: integration.company?.name,
              },
            },
            () => syncIntegrationReturns(integration),
            {
              maxRetries: 1,
              timeout: 600000, // 10 minutes
              logToDatabase: true,
            }
          );
          
          // Record success
          circuitBreaker.recordSuccess(integration.id);
        }
      } catch (error) {
        // Record failure
        circuitBreaker.recordFailure(integration.id);
        
        logger.error(`[${integration.type}] İade sync hatası:`, error);
        // Error logging is handled by runJobWithRetry
      }
    }

    logger.info('✅ İade senkronizasyonu tamamlandı');
  } catch (error) {
    logger.error('❌ İade senkronizasyonu başarısız:', error);
  }
}

export async function syncIntegrationReturns(integration: any): Promise<void> {
  // v3.1 HARD RESET: Disable integration return sync
  const { env } = await import('../config/env.js');
  if (env.INTEGRATIONS_DISABLED) {
    logger.info(`⏸️ [v3.1] Integration return sync disabled for ${integration.type} (hard reset mode)`);
    return;
  }

  logger.info(`[${integration.type}] İade senkronizasyonu başlatılıyor...`);
  
  try {
    const marketplace = createMarketplaceIntegrationWithDecryption(
      integration.type as MarketplaceType,
      integration
    );

    // Fetch refunds from last 30 days for initial sync
    let startDate: Date | undefined;
    
    if (integration.lastSyncAt) {
      startDate = integration.lastSyncAt;
      logger.info(`[${integration.type}] Son sync: ${startDate?.toISOString()}, bu tarihten sonraki iadeler çekiliyor...`);
    } else {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      logger.info(`[${integration.type}] İlk sync - son 30 günün iadeleri çekiliyor (${startDate.toISOString()} tarihinden itibaren)...`);
    }

    // Check if marketplace has fetchRefunds method
    if (typeof (marketplace as any).fetchRefunds !== 'function') {
      logger.warn(`[${integration.type}] İade çekme desteği yok`);
      return;
    }

    const refunds = await (marketplace as any).fetchRefunds(startDate);
    
    if (!refunds || refunds.length === 0) {
      logger.info(`[${integration.type}] Çekilecek yeni iade yok`);
      return;
    }
    
    logger.info(`[${integration.type}] ${refunds.length} iade bulundu, işleniyor...`);

    let processed = 0;
    let failed = 0;
    let created = 0;
    let skipped = 0;

    for (const refundData of refunds) {
      try {
        // Find order by marketplace order ID
        const order = await prisma.order.findFirst({
          where: {
            companyId: integration.companyId,
            marketplaceOrderId: String(refundData.orderId),
          },
          include: {
            items: true,
          },
        });

        if (!order) {
          logger.warn(`[${integration.type}] İade için sipariş bulunamadı: ${refundData.orderId}`);
          skipped++;
          continue;
        }

        // Check if return already exists
        const existingReturn = await prisma.return.findFirst({
          where: {
            orderId: order.id,
            // Check by refund ID if available
          },
        });

        if (existingReturn) {
          logger.debug(`[${integration.type}] İade zaten mevcut, atlanıyor: ${refundData.refundId}`);
          skipped++;
          continue;
        }

        // Map refund items to order items
        const returnItems: any[] = [];
        
        for (const refundItem of refundData.items) {
          // Find matching order item
          const orderItem = order.items.find((item: any) => {
            return item.sku === refundItem.sku || 
                   item.product?.sku === refundItem.sku ||
                   String(item.productId) === String(refundItem.productId);
          });

          if (orderItem) {
            returnItems.push({
              orderItemId: orderItem.id,
              quantity: refundItem.refundedQuantity || refundItem.quantity,
              reason: refundData.reason,
            });
          }
        }

        if (returnItems.length === 0) {
          logger.warn(`[${integration.type}] İade için sipariş kalemi bulunamadı: ${refundData.orderId}`);
          skipped++;
          continue;
        }

        // Create return
        const returnNumber = `RTN-${generateOrderNumber()}`;
        
        await prisma.return.create({
          data: {
            returnNumber,
            orderId: order.id,
            reason: refundData.reason || 'Marketplace iadesi',
            note: `WooCommerce'den otomatik çekildi. İade ID: ${refundData.refundId}`,
            status: 'APPROVED', // Auto-approve marketplace returns
            refundAmount: refundData.amount,
            items: {
              create: returnItems,
            },
          },
        });

        created++;
        processed++;
        logger.info(`[${integration.type}] İade oluşturuldu: ${returnNumber} (Sipariş: ${order.orderNumber})`);
      } catch (error) {
        logger.error(`[${integration.type}] İade işleme hatası: ${refundData.refundId}`, error);
        failed++;
      }
    }

    // Log sync result
    await prisma.syncLog.create({
      data: {
        type: 'RETURN_SYNC',
        marketplace: integration.type,
        status: failed > 0 ? 'PARTIAL' : 'SUCCESS',
        message: `${processed} işlendi (${created} yeni, ${skipped} atlandı), ${failed} hata`,
        recordsProcessed: processed,
        recordsFailed: failed,
        companyId: integration.companyId,
      },
    });

    logger.info(`[${integration.type}] İade sync tamamlandı: ${processed} işlendi (${created} yeni, ${skipped} atlandı), ${failed} hata`);
  } catch (error) {
    logger.error(`[${integration.type}] İade sync hatası:`, error);
    throw error;
  }
}

