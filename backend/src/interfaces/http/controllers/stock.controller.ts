/**
 * Stock Controller
 * 
 * HTTP controller for stock operations.
 * 
 * Architecture:
 * - Interface layer only
 * - Validates requests
 * - Maps DTOs to use case input
 * - Enqueues jobs for background processing
 * - Maps domain errors to HTTP responses
 * - No business logic
 */

import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware.js';
import { extractRequestContext } from '../request-context.js';
import { sendErrorResponse } from '../error-mapper.js';
import { marketplaceSyncQueue, JobType } from '../../../infrastructure/jobs/index.js';
import { env } from '../../../config/env.js';

/**
 * Validation Schemas
 */

const syncStockBodySchema = z.object({
  integrationId: z.string().uuid('Invalid integration ID'),
  productIds: z.array(z.string().uuid()).optional(),
  warehouseId: z.string().uuid().optional(),
});

/**
 * Stock Controller
 */
export class StockController {
  /**
   * POST /stock/sync
   * 
   * Enqueue a stock sync job.
   * This endpoint enqueues a background job for syncing stock from/to a marketplace.
   */
  async sync(req: AuthenticatedRequest, res: Response): Promise<void> {
    // v3.1 HARD RESET: Disable stock sync
    if (env.INTEGRATIONS_DISABLED) {
      res.status(503).json({
        success: false,
        error: 'API integrations disabled in v3.1 reset mode. WooCommerce will be re-added from scratch.',
      });
      return;
    }

    try {
      const context = extractRequestContext(req);

      // Validate body
      const body = syncStockBodySchema.parse(req.body);

      // Check if queue is available
      // @ts-ignore - Queue may be undefined if BullMQ is not installed
      if (!marketplaceSyncQueue) {
        throw new Error('Job queue is not initialized. Please ensure BullMQ is installed and Redis is running.');
      }

      // Enqueue job
      // @ts-ignore - Queue methods will be available after BullMQ installation
      const job = await marketplaceSyncQueue.add(
        JobType.SYNC_STOCK,
        {
          companyId: context.companyId,
          integrationId: body.integrationId,
          productIds: body.productIds,
          warehouseId: body.warehouseId,
        },
        {
          jobId: `sync-stock-${body.integrationId}-${Date.now()}`,
        }
      );

      // Return success response with job ID
      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          message: 'Stock sync job enqueued successfully',
        },
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }
}

export const stockController = new StockController();

