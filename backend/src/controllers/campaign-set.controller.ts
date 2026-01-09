import { Response } from 'express';
import { z } from 'zod';
import { campaignSetService } from '../services/campaign-set.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { BaseController } from './base.controller.js';

const createCampaignSetSchema = z.object({
  name: z.string().min(1, 'Set adı gerekli'),
  sku: z.string().min(1, 'SKU gerekli'),
  description: z.string().optional(),
  price: z.number().positive('Fiyat pozitif olmalı'),
  items: z.array(z.object({
    productId: z.string().uuid('Geçersiz ürün ID'),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().positive('Miktar pozitif olmalı'),
  })).min(1, 'En az bir ürün eklenmeli'),
});

const updateCampaignSetSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  items: z.array(z.object({
    productId: z.string().uuid('Geçersiz ürün ID'),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().positive('Miktar pozitif olmalı'),
  })).optional(),
});

const createCampaignStockSchema = z.object({
  warehouseId: z.string().uuid('Geçersiz depo ID'),
  locationId: z.string().uuid().optional(),
  setQuantity: z.number().int().positive('Set miktarı pozitif olmalı'),
});

const sellCampaignSetSchema = z.object({
  warehouseId: z.string().uuid('Geçersiz depo ID'),
  quantity: z.number().int().positive('Miktar pozitif olmalı'),
  orderId: z.string().uuid().optional(),
});

class CampaignSetController extends BaseController {
  getCampaignSets = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = paginationSchema.extend({
      isActive: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
      search: z.string().optional(),
    }).parse(req.query);

    const result = await campaignSetService.getCampaignSets(this.getCompanyId(req), {
      page: query.page,
      limit: query.limit,
      isActive: query.isActive,
      search: query.search,
    });

    sendSuccess(res, 'Kampanyalı setler listelendi', result.sets, 200, {
      page: query.page || 1,
      limit: query.limit || 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (query.limit || 20)),
    });
  });

  getCampaignSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const set = await campaignSetService.getCampaignSetById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Kampanyalı set detayı', set);
  });

  createCampaignSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createCampaignSetSchema.parse(req.body);
    const set = await campaignSetService.createCampaignSet(this.getCompanyId(req), data);
    sendCreated(res, 'Kampanyalı set oluşturuldu', set);
  });

  updateCampaignSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateCampaignSetSchema.parse(req.body);
    const set = await campaignSetService.updateCampaignSet(req.params.id, this.getCompanyId(req), data);
    sendSuccess(res, 'Kampanyalı set güncellendi', set);
  });

  deleteCampaignSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await campaignSetService.deleteCampaignSet(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Kampanyalı set silindi');
  });

  createCampaignStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createCampaignStockSchema.parse(req.body);
    const stock = await campaignSetService.createCampaignStock(
      req.params.id,
      this.getCompanyId(req),
      data
    );
    sendCreated(res, 'Kampanya stoğu oluşturuldu', stock);
  });

  sellCampaignSet = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = sellCampaignSetSchema.parse(req.body);
    const result = await campaignSetService.sellCampaignSet(
      req.params.id,
      this.getCompanyId(req),
      data
    );
    sendSuccess(res, 'Kampanyalı set satıldı', result);
  });

  getCampaignStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const warehouseId = z.string().uuid().optional().parse(req.query.warehouseId);
    const stocks = await campaignSetService.getCampaignStock(
      req.params.id,
      this.getCompanyId(req),
      warehouseId || undefined
    );
    sendSuccess(res, 'Kampanya stoğu listelendi', stocks);
  });
}

export const campaignSetController = new CampaignSetController();

