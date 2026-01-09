/**
 * Job Queue Setup
 * 
 * BullMQ queue configuration and initialization.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Provides queue, worker, and scheduler instances
 * - Handles Redis connection
 * - Decoupled from HTTP layer
 * 
 * NOTE: BullMQ and Redis must be installed:
 * npm install bullmq ioredis
 * npm install --save-dev @types/ioredis
 * 
 * After installation, remove @ts-ignore comments and use proper types.
 */

// @ts-ignore - BullMQ types will be available after installation
import type { Queue, Worker, QueueScheduler, QueueEvents } from 'bullmq';
// @ts-ignore - ioredis types will be available after installation
import type { ConnectionOptions } from 'ioredis';
import { JobType, SyncOrdersJobPayload, SyncStockJobPayload, SyncMarketplaceJobPayload } from '../types.js';

/**
 * Redis Connection Configuration
 * 
 * TODO: Add Redis connection string to environment variables
 * REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, etc.
 */
function getRedisConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Required for BullMQ
  };
}

/**
 * Job Queue Configuration
 */
export interface JobQueueConfig {
  /**
   * Queue name
   */
  name: string;

  /**
   * Maximum number of concurrent jobs
   * @default 5
   */
  concurrency?: number;

  /**
   * Maximum number of retry attempts
   * @default 3
   */
  attempts?: number;

  /**
   * Delay between retries in milliseconds
   * @default 5000
   */
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

/**
 * Create a BullMQ Queue instance
 * 
 * NOTE: After installing BullMQ, remove @ts-ignore and use proper Queue type
 */
export function createQueue<T = unknown>(name: string): any {
  // @ts-ignore - Queue will be available after BullMQ installation
  const { Queue } = require('bullmq');
  return new Queue<T>(name, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  });
}

/**
 * Create a BullMQ Worker instance
 * 
 * NOTE: After installing BullMQ, remove @ts-ignore and use proper Worker type
 */
export function createWorker<T = unknown>(
  name: string,
  processor: (job: { data: T }) => Promise<unknown>,
  config?: JobQueueConfig
): any {
  // @ts-ignore - Worker will be available after BullMQ installation
  const { Worker } = require('bullmq');
  return new Worker<T>(
    name,
    processor,
    {
      connection: getRedisConnection(),
      concurrency: config?.concurrency ?? 5,
      limiter: {
        max: 10, // Maximum 10 jobs per duration
        duration: 1000, // Per 1 second
      },
    }
  );
}

/**
 * Create a BullMQ QueueScheduler instance
 * 
 * QueueScheduler is required for delayed jobs and repeatable jobs.
 * 
 * NOTE: After installing BullMQ, remove @ts-ignore and use proper QueueScheduler type
 */
export function createQueueScheduler(name: string): any {
  // @ts-ignore - QueueScheduler will be available after BullMQ installation
  const { QueueScheduler } = require('bullmq');
  return new QueueScheduler(name, {
    connection: getRedisConnection(),
  });
}

/**
 * Create a BullMQ QueueEvents instance
 * 
 * QueueEvents provides real-time event notifications for queue operations.
 * 
 * NOTE: After installing BullMQ, remove @ts-ignore and use proper QueueEvents type
 */
export function createQueueEvents(name: string): any {
  // @ts-ignore - QueueEvents will be available after BullMQ installation
  const { QueueEvents } = require('bullmq');
  return new QueueEvents(name, {
    connection: getRedisConnection(),
  });
}

/**
 * Marketplace Sync Queue
 * 
 * Queue for marketplace synchronization jobs
 * 
 * NOTE: Queue instances are created lazily when BullMQ is installed.
 * Until then, these will be undefined. Add runtime checks before use.
 */
export let marketplaceSyncQueue: any;

/**
 * Queue Scheduler for marketplace sync
 * 
 * Handles delayed and repeatable jobs
 */
export let marketplaceSyncScheduler: any;

/**
 * Queue Events for marketplace sync
 * 
 * Provides event notifications
 */
export let marketplaceSyncEvents: any;

/**
 * Initialize Queue Instances
 * 
 * Creates queue, scheduler, and events instances.
 * Should be called after BullMQ is installed and Redis is available.
 */
export function initializeQueueInstances(): void {
  // Only initialize if BullMQ is available
  try {
    // @ts-ignore - Check if BullMQ is installed
    require('bullmq');
    marketplaceSyncQueue = createQueue<SyncOrdersJobPayload | SyncStockJobPayload | SyncMarketplaceJobPayload>(
      'marketplace-sync'
    );
    marketplaceSyncScheduler = createQueueScheduler('marketplace-sync');
    marketplaceSyncEvents = createQueueEvents('marketplace-sync');
  } catch (error) {
    // BullMQ not installed - queues will be undefined
    // This is expected during development
    console.warn('[JobQueue] BullMQ not installed. Job queues will not be available.');
  }
}

/**
 * Initialize Job Queue Infrastructure
 * 
 * Sets up queues, workers, and schedulers.
 * Should be called during application startup.
 * 
 * TODO: Add graceful shutdown handlers
 * TODO: Add queue health checks
 * TODO: Add queue metrics
 */
export async function initializeJobQueues(): Promise<void> {
  // Initialize queue instances
  initializeQueueInstances();
  
  // TODO: Add Redis connection health check
  // TODO: Start queue schedulers
  // TODO: Start queue event listeners
}

/**
 * Shutdown Job Queue Infrastructure
 * 
 * Gracefully shuts down queues, workers, and schedulers.
 * Should be called during application shutdown.
 */
export async function shutdownJobQueues(): Promise<void> {
  try {
    // Close queue events
    if (marketplaceSyncEvents) {
      // @ts-ignore - QueueEvents will be available after BullMQ installation
      await marketplaceSyncEvents.close();
    }

    // Close queue scheduler
    if (marketplaceSyncScheduler) {
      // @ts-ignore - QueueScheduler will be available after BullMQ installation
      await marketplaceSyncScheduler.close();
    }

    // Close queues (this also closes Redis connections)
    if (marketplaceSyncQueue) {
      // @ts-ignore - Queue will be available after BullMQ installation
      await marketplaceSyncQueue.close();
    }
  } catch (error) {
    // Log error but don't throw - allow shutdown to continue
    console.error('[Shutdown] Error closing job queues:', error);
  }
}

