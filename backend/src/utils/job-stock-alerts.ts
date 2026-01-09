/**
 * Cron Job: Stock Alerts
 * 
 * Düşük stok kontrolü yapan otomatik görev
 * Günde 2 kez çalışır (sabah 09:00, öğleden sonra 16:00)
 */

import cron from 'node-cron';
import { stockAlertService } from '../services/stock-alert.service.js';
import { logger } from './logger.js';
import { runWithLock } from './job-lock.js';

/**
 * Düşük stok kontrolü job'ı
 */
export async function runStockAlertCheck(): Promise<void> {
  logger.info('[CRON] Starting stock alert check job...');

  try {
    const summaries = await stockAlertService.checkAllCompanies();

    logger.info('[CRON] Stock alert check completed', {
      companiesWithAlerts: summaries.length,
      totalAlerts: summaries.reduce((sum, s) => sum + s.totalAlerts, 0),
      criticalAlerts: summaries.reduce((sum, s) => sum + s.criticalAlerts, 0),
    });
  } catch (error) {
    logger.error('[CRON] Stock alert check failed:', error);
    throw error;
  }
}

/**
 * Cron job'ı başlat
 * Schedule: Her gün saat 09:00 ve 16:00'da çalışır
 */
export function startStockAlertJob(): void {
  // Günde 2 kez: 09:00 ve 16:00
  cron.schedule('0 9,16 * * *', async () => {
    logger.info('[CRON] Stock alert job triggered');

    await runWithLock(
      'stockAlertCheck',
      runStockAlertCheck,
      {
        lockDurationMs: 30 * 60 * 1000, // 30 dakika
        metadata: { jobType: 'stockAlert' },
      }
    );
  });

  logger.info('[CRON] Stock alert job scheduled (09:00, 16:00 daily)');
}

