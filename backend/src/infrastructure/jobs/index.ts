/**
 * Job Queue Infrastructure
 * 
 * Background job processing using BullMQ.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Decoupled from HTTP layer
 * - Uses DI container to resolve use cases
 * - Handles retries and concurrency
 * 
 * Structure:
 * - queue/ - Queue setup and configuration
 * - processors/ - Job processors (call use cases)
 * - types.ts - Job type definitions
 * 
 * Usage:
 * ```ts
 * import { marketplaceSyncQueue, JobType } from './infrastructure/jobs/index.js';
 * 
 * await marketplaceSyncQueue.add(JobType.SYNC_ORDERS, {
 *   companyId: '...',
 *   integrationId: '...',
 *   startDate: '2024-01-01T00:00:00Z',
 * });
 * ```
 * 
 * NOTE: BullMQ and Redis must be installed:
 * npm install bullmq ioredis
 * npm install --save-dev @types/ioredis
 * 
 * Redis connection must be configured via environment variables:
 * - REDIS_HOST (default: localhost)
 * - REDIS_PORT (default: 6379)
 * - REDIS_PASSWORD (optional)
 * 
 * Future Enhancements:
 * - Job scheduling (cron-like)
 * - Job prioritization
 * - Job dependencies
 * - Job progress tracking
 * - Job result storage
 * - Worker scaling
 * - Queue monitoring dashboard
 */

// Queue
export {
  createQueue,
  createWorker,
  createQueueScheduler,
  createQueueEvents,
  marketplaceSyncQueue,
  marketplaceSyncScheduler,
  marketplaceSyncEvents,
  initializeQueueInstances,
  initializeJobQueues,
  shutdownJobQueues,
} from './queue/job-queue.js';

// Workers
export {
  createMarketplaceSyncWorker,
  initializeWorkers,
  shutdownWorkers,
} from './queue/worker.js';

// Processors
export {
  processSyncOrdersJob,
  processSyncStockJob,
  processSyncMarketplaceJob,
} from './processors/index.js';

// Types
export {
  JobType,
  BaseJobPayload,
  SyncOrdersJobPayload,
  SyncStockJobPayload,
  SyncMarketplaceJobPayload,
  JobResult,
} from './types.js';

