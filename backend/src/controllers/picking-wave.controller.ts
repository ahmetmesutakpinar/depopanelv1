import { Response } from 'express';
import { z } from 'zod';
import { pickingWaveService } from '../services/picking-wave.service.js';
import { waveCreationService } from '../services/wave-creation.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated, sendError } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { PickingStrategy, WaveStatus } from '@prisma/client';
import { BaseController } from './base.controller.js';

const createWaveSchema = z.object({
  warehouseId: z.string().uuid('Geçersiz depo ID'),
  strategy: z.nativeEnum(PickingStrategy, {
    errorMap: () => ({ message: 'Geçersiz strateji. SINGLE_ORDER, WAVE, BATCH veya ZONE olmalı' })
  }),
  priority: z.coerce.number().int().min(0).max(100).optional(),
  orderIds: z.array(z.string().uuid()).optional(),
});

const updateWaveSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CREATED', 'PICKING', 'PACKING', 'SHIPPED', 'CLOSED', 'CANCELLED', 'EXCEPTION']).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  assignedToId: z.string().uuid().optional(),
  pickedById: z.string().uuid().optional(),
  shippedById: z.string().uuid().optional(),
});

const waveQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CREATED', 'PICKING', 'PACKING', 'SHIPPED', 'CLOSED', 'CANCELLED', 'EXCEPTION']).optional(),
  warehouseId: z.string().uuid().optional().or(z.literal('')),
  strategy: z.nativeEnum(PickingStrategy).optional(),
  type: z.enum(['TIME_BASED', 'SKU_BASED', 'PRIORITY', 'MANUAL', 'MARKETPLACE', 'SHIPPING', 'COUNTRY', 'MIXED']).optional(),
}).transform((data) => ({
  ...data,
  warehouseId: data.warehouseId === '' ? undefined : data.warehouseId,
}));

class PickingWaveController extends BaseController {
  getWaves = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Parse query with safe defaults
    const query = waveQuerySchema.safeParse(req.query);
    
    if (!query.success) {
      // If validation fails, use defaults
      const result = await pickingWaveService.getWaves(this.getCompanyId(req), {
        page: 1,
        limit: 20,
      });
      return sendSuccess(res, 'Toplama dalgaları listelendi', result.waves, 200, {
        page: 1,
        limit: 20,
        total: result.total,
        totalPages: Math.ceil(result.total / 20),
      });
    }

    const result = await pickingWaveService.getWaves(this.getCompanyId(req), {
      page: query.data.page,
      limit: query.data.limit,
      status: query.data.status,
      warehouseId: query.data.warehouseId,
      strategy: query.data.strategy,
    });

    sendSuccess(res, 'Toplama dalgaları listelendi', result.waves, 200, {
      page: query.data.page || 1,
      limit: query.data.limit || 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (query.data.limit || 20)),
    });
  });

  getWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.getWaveById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Toplama dalgası detayı', wave);
  });

  createWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = createWaveSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        received: e.path.length > 0 ? (req.body as any)[e.path[0]] : undefined,
      }));
      const { logger } = await import('../utils/logger.js');
      logger.error('[createWave] Validation hatası', {
        errors: errorMessages,
        body: req.body,
      });
      return sendError(res, 'Geçersiz veri formatı', 400, errorMessages);
    }
    
    const data = parseResult.data;
    const wave = await pickingWaveService.createWave(this.getCompanyId(req), data);
    sendCreated(res, 'Toplama dalgası oluşturuldu', wave);
  });

  autoCreateWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const autoCreateSchema = z.object({
      warehouseId: z.string().uuid('Geçersiz depo ID'),
      strategy: z.nativeEnum(PickingStrategy, {
        errorMap: () => ({ message: 'Geçersiz strateji. SINGLE_ORDER, WAVE, BATCH veya ZONE olmalı' })
      }),
      maxOrders: z.coerce.number().int().positive().optional(),
      priority: z.coerce.number().int().min(0).max(100).optional(),
    });
    
    const parseResult = autoCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        received: e.path.length > 0 ? (req.body as any)[e.path[0]] : undefined,
      }));
      const { logger } = await import('../utils/logger.js');
      logger.error('[autoCreateWave] Validation hatası', {
        errors: errorMessages,
        body: req.body,
      });
      return sendError(res, 'Geçersiz veri formatı', 400, errorMessages);
    }

    const data = parseResult.data;
    const wave = await pickingWaveService.autoCreateWave(this.getCompanyId(req), data);
    sendCreated(res, 'Toplama dalgası otomatik oluşturuldu', wave);
  });

  updateWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateWaveSchema.parse(req.body);
    const wave = await pickingWaveService.updateWave(
      req.params.id,
      this.getCompanyId(req),
      data,
      this.getUserId(req)
    );
    sendSuccess(res, 'Toplama dalgası güncellendi', wave);
  });

  addOrders = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = z.object({
      orderIds: z.array(z.string().uuid()).min(1, 'En az bir sipariş seçin'),
    }).parse(req.body);

    const wave = await pickingWaveService.addOrdersToWave(
      req.params.id,
      this.getCompanyId(req),
      data.orderIds
    );
    sendSuccess(res, 'Siparişler dalgaya eklendi', wave);
  });

  removeOrders = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = z.object({
      orderIds: z.array(z.string().uuid()).min(1, 'En az bir sipariş seçin'),
    }).parse(req.body);

    const wave = await pickingWaveService.removeOrdersFromWave(
      req.params.id,
      this.getCompanyId(req),
      data.orderIds
    );
    sendSuccess(res, 'Siparişler dalgadan çıkarıldı', wave);
  });

  startWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.startWave(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Toplama dalgası başlatıldı', wave);
  });

  completeWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.completeWave(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Toplama dalgası tamamlandı', wave);
  });

  deleteWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // ✅ Güvenlik: Sadece ADMIN ve SUPER_ADMIN silebilir
    if (!this.isAdmin(req)) {
      return sendError(res, 'Bu işlem için admin yetkisi gereklidir', 403);
    }

    await pickingWaveService.deleteWave(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Toplama dalgası silindi');
  });

  aggregateOrderItems = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await pickingWaveService.aggregateOrderItems(
      req.params.id,
      this.getCompanyId(req)
    );
    sendSuccess(res, 'Sipariş içerikleri toplandı', result);
  });

  markAsPicked = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.markAsPicked(
      req.params.id,
      this.getCompanyId(req),
      this.getUserId(req)
    );
    sendSuccess(res, 'Toplama işlemi kaydedildi', wave);
  });

  markAsShipped = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.markAsShipped(
      req.params.id,
      this.getCompanyId(req),
      this.getUserId(req)
    );
    sendSuccess(res, 'Gönderim işlemi kaydedildi', wave);
  });

  scanBarcode = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const scanSchema = z.object({
      barcode: z.string().min(1, 'Barkod boş olamaz'),
    });

    const parseResult = scanSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return sendError(res, 'Geçersiz veri formatı', 400, errorMessages);
    }

    const result = await pickingWaveService.scanBarcode(
      req.params.id,
      this.getCompanyId(req),
      parseResult.data.barcode,
      this.getUserId(req)
    );
    sendSuccess(res, result.message, result);
  });

  // ========== NEW WAVE SYSTEM ENDPOINTS ==========

  /**
   * Create time-based wave
   */
  createTimeBasedWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      warehouseId: z.string().uuid('Geçersiz depo ID'),
      cutOffTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Geçersiz saat formatı (HH:mm)'),
      priority: z.coerce.number().int().min(0).max(100).optional(),
      maxOrders: z.coerce.number().int().positive().optional(),
      minOrders: z.coerce.number().int().positive().optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return sendError(res, 'Geçersiz veri formatı', 400, errorMessages);
    }

    const result = await waveCreationService.createTimeBasedWave(
      this.getCompanyId(req),
      parseResult.data.warehouseId,
      parseResult.data.cutOffTime,
      {
        priority: parseResult.data.priority,
        maxOrders: parseResult.data.maxOrders,
        minOrders: parseResult.data.minOrders,
      }
    );

    sendCreated(res, 'Zaman bazlı dalga oluşturuldu', result);
  });

  /**
   * Create SKU-based wave
   */
  createSkuBasedWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      warehouseId: z.string().uuid('Geçersiz depo ID'),
      priority: z.coerce.number().int().min(0).max(100).optional(),
      maxOrders: z.coerce.number().int().positive().optional(),
      minOrders: z.coerce.number().int().positive().optional(),
      skuList: z.array(z.string()).optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return sendError(res, 'Geçersiz veri formatı', 400, errorMessages);
    }

    const result = await waveCreationService.createSkuBasedWave(
      this.getCompanyId(req),
      parseResult.data.warehouseId,
      {
        priority: parseResult.data.priority,
        maxOrders: parseResult.data.maxOrders,
        minOrders: parseResult.data.minOrders,
        skuList: parseResult.data.skuList,
      }
    );

    sendCreated(res, 'SKU bazlı dalga oluşturuldu', result);
  });

  /**
   * Create priority wave
   */
  createPriorityWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      warehouseId: z.string().uuid('Geçersiz depo ID'),
      priority: z.coerce.number().int().min(0).max(100).optional(),
      maxOrders: z.coerce.number().int().positive().optional(),
      minOrders: z.coerce.number().int().positive().optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return sendError(res, 'Geçersiz veri formatı', 400, errorMessages);
    }

    const result = await waveCreationService.createPriorityWave(
      this.getCompanyId(req),
      parseResult.data.warehouseId,
      {
        priority: parseResult.data.priority,
        maxOrders: parseResult.data.maxOrders,
        minOrders: parseResult.data.minOrders,
      }
    );

    sendCreated(res, 'Öncelikli dalga oluşturuldu', result);
  });

  /**
   * Create custom wave with rules
   */
  createCustomWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      warehouseId: z.string().uuid('Geçersiz depo ID'),
      type: z.enum(['TIME_BASED', 'SKU_BASED', 'PRIORITY', 'MARKETPLACE', 'SHIPPING', 'COUNTRY', 'MIXED']),
      rules: z.object({
        orderStatus: z.enum(['READY_TO_PICK', 'PENDING', 'PROCESSING']).optional(),
        requireStockAvailable: z.boolean().optional(),
        marketplace: z.array(z.string()).optional(),
        shippingMethod: z.array(z.string()).optional(),
        carrier: z.array(z.string()).optional(),
        destinationCountry: z.array(z.string()).optional(),
        singleSkuOnly: z.boolean().optional(),
        multiSkuOnly: z.boolean().optional(),
        sameSkuConsolidation: z.boolean().optional(),
        maxOrdersPerWave: z.number().int().positive().optional(),
        minOrdersPerWave: z.number().int().positive().optional(),
        cutOffTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
        timeWindow: z.object({
          start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
          end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
        }).optional(),
        priorityOnly: z.boolean().optional(),
        slaDriven: z.boolean().optional(),
        skuList: z.array(z.string()).optional(),
        excludeSkuList: z.array(z.string()).optional(),
      }),
      maxOrdersPerWave: z.coerce.number().int().positive().optional(),
      minOrdersPerWave: z.coerce.number().int().positive().optional(),
      priority: z.coerce.number().int().min(0).max(100).optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return sendError(res, 'Geçersiz veri formatı', 400, errorMessages);
    }

    const waves = await waveCreationService.createWaveAutomatically({
      companyId: this.getCompanyId(req),
      warehouseId: parseResult.data.warehouseId,
      type: parseResult.data.type,
      rules: parseResult.data.rules,
      maxOrdersPerWave: parseResult.data.maxOrdersPerWave,
      minOrdersPerWave: parseResult.data.minOrdersPerWave,
      priority: parseResult.data.priority || 0,
      createdBy: this.getUserId(req),
    });

    sendCreated(res, `${waves.length} dalga oluşturuldu`, waves);
  });

  /**
   * Generate pick list
   */
  getPickList = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const format = req.query.format === 'print' ? 'print' : 'mobile';
    const pickList = await pickingWaveService.generatePickList(
      req.params.id,
      this.getCompanyId(req),
      format
    );
    sendSuccess(res, 'Pick list oluşturuldu', pickList);
  });

  /**
   * Complete picking (PICKING → PACKING)
   * Tüm ürünler toplandı, siparişler PICKED durumuna geçer
   */
  completePicking = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.completePicking(
      req.params.id,
      this.getCompanyId(req)
    );
    sendSuccess(res, 'Toplama tamamlandı, paketleme aşamasına geçildi', wave);
  });

  /**
   * Transition wave to PACKING (backward compatibility)
   * @deprecated Use completePicking instead
   */
  transitionToPacking = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.transitionToPacking(
      req.params.id,
      this.getCompanyId(req)
    );
    sendSuccess(res, 'Dalga paketleme aşamasına geçti', wave);
  });

  /**
   * Mark single order as PACKED
   */
  markOrderAsPacked = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id, orderId } = req.params;
    const result = await pickingWaveService.markOrderAsPacked(
      id,
      orderId,
      this.getCompanyId(req)
    );
    sendSuccess(res, 'Sipariş paketlendi', result);
  });

  /**
   * Mark single order as SHIPPED (partial shipment support)
   */
  markOrderAsShipped = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id, orderId } = req.params;
    const schema = z.object({
      trackingNumber: z.string().optional(),
      cargoCompanyId: z.string().uuid().optional(),
    });
    
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return sendError(res, 'Geçersiz veri formatı', 400, errorMessages);
    }
    
    const result = await pickingWaveService.markOrderAsShipped(
      id,
      orderId,
      this.getCompanyId(req),
      parseResult.data
    );
    sendSuccess(res, 'Sipariş gönderildi', result);
  });

  /**
   * Transition wave to SHIPPED (all orders shipped)
   * @deprecated Use markOrderAsShipped for individual orders instead
   */
  transitionToShipped = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.transitionToShipped(
      req.params.id,
      this.getCompanyId(req)
    );
    sendSuccess(res, 'Dalga gönderildi', wave);
  });

  /**
   * Close wave manually
   */
  closeWave = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wave = await pickingWaveService.closeWave(
      req.params.id,
      this.getCompanyId(req)
    );
    sendSuccess(res, 'Dalga kapatıldı', wave);
  });
}

export const pickingWaveController = new PickingWaveController();

