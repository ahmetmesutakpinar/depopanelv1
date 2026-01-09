import { Response } from 'express';
import { z } from 'zod';
import { inventoryCountService } from '../services/inventory-count.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { BaseController } from './base.controller.js';

const createCountSchema = z.object({
  warehouseId: z.string().uuid('Geçersiz depo ID'),
  locationId: z.string().uuid().optional(),
  type: z.enum(['FULL', 'PARTIAL', 'CYCLE']),
  notes: z.string().optional(),
});

const addCountItemSchema = z.object({
  productId: z.string().uuid('Geçersiz ürün ID'),
  variantId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  countedQty: z.number().int().min(0, 'Miktar 0 veya daha büyük olmalı'),
  notes: z.string().optional(),
});

const updateCountItemSchema = z.object({
  countedQty: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

const countQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED', 'REJECTED']).optional(),
  warehouseId: z.string().uuid().optional(),
  search: z.string().optional(),
});

class InventoryCountController extends BaseController {
  getCounts = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = countQuerySchema.parse(req.query);

    const result = await inventoryCountService.getCounts(this.getCompanyId(req), {
      page: query.page,
      limit: query.limit,
      status: query.status,
      warehouseId: query.warehouseId,
      search: query.search,
    });

    sendSuccess(res, 'Sayımlar listelendi', result.counts, 200, {
      page: query.page || 1,
      limit: query.limit || 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (query.limit || 20)),
    });
  });

  getCount = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const count = await inventoryCountService.getCountById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Sayım detayı', count);
  });

  createCount = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createCountSchema.parse(req.body);
    const count = await inventoryCountService.createCount(
      this.getCompanyId(req),
      this.getUserId(req),
      data
    );
    sendCreated(res, 'Sayım oluşturuldu', count);
  });

  startCount = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const count = await inventoryCountService.startCount(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Sayım başlatıldı', count);
  });

  addCountItem = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = addCountItemSchema.parse(req.body);
    const item = await inventoryCountService.addCountItem(
      req.params.id,
      this.getCompanyId(req),
      {
        ...data,
        countedById: this.getUserId(req),
      }
    );
    sendCreated(res, 'Sayım kalemi eklendi', item);
  });

  updateCountItem = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateCountItemSchema.parse(req.body);
    const item = await inventoryCountService.updateCountItem(
      req.params.itemId,
      req.params.id,
      this.getCompanyId(req),
      {
        ...data,
        countedById: this.getUserId(req),
      }
    );
    sendSuccess(res, 'Sayım kalemi güncellendi', item);
  });

  completeCount = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = z.object({
      explanation: z.string().optional(),
    }).parse(req.body);
    
    const count = await inventoryCountService.completeCount(
      req.params.id,
      this.getCompanyId(req),
      { explanation: data.explanation }
    );
    sendSuccess(res, 'Sayım tamamlandı', count);
  });

  approveCount = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const count = await inventoryCountService.approveCount(
      req.params.id,
      this.getCompanyId(req),
      this.getUserId(req)
    );
    sendSuccess(res, 'Sayım onaylandı ve stoklar güncellendi', count);
  });

  deleteCountItem = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await inventoryCountService.deleteCountItem(
      req.params.itemId,
      req.params.id,
      this.getCompanyId(req)
    );
    sendSuccess(res, 'Sayım kalemi silindi');
  });

  deleteCount = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await inventoryCountService.deleteCount(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Sayım silindi');
  });
}

export const inventoryCountController = new InventoryCountController();

