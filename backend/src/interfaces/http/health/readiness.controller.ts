/**
 * Readiness Controller
 * 
 * HTTP controller for readiness check endpoint.
 * 
 * Architecture:
 * - Interface layer only
 * - No business logic
 * - Checks all dependencies
 * - Returns 503 if not ready
 * 
 * Usage:
 * ```ts
 * router.get('/ready', readinessController.check);
 * ```
 */

import { Request, Response } from 'express';
import { healthService } from './health.service.js';

/**
 * Readiness Controller
 */
export class ReadinessController {
  /**
   * GET /ready
   * 
   * Readiness check endpoint.
   * Checks all critical dependencies (database, redis, queue).
   * Returns 503 if any dependency fails.
   * 
   * @param req Express request
   * @param res Express response
   */
  async check(req: Request, res: Response): Promise<void> {
    try {
      const readiness = await healthService.checkReadiness();

      // Return 503 if not ready, 200 if ready
      const statusCode = readiness.status === 'ready' ? 200 : 503;

      res.status(statusCode).json(readiness);
    } catch (error) {
      // If readiness check itself fails, return 503
      res.status(503).json({
        status: 'not_ready',
        checks: {
          database: 'fail',
          redis: 'fail',
          queue: 'fail',
        },
        error: error instanceof Error ? error.message : 'Readiness check failed',
      });
    }
  }
}

export const readinessController = new ReadinessController();

