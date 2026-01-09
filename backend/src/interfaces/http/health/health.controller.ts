/**
 * Health Controller
 * 
 * HTTP controller for health check endpoint.
 * 
 * Architecture:
 * - Interface layer only
 * - No business logic
 * - Fast response
 * - No authentication required
 * 
 * Usage:
 * ```ts
 * router.get('/health', healthController.check);
 * ```
 */

import { Request, Response } from 'express';
import { healthService } from './health.service.js';

/**
 * Health Controller
 */
export class HealthController {
  /**
   * GET /health
   * 
   * Basic health check endpoint.
   * Returns system status without checking dependencies.
   * 
   * @param req Express request
   * @param res Express response
   */
  async check(req: Request, res: Response): Promise<void> {
    try {
      const health = await healthService.checkHealth();

      res.status(200).json(health);
    } catch (error) {
      // Health check should never fail, but if it does, return error
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const healthController = new HealthController();

