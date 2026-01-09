/**
 * Job Wrapper Utility
 * 
 * Provides retry logic, error handling, and status tracking for cron jobs
 */

import { logger } from './logger.js';
import { retry } from './retry-helper.js';
import { prisma } from '../config/index.js';
import { runWithLock } from './job-lock.js';

export interface JobContext {
  jobName: string;
  integrationId?: string;
  companyId?: string;
  metadata?: Record<string, any>;
  useLock?: boolean; // Enable distributed lock
  lockDurationMs?: number; // Lock duration in milliseconds
}

export interface JobResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
  duration: number;
}

/**
 * Wraps a job function with retry logic, error handling, and logging
 */
export async function runJobWithRetry<T>(
  context: JobContext,
  jobFn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    timeout?: number;
    logToDatabase?: boolean;
  }
): Promise<T> {
  // Distributed lock varsa kullan
  if (context.useLock) {
    const result = await runWithLock(
      context.jobName,
      () => runJobWithRetryInternal(context, jobFn, options),
      {
        lockDurationMs: context.lockDurationMs,
        metadata: context.metadata,
      }
    );

    if (result === null) {
      throw new Error(`Could not acquire lock for job: ${context.jobName}`);
    }

    return result;
  }

  // Lock olmadan çalıştır
  return runJobWithRetryInternal(context, jobFn, options);
}

/**
 * Internal job runner (lock olmadan)
 */
async function runJobWithRetryInternal<T>(
  context: JobContext,
  jobFn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    timeout?: number;
    logToDatabase?: boolean;
  }
): Promise<T> {
  const startTime = Date.now();
  const maxRetries = options?.maxRetries ?? 1; // Default: no retry at job level (retry is in integration level)
  const timeout = options?.timeout ?? 600000; // 10 minutes default
  const logToDatabase = options?.logToDatabase ?? true;

  logger.info(`[JOB] ${context.jobName} başlatılıyor...`, {
    integrationId: context.integrationId,
    companyId: context.companyId,
    metadata: context.metadata,
  });

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Job timeout after ${timeout}ms`));
      }, timeout);
    });

    // Run job with timeout
    const result = await Promise.race([
      retry(jobFn, {
        maxRetries,
        initialDelay: 5000,
        retryableErrors: [408, 429, 500, 502, 503, 504],
        onRetry: (attempt, error) => {
          logger.warn(`[JOB] ${context.jobName} retry ${attempt}:`, {
            error: error?.message || error,
            integrationId: context.integrationId,
          });
        },
      }),
      timeoutPromise,
    ]);

    const duration = Date.now() - startTime;
    logger.info(`[JOB] ${context.jobName} başarıyla tamamlandı`, {
      duration: `${duration}ms`,
      integrationId: context.integrationId,
      companyId: context.companyId,
    });

    // Log success to database (only if marketplace info is available)
    if (logToDatabase && context.companyId && context.metadata?.marketplaceType) {
      await prisma.syncLog.create({
        data: {
          type: context.jobName as any,
          marketplace: context.metadata.marketplaceType as any,
          status: 'SUCCESS',
          message: `Job completed successfully in ${duration}ms`,
          companyId: context.companyId,
          metadata: context.metadata,
        },
      }).catch((err) => {
        logger.error(`[JOB] Failed to log success to database:`, err);
      });
    }

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMessage = error?.message || 'Bilinmeyen hata';
    const errorStack = error?.stack;

    logger.error(`[JOB] ${context.jobName} başarısız:`, {
      error: errorMessage,
      stack: errorStack,
      duration: `${duration}ms`,
      integrationId: context.integrationId,
      companyId: context.companyId,
    });

    // Log error to database (only if marketplace info is available)
    if (logToDatabase && context.companyId && context.metadata?.marketplaceType) {
      await prisma.syncLog.create({
        data: {
          type: context.jobName as any,
          marketplace: context.metadata.marketplaceType as any,
          status: 'FAILED',
          message: errorMessage,
          error: errorStack,
          companyId: context.companyId,
          metadata: {
            ...context.metadata,
            duration,
            errorType: error?.name || 'Error',
          },
        },
      }).catch((err) => {
        logger.error(`[JOB] Failed to log error to database:`, err);
      });
    }

    throw error;
  }
}

/**
 * Wraps a job that processes items in batches
 */
export async function runBatchJob<T, R>(
  context: JobContext,
  items: T[],
  batchFn: (batch: T[]) => Promise<R>,
  options?: {
    batchSize?: number;
    maxRetries?: number;
    timeout?: number;
    continueOnError?: boolean;
  }
): Promise<JobResult> {
  const startTime = Date.now();
  const batchSize = options?.batchSize ?? 10;
  const maxRetries = options?.maxRetries ?? 2;
  const timeout = options?.timeout ?? 300000; // 5 minutes per batch
  const continueOnError = options?.continueOnError ?? true;

  logger.info(`[BATCH JOB] ${context.jobName} başlatılıyor...`, {
    totalItems: items.length,
    batchSize,
    integrationId: context.integrationId,
    companyId: context.companyId,
  });

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);

    logger.info(`[BATCH JOB] ${context.jobName} - Batch ${batchNumber}/${totalBatches} işleniyor...`, {
      batchSize: batch.length,
      progress: `${i + batch.length}/${items.length}`,
    });

    try {
      await runJobWithRetry(
        {
          ...context,
          jobName: `${context.jobName} - Batch ${batchNumber}`,
          metadata: {
            ...context.metadata,
            batchNumber,
            batchSize: batch.length,
          },
        },
        () => batchFn(batch),
        {
          maxRetries,
          timeout,
          logToDatabase: false, // Don't log each batch separately
        }
      );

      processed += batch.length;
      logger.info(`[BATCH JOB] ${context.jobName} - Batch ${batchNumber} tamamlandı`, {
        processed: `${processed}/${items.length}`,
      });
    } catch (error: any) {
      failed += batch.length;
      const errorMessage = error?.message || 'Bilinmeyen hata';
      errors.push(`Batch ${batchNumber}: ${errorMessage}`);

      logger.error(`[BATCH JOB] ${context.jobName} - Batch ${batchNumber} başarısız:`, {
        error: errorMessage,
        batchSize: batch.length,
      });

      if (!continueOnError) {
        throw error;
      }
    }
  }

  const duration = Date.now() - startTime;
  const result: JobResult = {
    success: failed === 0,
    processed,
    failed,
    errors: errors.length > 0 ? errors : undefined,
    duration,
  };

  // Log final result to database (only if marketplace info is available)
  if (context.companyId && context.metadata?.marketplaceType) {
    await prisma.syncLog.create({
      data: {
        type: context.jobName as any,
        marketplace: context.metadata.markplaceType as any,
        status: result.success ? 'SUCCESS' : 'PARTIAL',
        message: result.success
          ? `${processed} item processed successfully in ${duration}ms`
          : `${processed} processed, ${failed} failed in ${duration}ms`,
        error: errors.length > 0 ? errors.join('; ') : null,
        companyId: context.companyId,
        metadata: {
          ...context.metadata,
          totalItems: items.length,
          processed,
          failed,
          duration,
        },
      },
    }).catch((err) => {
      logger.error(`[BATCH JOB] Failed to log result to database:`, err);
    });
  }

  logger.info(`[BATCH JOB] ${context.jobName} tamamlandı`, {
    success: result.success,
    processed: result.processed,
    failed: result.failed,
    duration: `${result.duration}ms`,
  });

  return result;
}

/**
 * Circuit breaker for integrations that repeatedly fail
 */
class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailure: Map<string, number> = new Map();
  private readonly threshold = 5; // Fail 5 times in a row
  private readonly resetTimeout = 3600000; // 1 hour

  isOpen(integrationId: string): boolean {
    const failures = this.failures.get(integrationId) || 0;
    const lastFailureTime = this.lastFailure.get(integrationId) || 0;

    if (failures >= this.threshold) {
      // Check if enough time has passed to reset
      if (Date.now() - lastFailureTime > this.resetTimeout) {
        this.reset(integrationId);
        return false;
      }
      return true;
    }

    return false;
  }

  recordFailure(integrationId: string): void {
    const current = this.failures.get(integrationId) || 0;
    this.failures.set(integrationId, current + 1);
    this.lastFailure.set(integrationId, Date.now());
  }

  recordSuccess(integrationId: string): void {
    this.reset(integrationId);
  }

  private reset(integrationId: string): void {
    this.failures.delete(integrationId);
    this.lastFailure.delete(integrationId);
  }
}

export const circuitBreaker = new CircuitBreaker();

