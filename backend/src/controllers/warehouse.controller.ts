import { Response } from 'express';
import { z } from 'zod';
import { warehouseService } from '../services/warehouse.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { CreateWarehouseData } from '../repositories/warehouse.repository.js';
import { BaseController } from './base.controller.js';

// ==================== VALIDATION SCHEMAS ====================

export const createWarehouseSchema = z.object({
  name: z.string().min(2, 'Depo adı en az 2 karakter olmalı'),
  code: z.string().min(2, 'Depo kodu en az 2 karakter olmalı').optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const updateWarehouseSchema = z.object({
  name: z.string().min(2, 'Depo adı en az 2 karakter olmalı').optional(),
  code: z.string().min(2, 'Depo kodu en az 2 karakter olmalı').optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const warehouseQuerySchema = paginationSchema.extend({
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

// ==================== CONTROLLER ====================

class WarehouseController extends BaseController {
  /**
   * GET /api/warehouses
   */
  getWarehouses = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = warehouseQuerySchema.parse(req.query);
    
    const result = await warehouseService.getWarehouses(this.getCompanyId(req), {
      page: query.page,
      limit: query.limit,
      search: query.search,
      isActive: query.isActive,
    });

    sendSuccess(res, 'Depolar listelendi', result.warehouses, 200, result.pagination);
  });

  /**
   * GET /api/warehouses/active
   */
  getActiveWarehouses = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const warehouses = await warehouseService.getActiveWarehouses(this.getCompanyId(req));
    sendSuccess(res, 'Aktif depolar', warehouses);
  });

  /**
   * GET /api/warehouses/:id
   */
  getWarehouse = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const warehouse = await warehouseService.getWarehouseById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Depo detayı', warehouse);
  });

  /**
   * POST /api/warehouses
   */
  createWarehouse = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createWarehouseSchema.parse(req.body);
    // Service will generate code if not provided
    const warehouseData: Omit<CreateWarehouseData, 'companyId' | 'code'> & { code?: string } = {
      name: data.name,
      ...(data.code && { code: data.code }),
      ...(data.address && { address: data.address }),
      ...(data.city && { city: data.city }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    };
    const warehouse = await warehouseService.createWarehouse(this.getCompanyId(req), warehouseData);
    sendCreated(res, 'Depo oluşturuldu', warehouse);
  });

  /**
   * PUT /api/warehouses/:id
   */
  updateWarehouse = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateWarehouseSchema.parse(req.body);
    const warehouse = await warehouseService.updateWarehouse(req.params.id, this.getCompanyId(req), data);
    sendSuccess(res, 'Depo güncellendi', warehouse);
  });

  /**
   * DELETE /api/warehouses/:id
   */
  deleteWarehouse = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await warehouseService.deleteWarehouse(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Depo silindi');
  });

  /**
   * POST /api/warehouses/:id/set-default
   */
  setDefault = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const warehouse = await warehouseService.setDefaultWarehouse(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Varsayılan depo ayarlandı', warehouse);
  });

  /**
   * GET /api/warehouses/:id/stats
   */
  getWarehouseStats = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await warehouseService.getWarehouseStats(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Depo istatistikleri', stats);
  });

  /**
   * GET /api/warehouses/stats/all
   */
  getAllWarehouseStats = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await warehouseService.getAllWarehouseStats(this.getCompanyId(req));
    sendSuccess(res, 'Tüm depo istatistikleri', stats);
  });
}

export const warehouseController = new WarehouseController();

