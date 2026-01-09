import { Response } from 'express';
import { z } from 'zod';
import { returnService } from '../services/return.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { BaseController } from './base.controller.js';

const createReturnSchema = z.object({
  orderId: z.string().uuid('Geçersiz sipariş ID'),
  reason: z.string().min(1, 'İade nedeni gereklidir'),
  note: z.string().optional(),
  items: z.array(z.object({
    orderItemId: z.string().uuid('Geçersiz sipariş kalemi ID'),
    quantity: z.number().int().positive('Miktar pozitif olmalı'),
    reason: z.string().optional(),
  })).min(1, 'En az bir kalem gereklidir'),
});

const approveReturnSchema = z.object({
  warehouseId: z.string().uuid('Geçersiz depo ID'),
  locationId: z.string().uuid().optional(),
});

const rejectReturnSchema = z.object({
  reason: z.string().optional(),
});

const returnQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  orderId: z.string().optional().transform((val) => {
    if (!val || val === '' || val.trim() === '') return undefined;
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(val.trim()) ? val.trim() : undefined;
  }),
  search: z.string().optional().transform((val) => (val && val.trim() !== '') ? val.trim() : undefined),
});

class ReturnController extends BaseController {
  /**
   * GET /api/returns
   */
  getReturns = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = returnQuerySchema.safeParse(req.query);
    
    if (!parseResult.success) {
      // Use defaults if validation fails
      const result = await returnService.getReturns(this.getCompanyId(req), {
        page: 1,
        limit: 20,
      });
      return sendSuccess(res, 'İadeler', result.returns, 200, {
        page: 1,
        limit: 20,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
      });
    }
    
    const query = parseResult.data;
    const result = await returnService.getReturns(this.getCompanyId(req), {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      orderId: query.orderId,
    });
    sendSuccess(res, 'İadeler', result.returns, 200, result.pagination);
  });

  /**
   * GET /api/returns/:id
   */
  getReturn = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const returnRecord = await returnService.getReturnById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'İade detayı', returnRecord);
  });

  /**
   * POST /api/returns
   */
  createReturn = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createReturnSchema.parse(req.body);
    const returnRecord = await returnService.createReturn(
      this.getCompanyId(req),
      data,
      req.user.id
    );
    sendCreated(res, 'İade oluşturuldu', returnRecord);
  });

  /**
   * POST /api/returns/:id/approve
   */
  approveReturn = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = approveReturnSchema.parse(req.body);
    const returnRecord = await returnService.approveReturn(
      req.params.id,
      this.getCompanyId(req),
      data,
      req.user.id
    );
    sendSuccess(res, 'İade onaylandı ve stoğa eklendi', returnRecord);
  });

  /**
   * POST /api/returns/:id/reject
   */
  rejectReturn = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = rejectReturnSchema.parse(req.body);
    const returnRecord = await returnService.rejectReturn(
      req.params.id,
      this.getCompanyId(req),
      data.reason
    );
    sendSuccess(res, 'İade reddedildi', returnRecord);
  });

  /**
   * POST /api/returns/:id/complete
   */
  completeReturn = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const returnRecord = await returnService.completeReturn(
      req.params.id,
      this.getCompanyId(req)
    );
    sendSuccess(res, 'İade tamamlandı', returnRecord);
  });
}

export const returnController = new ReturnController();

