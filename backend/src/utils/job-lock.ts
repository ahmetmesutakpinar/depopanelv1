/**
 * Distributed Job Lock System
 * 
 * Cron job'ların birden fazla instance'da aynı anda çalışmasını önler.
 * Database-based locking mekanizması kullanır.
 */

import { prisma } from '../config/index.js';
import { logger } from './logger.js';

export interface JobLockOptions {
  jobName: string;
  lockDurationMs?: number; // Default: 10 minutes
  metadata?: any;
}

export class JobLockManager {
  private static readonly DEFAULT_LOCK_DURATION = 10 * 60 * 1000; // 10 dakika
  private static readonly CLEANUP_INTERVAL = 60 * 1000; // 1 dakika

  /**
   * Job için lock almaya çalış
   * @returns lock alındıysa true, alınamadıysa false
   */
  static async acquireLock(options: JobLockOptions): Promise<boolean> {
    const { jobName, lockDurationMs = this.DEFAULT_LOCK_DURATION, metadata } = options;

    try {
      const expiresAt = new Date(Date.now() + lockDurationMs);

      // Önce expired lock'ları temizle
      await this.cleanupExpiredLocks();

      // Mevcut lock var mı kontrol et
      const existingLock = await prisma.jobLock.findUnique({
        where: { jobName },
      });

      if (existingLock) {
        // Lock hala geçerliyse lock alamayız
        if (existingLock.expiresAt > new Date()) {
          logger.warn(`Job lock already exists for: ${jobName}, expires at: ${existingLock.expiresAt}`);
          return false;
        }

        // Expired lock varsa güncelle
        await prisma.jobLock.update({
          where: { jobName },
          data: {
            lockedAt: new Date(),
            expiresAt,
            lockedBy: this.getInstanceId(),
            metadata,
          },
        });

        logger.info(`Job lock acquired (updated expired): ${jobName}`);
        return true;
      }

      // Yeni lock oluştur
      await prisma.jobLock.create({
        data: {
          jobName,
          lockedAt: new Date(),
          expiresAt,
          lockedBy: this.getInstanceId(),
          metadata,
        },
      });

      logger.info(`Job lock acquired (new): ${jobName}`);
      return true;
    } catch (error: any) {
      // Unique constraint violation = başka bir instance lock'u aldı
      if (error.code === 'P2002') {
        logger.warn(`Job lock race condition for: ${jobName}`);
        return false;
      }

      logger.error(`Error acquiring job lock for ${jobName}:`, error);
      return false;
    }
  }

  /**
   * Lock'u serbest bırak
   */
  static async releaseLock(jobName: string): Promise<void> {
    try {
      await prisma.jobLock.delete({
        where: { jobName },
      });

      logger.info(`Job lock released: ${jobName}`);
    } catch (error: any) {
      // Lock zaten yoksa sorun değil
      if (error.code === 'P2025') {
        logger.debug(`Job lock already released: ${jobName}`);
        return;
      }

      logger.error(`Error releasing job lock for ${jobName}:`, error);
    }
  }

  /**
   * Lock'u uzat (job hala çalışıyorsa)
   */
  static async extendLock(
    jobName: string,
    additionalMs: number = this.DEFAULT_LOCK_DURATION
  ): Promise<boolean> {
    try {
      const lock = await prisma.jobLock.findUnique({
        where: { jobName },
      });

      if (!lock) {
        logger.warn(`Cannot extend lock, lock not found: ${jobName}`);
        return false;
      }

      const newExpiresAt = new Date(Date.now() + additionalMs);

      await prisma.jobLock.update({
        where: { jobName },
        data: { expiresAt: newExpiresAt },
      });

      logger.info(`Job lock extended: ${jobName}, new expiry: ${newExpiresAt}`);
      return true;
    } catch (error) {
      logger.error(`Error extending job lock for ${jobName}:`, error);
      return false;
    }
  }

  /**
   * Expired lock'ları temizle
   */
  static async cleanupExpiredLocks(): Promise<number> {
    try {
      const result = await prisma.jobLock.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired job locks`);
      }

      return result.count;
    } catch (error) {
      logger.error('Error cleaning up expired job locks:', error);
      return 0;
    }
  }

  /**
   * Belirli bir job'ın lock durumunu kontrol et
   */
  static async isLocked(jobName: string): Promise<boolean> {
    try {
      const lock = await prisma.jobLock.findUnique({
        where: { jobName },
      });

      if (!lock) {
        return false;
      }

      // Lock expired mi?
      if (lock.expiresAt <= new Date()) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Error checking job lock for ${jobName}:`, error);
      return false;
    }
  }

  /**
   * Tüm aktif lock'ları listele
   */
  static async listActiveLocks(): Promise<any[]> {
    try {
      const locks = await prisma.jobLock.findMany({
        where: {
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: { lockedAt: 'desc' },
      });

      return locks;
    } catch (error) {
      logger.error('Error listing active job locks:', error);
      return [];
    }
  }

  /**
   * Force unlock (acil durumlarda kullanılır)
   */
  static async forceUnlock(jobName: string): Promise<void> {
    try {
      await prisma.jobLock.delete({
        where: { jobName },
      });

      logger.warn(`Job lock forcefully released: ${jobName}`);
    } catch (error) {
      logger.error(`Error force unlocking job ${jobName}:`, error);
    }
  }

  /**
   * Instance ID üret (process bazlı benzersiz ID)
   */
  private static getInstanceId(): string {
    return `${process.env.INSTANCE_ID || 'default'}-${process.pid}`;
  }

  /**
   * Otomatik cleanup başlat (background task)
   */
  static startAutoCleanup(): NodeJS.Timeout {
    logger.info('Starting automatic job lock cleanup');

    return setInterval(async () => {
      await this.cleanupExpiredLocks();
    }, this.CLEANUP_INTERVAL);
  }
}

/**
 * Helper function: Job'ı lock ile çalıştır
 * 
 * @example
 * await runWithLock('syncOrders', async () => {
 *   // Job logic here
 * });
 */
export async function runWithLock<T>(
  jobName: string,
  jobFn: () => Promise<T>,
  options?: {
    lockDurationMs?: number;
    metadata?: any;
  }
): Promise<T | null> {
  const lockAcquired = await JobLockManager.acquireLock({
    jobName,
    ...options,
  });

  if (!lockAcquired) {
    logger.warn(`Could not acquire lock for job: ${jobName}, skipping execution`);
    return null;
  }

  try {
    logger.info(`Executing job with lock: ${jobName}`);
    const result = await jobFn();
    logger.info(`Job completed successfully: ${jobName}`);
    return result;
  } catch (error) {
    logger.error(`Job failed: ${jobName}`, error);
    throw error;
  } finally {
    await JobLockManager.releaseLock(jobName);
  }
}

