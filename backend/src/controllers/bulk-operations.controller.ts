import { Response } from 'express';
import { z } from 'zod';
import { MarketplaceType } from '@prisma/client';

import { sendSuccess, sendError } from '../utils/response.js';
import { bulkOperationsService, BulkOperationRequest } from '../services/bulk-operations.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { BaseController } from './base.controller.js';

const bulkOperationSchema = z.object({
  productIds: z.array(z.string().uuid()).optional(),
  operationType: z.enum(['PRICE_INCREASE', 'PRICE_DECREASE', 'STOCK_UPDATE', 'BOTH']),
  value: z.number().positive(),
  valueType: z.enum(['PERCENTAGE', 'FIXED']),
  marketplaces: z.array(z.nativeEnum(MarketplaceType)).optional(),
});

class BulkOperationsController extends BaseController {
  /**
   * POST /api/products/bulk-update
   */
  createBulkOperation = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);

    const parsed = bulkOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Invalid request data', 400, parsed.error.errors);
    }

    const request: BulkOperationRequest = {
      ...parsed.data,
      productIds: parsed.data.productIds ?? [],
      marketplaces: parsed.data.marketplaces,
    };

    const id = await bulkOperationsService.createBulkOperation(companyId, request);

    sendSuccess(res, 'Bulk operation created', { id }, 201);
  });

  /**
   * GET /api/products/bulk-operations/:id/status
   */
  getBulkOperationStatus = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const { id } = req.params;

    const status = await bulkOperationsService.getBulkOperationStatus(id, companyId);

    if (!status) {
      return sendError(res, 'Bulk operation not found', 404);
    }

    sendSuccess(res, 'Bulk operation status retrieved', status);
  });

  /**
   * GET /api/products/bulk-operations
   */
  getBulkOperations = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);

    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const result = await bulkOperationsService.getBulkOperations(companyId, {
      page,
      limit,
      status,
    });

    sendSuccess(res, 'Bulk operations retrieved', result);
  });
}

export const bulkOperationsController = new BulkOperationsController();
