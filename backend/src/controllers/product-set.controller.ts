import { Response } from 'express';
import { z } from 'zod';
import { productSetService } from '../services/product-set.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { BaseController } from './base.controller.js';

// ==================== VALIDATION SCHEMAS ====================

export const createSetSchema = z.object({
  sku: z.string().min(1, 'SKU gerekli'),
  barcode: z.string().optional(),
  gtin: z.string().optional(),
  name: z.string().min(2, 'SET adı en az 2 karakter olmalı'),
  description: z.string().optional(),
  brand: z.string().optional(),
  price: z.number().positive('Fiyat pozitif olmalı'),
  costPrice: z.number().positive().optional(),
  taxRate: z.number().min(0).max(100).default(20),
  weight: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  imageUrl: z.string().url().optional(),
  categoryId: z.string().uuid().optional(),
  components: z.array(
    z.object({
      componentSku: z.string().min(1, 'Component SKU gerekli'),
      quantity: z.number().int().positive('Quantity pozitif olmalı'),
    })
  ).min(1, 'En az bir component gerekli'),
});

export const updateSetSchema = z.object({
  sku: z.string().min(1).optional(),
  barcode: z.string().optional(),
  gtin: z.string().optional(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  brand: z.string().optional(),
  price: z.number().positive().optional(),
  costPrice: z.number().positive().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  weight: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  imageUrl: z.string().url().optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  components: z.array(
    z.object({
      componentSku: z.string().min(1),
      quantity: z.number().int().positive(),
    })
  ).optional(),
});

export const packSetSchema = z.object({
  setProductId: z.string().uuid('Geçerli bir SET ID gerekli'),
  warehouseId: z.string().uuid('Geçerli bir depo ID gerekli'),
  locationId: z.string().uuid().optional(),
  quantity: z.number().int().positive('Quantity pozitif olmalı'),
});

export const returnSetSchema = z.object({
  setProductId: z.string().uuid('Geçerli bir SET ID gerekli'),
  warehouseId: z.string().uuid('Geçerli bir depo ID gerekli'),
  locationId: z.string().uuid().optional(),
  quantity: z.number().int().positive('Quantity pozitif olmalı'),
  isIntact: z.boolean().default(true), // true = kapalı kutu, false = bozuk
  note: z.string().optional(),
});

export const pickSetSchema = z.object({
  warehouseId: z.string().uuid('Geçerli bir depo ID gerekli'),
  locationId: z.string().uuid().optional(),
  quantity: z.number().int().positive('Quantity pozitif olmalı'),
});

// ==================== CONTROLLER ====================

class ProductSetController extends BaseController {
  /**
   * GET /api/sets
   * SET listesi (sadece SET tipindeki ürünler)
   */
  getSets = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await productSetService.getSets(this.getCompanyId(req), {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      search: req.query.search as string | undefined,
    });

    sendSuccess(res, 'SET ürünleri listelendi', result.sets, 200, result.pagination);
  });

  /**
   * GET /api/sets/:id
   * SET detayı (components ve stok bilgileri ile)
   */
  getSetById = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const set = await productSetService.getSetById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'SET detayı', set);
  });

  /**
   * GET /api/sets/sku/:sku
   * SET SKU ile getir
   */
  getSetBySku = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const set = await productSetService.getSetBySku(this.getCompanyId(req), req.params.sku);
    sendSuccess(res, 'SET detayı', set);
  });

  /**
   * POST /api/sets
   * SET oluştur
   */
  createSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createSetSchema.parse(req.body);
    const set = await productSetService.createSet(this.getCompanyId(req), data);
    sendCreated(res, 'SET oluşturuldu', set);
  });

  /**
   * PUT /api/sets/:id
   * SET güncelle
   */
  updateSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateSetSchema.parse(req.body);
    const set = await productSetService.updateSet(req.params.id, this.getCompanyId(req), data);
    sendSuccess(res, 'SET güncellendi', set);
  });

  /**
   * DELETE /api/sets/:id
   * SET sil
   */
  deleteSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await productSetService.deleteSet(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'SET silindi');
  });

  /**
   * POST /api/sets/:id/pick
   * SET picking algoritması (hangi yöntemle toplanacağını belirler)
   */
  pickSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { warehouseId, locationId, quantity } = pickSetSchema.parse(req.body);
    
    const result = await productSetService.pickSet(
      req.params.id,
      this.getCompanyId(req),
      warehouseId,
      quantity,
      locationId
    );

    sendSuccess(res, 'SET picking analizi', result);
  });

  /**
   * POST /api/sets/pack
   * SET paketleme/üretim
   */
  packSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = packSetSchema.parse(req.body);
    const result = await productSetService.packSet({
      ...data,
      userId: req.user.id,
    });
    sendSuccess(res, 'SET paketleme tamamlandı', result);
  });

  /**
   * POST /api/sets/return
   * SET iadesi
   */
  returnSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = returnSetSchema.parse(req.body);
    const result = await productSetService.returnSet({
      ...data,
      userId: req.user.id,
    });
    sendSuccess(res, 'SET iadesi işlendi', result);
  });
}

export const productSetController = new ProductSetController();

