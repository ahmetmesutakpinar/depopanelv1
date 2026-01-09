/**
 * Job Worker Setup
 * 
 * Sets up BullMQ workers for processing background jobs.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Routes jobs to appropriate processors
 * - Handles worker lifecycle
 * - Decoupled from HTTP layer
 * 
 * NOTE: BullMQ must be installed: npm install bullmq ioredis
 */

// @ts-ignore - BullMQ types will be available after installation
import type { Worker } from 'bullmq';
import { createWorker } from './job-queue.js';
import { JobType, SyncOrdersJobPayload, SyncStockJobPayload, SyncMarketplaceJobPayload } from '../types.js';
import {
  processSyncOrdersJob,
  processSyncStockJob,
  processSyncMarketplaceJob,
} from '../processors/index.js';

/**
 * Job Router
 * 
 * Routes jobs to appropriate processors based on job name.
 * 
 * NOTE: After installing BullMQ, the job parameter will have proper BullMQ Job type.
 */
async function jobRouter(
  // @ts-ignore - BullMQ Job type will be available after installation
  job: { name: string; data: unknown; id?: string; attemptsMade: number }
): Promise<unknown> {
  switch (job.name) {
    case JobType.SYNC_ORDERS:
      return processSyncOrdersJob(job as any);
    
    case JobType.SYNC_STOCK:
      return processSyncStockJob(job as any);
    
    case JobType.SYNC_MARKETPLACE:
      return processSyncMarketplaceJob(job as any);
    
    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}

/**
 * Create Marketplace Sync Worker
 * 
 * Creates a worker that processes all marketplace sync jobs.
 * 
 * NOTE: After installing BullMQ, remove @ts-ignore and use proper Worker type
 */
export function createMarketplaceSyncWorker(): any {
  return createWorker<SyncOrdersJobPayload | SyncStockJobPayload | SyncMarketplaceJobPayload>(
    'marketplace-sync',
    // @ts-ignore - BullMQ job type will be available after installation
    async (job: { name: string; data: unknown; id?: string; attemptsMade: number }) => {
      return jobRouter(job);
    },
    {
      concurrency: 5, // Process up to 5 jobs concurrently
      attempts: 3, // Retry up to 3 times
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 second delay
      },
    }
  );
}

/**
 * Initialize Workers
 * 
 * Creates and starts all workers.
 * Should be called during application startup.
 * 
 * TODO: Add worker health checks
 * TODO: Add worker metrics
 * TODO: Add graceful shutdown handlers
 */
export function initializeWorkers(): any[] {
  const workers: any[] = [];

  // Create marketplace sync worker
  const marketplaceSyncWorker = createMarketplaceSyncWorker();

  // Set up worker event handlers
  marketplaceSyncWorker.on('completed', (job) => {
    // TODO: Add logging
    console.log(`[Worker] Job ${job.id} completed`);
  });

  marketplaceSyncWorker.on('failed', (job, err) => {
    // TODO: Add logging
    console.error(`[Worker] Job ${job?.id} failed:`, err);
  });

  marketplaceSyncWorker.on('error', (err) => {
    // TODO: Add logging
    console.error(`[Worker] Error:`, err);
  });

  workers.push(marketplaceSyncWorker);

  return workers;
}

/**
 * Shutdown Workers
 * 
 * Gracefully shuts down all workers.
 * Should be called during application shutdown.
 */
export async function shutdownWorkers(workers: any[]): Promise<void> {
  await Promise.all(
    workers.map(async (worker) => {
      await worker.close();
    })
  );
}

