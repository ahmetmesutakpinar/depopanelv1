/**
 * Idempotency Infrastructure
 * 
 * Idempotency and deduplication for requests, jobs, and webhooks.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Prevents duplicate side effects
 * - Redis preferred, database fallback
 * - Observable (logging + metrics)
 * 
 * Components:
 * - idempotency.repository.ts - Storage layer
 * - idempotency.service.ts - Core logic
 * - idempotency.middleware.ts - HTTP middleware
 * 
 * Usage:
 * ```ts
 * // HTTP middleware
 * import { idempotencyMiddleware } from './infrastructure/idempotency/index.js';
 * router.post('/endpoint', idempotencyMiddleware, controller.method);
 * 
 * // Job processor
 * import { idempotencyService } from './infrastructure/idempotency/index.js';
 * const key = idempotencyService.generateKey('job', job.data);
 * const result = await idempotencyService.execute(key, async () => {
 *   // Job processing logic
 * });
 * ```
 */

// Repository
export {
  idempotencyRepository,
  type IIdempotencyRepository,
  type IdempotencyRecord,
  type IdempotencyStatus,
} from './idempotency.repository.js';

// Service
export {
  IdempotencyService,
  idempotencyService,
  type IdempotencyOptions,
} from './idempotency.service.js';

// Middleware
export {
  idempotencyMiddleware,
  idempotencyWrapper,
  type IdempotentRequest,
} from './idempotency.middleware.js';

