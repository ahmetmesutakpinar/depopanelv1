import { Response } from 'express';
import { z } from 'zod';
import { locationService } from '../services/location.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { BaseController } from './base.controller.js';

const createLocationSchema = z.object({
  code: z.string().min(1, 'Lokasyon kodu gerekli'),
  name: z.string().optional(),
  zone: z.string().optional(),
  aisle: z.string().optional(),
  shelf: z.string().optional(),
  bin: z.string().optional(),
  locationType: z.enum(['DEDICATED', 'SHARED']).optional(),
  capacity: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const updateLocationSchema = createLocationSchema.extend({
  isActive: z.boolean().optional(),
}).partial();

const locationQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

class LocationController extends BaseController {
  getLocations = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = locationQuerySchema.parse(req.query);
    const warehouseId = req.params.warehouseId;

    const result = await locationService.getLocations(warehouseId, this.getCompanyId(req), {
      page: query.page,
      limit: query.limit,
      search: query.search,
      isActive: query.isActive,
    });

    sendSuccess(res, 'Lokasyonlar listelendi', result.locations, 200, {
      page: query.page || 1,
      limit: query.limit || 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (query.limit || 20)),
    });
  });

  getLocation = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const location = await locationService.getLocationById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Lokasyon detayı', location);
  });

  createLocation = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createLocationSchema.parse(req.body);
    const warehouseId = req.params.warehouseId;

    const location = await locationService.createLocation(warehouseId, this.getCompanyId(req), {
      ...data,
      warehouseId,
    });
    sendCreated(res, 'Lokasyon oluşturuldu', location);
  });

  updateLocation = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateLocationSchema.parse(req.body);
    const location = await locationService.updateLocation(req.params.id, this.getCompanyId(req), data);
    sendSuccess(res, 'Lokasyon güncellendi', location);
  });

  deleteLocation = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await locationService.deleteLocation(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Lokasyon silindi');
  });

  getLocationStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stocks = await locationService.getLocationStock(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Lokasyon stokları', stocks);
  });

  // Hangi lokasyonda hangi üründen kaç tane - Detaylı görüntüleme
  getLocationStockDetails = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const locationDetails = await locationService.getLocationStockDetails(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Lokasyon detayları', locationDetails);
  });

  // Depo bazlı tüm lokasyonlar ve stokları
  getWarehouseLocationStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const warehouseId = req.params.warehouseId;
    const locations = await locationService.getWarehouseLocationStock(warehouseId, this.getCompanyId(req));
    sendSuccess(res, 'Depo lokasyon stokları', locations);
  });

  // Ürün-lokasyon ataması ekle
  assignProductToLocation = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      productId: z.string().uuid('Geçersiz ürün ID'),
      variantId: z.string().uuid().optional(),
      isPrimary: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    const assignment = await locationService.assignProductToLocation(
      req.params.id,
      this.getCompanyId(req),
      data
    );
    sendCreated(res, 'Ürün lokasyona atandı', assignment);
  });

  // Ürün-lokasyon atamasını kaldır
  removeProductFromLocation = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      productId: z.string().uuid('Geçersiz ürün ID'),
      variantId: z.string().uuid().optional(),
    });
    const data = schema.parse(req.body);
    await locationService.removeProductFromLocation(
      req.params.id,
      this.getCompanyId(req),
      data.productId,
      data.variantId
    );
    sendSuccess(res, 'Ürün lokasyondan kaldırıldı');
  });

  // Ürünün lokasyon atamalarını getir
  getProductLocations = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const productId = req.params.productId;
    const variantId = req.query.variantId as string | undefined;
    const locations = await locationService.getProductLocations(productId, this.getCompanyId(req), variantId);
    sendSuccess(res, 'Ürün lokasyonları', locations);
  });

  // Barkod/SKU ile ürün ara ve lokasyonlarını getir (Ürün Nerede?)
  searchProductLocations = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      query: z.string().min(1, 'Arama terimi gerekli'),
    });
    const { query } = schema.parse(req.query);
    const result = await locationService.searchProductLocations(this.getCompanyId(req), query);
    sendSuccess(res, 'Ürün lokasyonları bulundu', result);
  });

  // Lokasyona stok ekle (barkod okutarak yerleştirme)
  addStockToLocation = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      productId: z.string().uuid('Geçersiz ürün ID'),
      variantId: z.string().uuid().optional(),
      warehouseId: z.string().uuid('Geçersiz depo ID'),
      locationId: z.string().uuid('Geçersiz lokasyon ID'),
      quantity: z.number().int().positive('Miktar pozitif olmalı'),
    });
    const data = schema.parse(req.body);
    const stock = await locationService.addStockToLocation(this.getCompanyId(req), data);
    sendCreated(res, 'Stok lokasyona eklendi', stock);
  });

  // Lokasyonlar arası stok taşı
  transferStockBetweenLocations = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      productId: z.string().uuid('Geçersiz ürün ID'),
      variantId: z.string().uuid().optional(),
      warehouseId: z.string().uuid('Geçersiz depo ID'),
      fromLocationId: z.string().uuid('Geçersiz kaynak lokasyon ID'),
      toLocationId: z.string().uuid('Geçersiz hedef lokasyon ID'),
      quantity: z.number().int().positive('Miktar pozitif olmalı'),
    });
    const data = schema.parse(req.body);
    const result = await locationService.transferStockBetweenLocations(this.getCompanyId(req), data);
    sendSuccess(res, 'Stok transfer edildi', result);
  });

  // Depodaki lokasyonsuz (rafa atanmamış) stok miktarını getir
  getUnassignedStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      productId: z.string().uuid('Geçersiz ürün ID'),
      variantId: z.string().uuid().optional(),
      warehouseId: z.string().uuid('Geçersiz depo ID'),
    });
    const { productId, variantId, warehouseId } = schema.parse(req.query);
    const quantity = await locationService.getUnassignedStock(
      this.getCompanyId(req),
      productId,
      variantId || null,
      warehouseId
    );
    sendSuccess(res, 'Lokasyonsuz stok miktarı', { quantity });
  });
}

export const locationController = new LocationController();

