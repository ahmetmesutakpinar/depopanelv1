/**
 * Health Service
 * 
 * Health check logic for system dependencies.
 * 
 * Architecture:
 * - Interface layer only
 * - No business logic
 * - Fast execution with timeouts
 * - No side effects
 * 
 * Usage:
 * ```ts
 * const healthService = new HealthService();
 * const health = await healthService.checkHealth();
 * const readiness = await healthService.checkReadiness();
 * ```
 */

import { prisma } from '../../../config/database.js';

/**
 * Health Check Result
 */
export interface HealthCheckResult {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

/**
 * Readiness Check Result
 */
export interface ReadinessCheckResult {
  status: 'ready' | 'not_ready';
  checks: {
    database: 'ok' | 'fail';
    redis: 'ok' | 'fail';
    queue: 'ok' | 'fail';
  };
}

/**
 * Health Service
 * 
 * Provides health and readiness checks for system dependencies.
 */
export class HealthService {
  private readonly CHECK_TIMEOUT_MS = 5000; // 5 seconds timeout per check

  /**
   * Check Health
   * 
   * Basic health check - no dependency checks.
   * Always returns ok if service is running.
   * 
   * @returns Health check result
   */
  async checkHealth(): Promise<HealthCheckResult> {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check Readiness
   * 
   * Checks all critical dependencies:
   * - Database connectivity
   * - Redis connectivity
   * - Job queue availability
   * 
   * @returns Readiness check result
   */
  async checkReadiness(): Promise<ReadinessCheckResult> {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      queue: await this.checkQueue(),
    };

    const allOk = Object.values(checks).every((status) => status === 'ok');
    const status = allOk ? 'ready' : 'not_ready';

    return {
      status,
      checks,
    };
  }

  /**
   * Check Database Connectivity
   * 
   * Pings the database using Prisma.
   * 
   * @returns 'ok' or 'fail'
   */
  private async checkDatabase(): Promise<'ok' | 'fail'> {
    try {
      // Use Promise.race to implement timeout
      const checkPromise = prisma.$queryRaw`SELECT 1 as ping`;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database check timeout')), this.CHECK_TIMEOUT_MS);
      });

      await Promise.race([checkPromise, timeoutPromise]);
      return 'ok';
    } catch (error) {
      // Silently fail - don't log here (let controller handle logging)
      return 'fail';
    }
  }

  /**
   * Check Redis Connectivity
   * 
   * Pings Redis connection.
   * 
   * @returns 'ok' or 'fail'
   */
  private async checkRedis(): Promise<'ok' | 'fail'> {
    let redis: any = null;
    try {
      // Check if ioredis is available
      // @ts-ignore - ioredis will be available after installation
      const Redis = require('ioredis');

      // Get Redis connection config (same as job queue)
      const connection = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        connectTimeout: this.CHECK_TIMEOUT_MS,
        lazyConnect: true,
      };

      redis = new Redis(connection);

      // Connect first (lazyConnect is true, so we need to explicitly connect)
      await redis.connect();

      // Use Promise.race to implement timeout
      const checkPromise = redis.ping();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Redis check timeout')), this.CHECK_TIMEOUT_MS);
      });

      const result = await Promise.race([checkPromise, timeoutPromise]);

      if (result === 'PONG') {
        // Close connection before returning
        try {
          await redis.quit();
        } catch {
          // Ignore quit errors
        }
        return 'ok';
      }

      // Close connection on failure
      try {
        await redis.quit();
      } catch {
        // Ignore quit errors
      }
      return 'fail';
    } catch (error) {
      // Close connection if it was created
      if (redis) {
        try {
          await redis.quit();
        } catch {
          // Ignore quit errors
        }
      }
      // Redis not available or connection failed
      return 'fail';
    }
  }

  /**
   * Check Job Queue Availability
   * 
   * Checks if job queue is initialized and available.
   * 
   * @returns 'ok' or 'fail'
   */
  private async checkQueue(): Promise<'ok' | 'fail'> {
    try {
      // Check if BullMQ is available
      try {
        // @ts-ignore - BullMQ will be available after installation
        require('bullmq');
      } catch {
        // BullMQ not installed - queue is not available
        return 'fail';
      }

      // Check if queue is initialized
      // Import dynamically to avoid circular dependencies
      const { marketplaceSyncQueue } = await import('../../../infrastructure/jobs/index.js');

      if (!marketplaceSyncQueue) {
        return 'fail';
      }

      // Try to get queue info (non-blocking check)
      // @ts-ignore - Queue methods will be available after BullMQ installation
      const client = marketplaceSyncQueue.client;
      
      if (!client) {
        return 'fail';
      }

      // Check Redis client status (ioredis client)
      // @ts-ignore - Client status will be available after ioredis installation
      const status = client.status;
      
      // Status can be: 'ready', 'connecting', 'end', 'close', 'reconnecting'
      const isReady = status === 'ready' || status === 'reconnecting';

      return isReady ? 'ok' : 'fail';
    } catch (error) {
      // Queue not initialized or check failed
      return 'fail';
    }
  }
}

/**
 * Default Health Service Instance
 */
export const healthService = new HealthService();

