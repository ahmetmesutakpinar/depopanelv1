/**
 * Marketplace Controller
 * 
 * HTTP controller for marketplace operations.
 * 
 * Architecture:
 * - Interface layer only
 * - Validates requests
 * - Maps DTOs to use case input
 * - Calls use cases or enqueues jobs
 * - Maps domain errors to HTTP responses
 * - No business logic
 */

import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware.js';
import { extractRequestContext } from '../request-context.js';
import { sendErrorResponse } from '../error-mapper.js';
import { container } from '../../../infrastructure/di/index.js';
import { marketplaceSyncQueue, JobType } from '../../../infrastructure/jobs/index.js';
import { ConnectMarketplaceUseCase } from '../../../services/application/connect-marketplace.use-case.js';
import { SyncMarketplaceUseCase } from '../../../services/application/sync-marketplace.use-case.js';
import { MarketplaceType } from '@prisma/client';
import { IntegrationDisabledError } from '../../../errors/integration-disabled.error.js';
import { env } from '../../../config/env.js';

/**
 * Validation Schemas
 */

const connectMarketplaceParamsSchema = z.object({
  id: z.string().uuid('Invalid integration ID'),
});

const connectMarketplaceBodySchema = z.object({
  type: z.enum(['WOOCOMMERCE', 'TRENDYOL', 'HEPSIBURADA', 'N11', 'PAZARAMA', 'AMAZON', 'SHOPIFY', 'IKAS']),
  name: z.string().min(1, 'Name is required'),
  apiUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  sellerId: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
  syncMode: z.enum(['AUTO', 'MANUAL', 'WEBHOOK', 'MIDDLEWARE']).optional(),
  isReadOnly: z.boolean().optional(),
});

const syncMarketplaceParamsSchema = z.object({
  id: z.string().uuid('Invalid integration ID'),
});

const syncMarketplaceBodySchema = z.object({
  syncProducts: z.boolean().optional(),
  syncOrders: z.boolean().optional(),
  syncStock: z.boolean().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Marketplace Controller
 */
export class MarketplaceController {
  /**
   * POST /marketplaces/:id/connect
   * 
   * Connect to a marketplace.
   * This endpoint tests the connection and creates/updates the marketplace connection.
   */
  async connect(req: AuthenticatedRequest, res: Response): Promise<void> {
    // v3.1 HARD RESET: Disable marketplace connections
    if (env.INTEGRATIONS_DISABLED) {
      res.status(503).json({
        success: false,
        error: 'API integrations disabled in v3.1 reset mode. WooCommerce will be re-added from scratch.',
      });
      return;
    }

    try {
      const context = extractRequestContext(req);

      // Validate params
      const params = connectMarketplaceParamsSchema.parse(req.params);

      // Validate body
      const body = connectMarketplaceBodySchema.parse(req.body);

      // Get marketplace connection repository to check if connection exists
      const connectionRepository = container.getMarketplaceConnectionRepository();
      const existingConnection = await connectionRepository.findByIdAndCompany(
        params.id,
        context.companyId
      );

      // Create marketplace adapter
      const adapter = container.createMarketplaceAdapter(
        body.type as MarketplaceType,
        {
          apiUrl: body.apiUrl,
          apiKey: body.apiKey,
          apiSecret: body.apiSecret,
          sellerId: body.sellerId,
          accessToken: body.accessToken,
          refreshToken: body.refreshToken,
          settings: body.settings,
        }
      );

      // Get use case
      const useCase = container.getConnectMarketplaceUseCase(adapter);

      // Execute use case
      const result = await useCase.execute({
        companyId: context.companyId,
        type: body.type as MarketplaceType,
        name: body.name,
        apiUrl: body.apiUrl,
        apiKey: body.apiKey,
        apiSecret: body.apiSecret,
        sellerId: body.sellerId,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        settings: body.settings,
        syncMode: body.syncMode,
        isReadOnly: body.isReadOnly,
      });

      // Return success response
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }

  /**
   * POST /marketplaces/:id/sync
   * 
   * Enqueue a marketplace sync job.
   * This endpoint enqueues a background job for syncing products, orders, and/or stock.
   */
  async sync(req: AuthenticatedRequest, res: Response): Promise<void> {
    // v3.1 HARD RESET: Disable marketplace sync
    if (env.INTEGRATIONS_DISABLED) {
      res.status(503).json({
        success: false,
        error: 'API integrations disabled in v3.1 reset mode. WooCommerce will be re-added from scratch.',
      });
      return;
    }

    try {
      const context = extractRequestContext(req);

      // Validate params
      const params = syncMarketplaceParamsSchema.parse(req.params);

      // Validate body
      const body = syncMarketplaceBodySchema.parse(req.body);

      // Check if queue is available
      // @ts-ignore - Queue may be undefined if BullMQ is not installed
      if (!marketplaceSyncQueue) {
        throw new Error('Job queue is not initialized. Please ensure BullMQ is installed and Redis is running.');
      }

      // Enqueue job
      // @ts-ignore - Queue methods will be available after BullMQ installation
      const job = await marketplaceSyncQueue.add(
        JobType.SYNC_MARKETPLACE,
        {
          companyId: context.companyId,
          integrationId: params.id,
          syncProducts: body.syncProducts,
          syncOrders: body.syncOrders,
          syncStock: body.syncStock,
          startDate: body.startDate,
          endDate: body.endDate,
        },
        {
          jobId: `sync-marketplace-${params.id}-${Date.now()}`,
        }
      );

      // Return success response with job ID
      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          message: 'Sync job enqueued successfully',
        },
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }
}

export const marketplaceController = new MarketplaceController();

