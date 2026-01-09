import cron from 'node-cron';
import { syncOrders } from './job-order-sync.js';
import { syncProducts, syncIntegrationProducts } from './job-product-sync.js';
import { syncReturns, syncIntegrationReturns } from './job-return-sync.js';
import { syncStockToMarketplaces, checkLowStockAlerts } from './job-stock-sync.js';
import { startStockAlertJob } from './job-stock-alerts.js';
import { processPendingBulkOperations } from './job-bulk-operations.js';
import { JobLockManager } from './job-lock.js';
import { logger } from './logger.js';
import { env } from '../config/env.js';
import { jobOrchestrator } from '../services/job-orchestrator.service.js';

/**
 * Cron job scheduler
 * 
 * DISABLED v3.1: Integration sync jobs are disabled during hard reset
 * TODO: Re-enable integration sync jobs when re-adding integrations from scratch
 */
export function initCronJobs(): void {
  if (env.NODE_ENV === 'test') {
    logger.info('⏸️ Cron jobs test modunda devre dışı');
    return;
  }

  // v3.1 HARD RESET: Disable integration sync cron jobs
  if (env.INTEGRATIONS_DISABLED) {
    logger.info('⏸️ [v3.1] API integration cron jobs devre dışı (hard reset mode)');
    logger.info('   - Sadece internal maintenance jobs aktif');
  }

  logger.info('⏰ Cron jobs başlatılıyor...');

  // DISABLED v3.1 - Integration sync jobs
  // TODO: Re-enable when re-adding integrations from scratch
  
  // Order sync: Every 15 minutes - DISABLED
  // cron.schedule('*/15 * * * *', async () => {
  //   logger.info('⏰ [CRON] Sipariş senkronizasyonu başlıyor...');
  //   try {
  //     await syncOrders();
  //   } catch (error) {
  //     logger.error('[CRON] Sipariş sync hatası:', error);
  //   }
  // });

  // Product sync: Every 15 minutes (canlı sistem için) - DISABLED
  // cron.schedule('*/15 * * * *', async () => {
  //   logger.info('⏰ [CRON] Ürün senkronizasyonu başlıyor...');
  //   try {
  //     await syncProducts();
  //   } catch (error) {
  //     logger.error('[CRON] Ürün sync hatası:', error);
  //   }
  // });

  // Return sync: Every 30 minutes - DISABLED
  // cron.schedule('*/30 * * * *', async () => {
  //   logger.info('⏰ [CRON] İade senkronizasyonu başlıyor...');
  //   try {
  //     await syncReturns();
  //   } catch (error) {
  //     logger.error('[CRON] İade sync hatası:', error);
  //   }
  // });

  // Stock sync to marketplaces: Every 15 minutes (canlı sistem için) - DISABLED
  // cron.schedule('*/15 * * * *', async () => {
  //   logger.info('⏰ [CRON] Stok senkronizasyonu başlıyor...');
  //   try {
  //     await syncStockToMarketplaces();
  //   } catch (error) {
  //     logger.error('[CRON] Stok sync hatası:', error);
  //   }
  // });

  // Low stock alerts: Every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('⏰ [CRON] Düşük stok kontrolü başlıyor...');
    try {
      await checkLowStockAlerts();
    } catch (error) {
      logger.error('[CRON] Düşük stok kontrolü hatası:', error);
    }
  });

  // Daily cleanup: Every day at 3 AM
  cron.schedule('0 3 * * *', async () => {
    logger.info('⏰ [CRON] Günlük temizlik başlıyor...');
    try {
      await dailyCleanup();
    } catch (error) {
      logger.error('[CRON] Günlük temizlik hatası:', error);
    }
  });

  // Stock alert job (with distributed lock): 09:00 ve 16:00
  startStockAlertJob();

  // Bulk operations: Every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('⏰ [CRON] Bulk operations işleniyor...');
    try {
      await processPendingBulkOperations();
    } catch (error) {
      logger.error('[CRON] Bulk operations hatası:', error);
    }
  });

  // Job lock auto cleanup
  JobLockManager.startAutoCleanup();

  // Register jobs with orchestrator (optional - for future workflow orchestration)
  // DISABLED v3.1 - Integration sync jobs
  if (!env.INTEGRATIONS_DISABLED) {
    registerJobsWithOrchestrator();
  }

  logger.info('✅ Cron jobs aktif:');
  if (env.INTEGRATIONS_DISABLED) {
    logger.info('   - [v3.1] Integration sync jobs: DISABLED (hard reset mode)');
  } else {
    // logger.info('   - Sipariş sync: Her 15 dakikada');
    // logger.info('   - Ürün sync: Her 15 dakikada (canlı sistem)');
    // logger.info('   - İade sync: Her 30 dakikada');
    // logger.info('   - Stok sync: Her 15 dakikada (canlı sistem)');
  }
  logger.info('   - Düşük stok uyarıları: Her saat başı (eski)');
  logger.info('   - Düşük stok uyarıları (YENİ): 09:00 ve 16:00 (distributed lock)');
  logger.info('   - Günlük temizlik: Her gün 03:00');
  logger.info('   - Job lock cleanup: Her 1 dakikada');
}

/**
 * Daily cleanup tasks
 */
async function dailyCleanup(): Promise<void> {
  const { prisma } = await import('../config/index.js');
  
  // Delete old sync logs (older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const deleted = await prisma.syncLog.deleteMany({
    where: {
      createdAt: { lt: thirtyDaysAgo },
    },
  });

  logger.info(`[CLEANUP] ${deleted.count} eski sync log silindi`);
}

/**
 * Register jobs with orchestrator for workflow orchestration
 * 
 * DISABLED v3.1: Integration sync jobs are not registered during hard reset
 */
function registerJobsWithOrchestrator(): void {
  // DISABLED v3.1 - Integration sync jobs
  // TODO: Re-enable when re-adding integrations from scratch
  // jobOrchestrator.registerJob('syncOrders', () => syncOrders());
  // jobOrchestrator.registerJob('syncProducts', () => syncProducts());
  // jobOrchestrator.registerJob('syncReturns', () => syncReturns());
  // jobOrchestrator.registerJob('syncStockToMarketplaces', () => syncStockToMarketplaces());
  
  // Keep internal jobs
  jobOrchestrator.registerJob('processPendingBulkOperations', () => processPendingBulkOperations());
  
  logger.info('✅ Jobs registered with orchestrator');
}

/**
 * Manual trigger functions for admin use
 */
export { syncOrders, syncProducts, syncIntegrationProducts, syncReturns, syncIntegrationReturns, syncStockToMarketplaces, checkLowStockAlerts, processPendingBulkOperations };

