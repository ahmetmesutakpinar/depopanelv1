/**
 * Idempotency Service
 * 
 * Core logic for idempotency key management.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Coordinates idempotency checks and storage
 * - Handles locking and unlocking
 * - No business logic
 * 
 * Usage:
 * ```ts
 * const service = new IdempotencyService();
 * const result = await service.execute(key, async () => {
 *   // Operation to execute
 *   return { data: 'result' };
 * });
 * ```
 */

import { idempotencyRepository, IIdempotencyRepository, IdempotencyRecord, IdempotencyStatus } from './idempotency.repository.js';
import { logger } from '../observability/logger.js';
import { metrics } from '../observability/metrics.js';

/**
 * Idempotency Options
 */
export interface IdempotencyOptions {
  /**
   * Time to live in seconds
   * @default 3600 (1 hour)
   */
  ttlSeconds?: number;

  /**
   * Lock timeout in seconds
   * @default 300 (5 minutes)
   */
  lockTimeoutSeconds?: number;
}

/**
 * Idempotency Service
 * 
 * Manages idempotency keys and ensures operations are idempotent.
 */
export class IdempotencyService {
  constructor(
    private readonly repository: IIdempotencyRepository = idempotencyRepository
  ) {}

  /**
   * Execute Operation with Idempotency
   * 
   * Executes an operation with idempotency protection.
   * If the key exists, returns the stored result.
   * If not, locks the key, executes the operation, and stores the result.
   * 
   * @param key Idempotency key
   * @param operation Operation to execute
   * @param options Idempotency options
   * @returns Operation result
   */
  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    options: IdempotencyOptions = {}
  ): Promise<T> {
    const ttlSeconds = options.ttlSeconds ?? 3600; // 1 hour default
    const lockTimeoutSeconds = options.lockTimeoutSeconds ?? 300; // 5 minutes default

    // Check if key exists
    const existing = await this.repository.get(key);

    if (existing) {
      // Key exists - check status
      if (existing.status === 'completed' && existing.response) {
        logger.info('Idempotency hit: returning stored result', { key });
        metrics.increment('idempotency.hit', { status: 'completed' });

        try {
          return JSON.parse(existing.response) as T;
        } catch (error) {
          logger.error('Error parsing stored idempotency response', error, { key });
          // Continue to execute operation if parsing fails
        }
      }

      if (existing.status === 'processing') {
        logger.warn('Idempotency key is already processing', { key });
        metrics.increment('idempotency.hit', { status: 'processing' });
        
        // Wait a bit and check again (operation might be in progress)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const retry = await this.repository.get(key);
        
        if (retry && retry.status === 'completed' && retry.response) {
          try {
            return JSON.parse(retry.response) as T;
          } catch {
            // Continue to execute
          }
        }

        // If still processing or failed, throw error
        throw new Error('Operation is already in progress');
      }

      if (existing.status === 'failed') {
        logger.warn('Idempotency key has failed status, retrying operation', { key });
        metrics.increment('idempotency.hit', { status: 'failed' });
        // Continue to execute (retry failed operation)
      }
    }

    // Try to acquire lock
    const lockAcquired = await this.repository.lock(key, lockTimeoutSeconds);

    if (!lockAcquired) {
      logger.warn('Idempotency key is locked, operation may be in progress', { key });
      metrics.increment('idempotency.lock_failed');
      
      // Wait and check again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const retry = await this.repository.get(key);
      
      if (retry && retry.status === 'completed' && retry.response) {
        try {
          return JSON.parse(retry.response) as T;
        } catch {
          throw new Error('Operation is already in progress');
        }
      }

      throw new Error('Operation is already in progress');
    }

    try {
      logger.info('Idempotency key acquired, executing operation', { key });
      metrics.increment('idempotency.execute');

      // Mark as processing
      await this.repository.set(
        key,
        {
          status: 'processing',
        },
        ttlSeconds
      );

      // Execute operation
      const result = await operation();

      // Store successful result
      await this.repository.set(
        key,
        {
          status: 'completed',
          response: JSON.stringify(result),
        },
        ttlSeconds
      );

      logger.info('Idempotency key completed, result stored', { key });
      metrics.increment('idempotency.completed');

      return result;
    } catch (error) {
      // Store failed result
      await this.repository.set(
        key,
        {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
        ttlSeconds
      );

      logger.error('Idempotency key failed', error, { key });
      metrics.increment('idempotency.failed');

      throw error;
    } finally {
      // Release lock
      await this.repository.unlock(key);
    }
  }

  /**
   * Generate Idempotency Key from Payload
   * 
   * Generates a deterministic idempotency key from a payload.
   * Useful for jobs and webhooks.
   * 
   * @param prefix Key prefix (e.g., 'job', 'webhook')
   * @param payload Payload to hash
   * @returns Idempotency key
   */
  generateKey(prefix: string, payload: unknown): string {
    const crypto = require('crypto');
    const payloadStr = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(payloadStr).digest('hex');
    return `${prefix}:${hash}`;
  }
}

/**
 * Default Idempotency Service Instance
 */
export const idempotencyService = new IdempotencyService();

