import { Response } from 'express';
import { z } from 'zod';
import { stockService } from '../services/stock.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { StockLogType } from '@prisma/client';
import { BaseController } from './base.controller.js';

// ==================== VALIDATION SCHEMAS ====================

export const adjustStockSchema = z.object({
  productId: z.string().uuid('Geçersiz ürün ID'),
  warehouseId: z.string().uuid('Geçersiz depo ID'),
  quantity: z.number().int().min(0, 'Miktar 0 veya pozitif tam sayı olmalı'),
  type: z.enum(['IN', 'OUT', 'RETURN', 'ADJUSTMENT'] as const),
  note: z.string().optional(),
  reference: z.string().optional(),
  variantId: z.string().uuid().optional(),
});

export const transferStockSchema = z.object({
  productId: z.string().uuid('Geçersiz ürün ID'),
  fromWarehouseId: z.string().uuid('Geçersiz kaynak depo ID'),
  toWarehouseId: z.string().uuid('Geçersiz hedef depo ID'),
  quantity: z.number().int().positive('Miktar pozitif tam sayı olmalı'),
  note: z.string().optional(),
  variantId: z.string().uuid().optional(),
});

export const transferLocationStockSchema = z.object({
  productId: z.string().uuid('Geçersiz ürün ID'),
  fromLocationId: z.string().uuid('Geçersiz kaynak lokasyon ID'),
  toLocationId: z.string().uuid('Geçersiz hedef lokasyon ID'),
  quantity: z.number().int().positive('Miktar pozitif tam sayı olmalı'),
  note: z.string().optional(),
  variantId: z.string().uuid().optional(),
});

export const setMinQuantitySchema = z.object({
  productId: z.string().uuid('Geçersiz ürün ID'),
  warehouseId: z.string().uuid('Geçersiz depo ID'),
  minQuantity: z.number().int().min(0, 'Minimum miktar 0 veya daha büyük olmalı'),
});

const stockLogQuerySchema = paginationSchema.extend({
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  type: z.enum(['IN', 'OUT', 'RETURN', 'ADJUSTMENT', 'TRANSFER'] as const).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const warehouseStockQuerySchema = paginationSchema.extend({
  lowStock: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

// ==================== CONTROLLER ====================

class StockController extends BaseController {
  /**
   * GET /api/stocks/product/:productId
   */
  getProductStocks = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stocks = await stockService.getProductStocks(req.params.productId, this.getCompanyId(req));
    sendSuccess(res, 'Ürün stokları', stocks);
  });

  /**
   * GET /api/stocks/warehouse/:warehouseId
   */
  getWarehouseStocks = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = warehouseStockQuerySchema.parse(req.query);

    const result = await stockService.getWarehouseStocks(
      req.params.warehouseId,
      this.getCompanyId(req),
      {
        page: query.page,
        limit: query.limit,
        search: query.search,
        lowStock: query.lowStock,
      }
    );

    sendSuccess(res, 'Depo stokları', result.stocks, 200, result.pagination);
  });

  /**
   * POST /api/stocks/adjust
   */
  adjustStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = adjustStockSchema.parse(req.body);

    const result = await stockService.adjustStock(
      this.getCompanyId(req),
      {
        productId: data.productId,
        warehouseId: data.warehouseId,
        quantity: data.quantity,
        type: data.type as StockLogType,
        note: data.note,
        reference: data.reference,
        variantId: data.variantId,
      },
      req.user.id
    );

    sendSuccess(res, 'Stok güncellendi', result);
  });

  /**
   * POST /api/stocks/transfer
   */
  transferStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = transferStockSchema.parse(req.body);

    const result = await stockService.transferStock(
      this.getCompanyId(req),
      {
        productId: data.productId,
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        quantity: data.quantity,
        note: data.note,
        variantId: data.variantId,
      },
      req.user.id
    );

    sendSuccess(res, result.message);
  });

  /**
   * POST /api/stocks/transfer-location
   */
  transferLocationStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = transferLocationStockSchema.parse(req.body);

    const result = await stockService.transferStockBetweenLocations(
      this.getCompanyId(req),
      {
        productId: data.productId,
        fromLocationId: data.fromLocationId,
        toLocationId: data.toLocationId,
        quantity: data.quantity,
        note: data.note,
        variantId: data.variantId,
      },
      req.user.id
    );

    sendSuccess(res, result.message);
  });

  /**
   * GET /api/stocks/logs
   */
  getStockLogs = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = stockLogQuerySchema.parse(req.query);

    const result = await stockService.getStockLogs(this.getCompanyId(req), {
      productId: query.productId,
      warehouseId: query.warehouseId,
      type: query.type as StockLogType | undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page: query.page,
      limit: query.limit,
    });

    sendSuccess(res, 'Stok hareketleri', result.logs, 200, result.pagination);
  });

  /**
   * POST /api/stocks/min-quantity
   */
  setMinQuantity = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = setMinQuantitySchema.parse(req.body);

    const stock = await stockService.setMinQuantity(
      this.getCompanyId(req),
      data.productId,
      data.warehouseId,
      data.minQuantity
    );

    sendSuccess(res, 'Minimum stok ayarlandı', stock);
  });

  /**
   * GET /api/stocks/summary
   * Get stock summary calculated from StockLog (LEDGER ARCHITECTURE)
   */
  getStockSummary = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const productIds = req.query.productIds 
      ? (Array.isArray(req.query.productIds) ? req.query.productIds : [req.query.productIds]) as string[]
      : undefined;
    const warehouseId = req.query.warehouseId as string | undefined;

    const summary = await stockService.getStockSummary(companyId, {
      productIds,
      warehouseId,
    });

    // Add deprecation warning in metadata
    sendSuccess(res, 'Stok özeti', summary, 200, {
      deprecated: {
        message: 'product.totalStock and stock.quantity are deprecated. Use availableStock from this endpoint.',
        fields: ['product.totalStock', 'stock.quantity'],
      },
    });
  });
}

export const stockController = new StockController();

