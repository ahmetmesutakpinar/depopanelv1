import { Response } from 'express';
import { z } from 'zod';
import { orderService } from '../services/order.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated, sendError, sendNotFound } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { ZodError } from 'zod';
import { BaseController } from './base.controller.js';

// ==================== VALIDATION SCHEMAS ====================

export const createOrderSchema = z.object({
  customerName: z.string().min(2, 'Müşteri adı en az 2 karakter olmalı'),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  shippingAddress: z.string().min(5, 'Teslimat adresi gerekli'),
  shippingCity: z.string().optional(),
  shippingDistrict: z.string().optional(),
  shippingPostalCode: z.string().optional(),
  billingAddress: z.string().optional(),
  warehouseId: z.string().uuid().optional(),
  customerNote: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().uuid('Geçersiz ürün ID'),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().positive('Miktar pozitif olmalı'),
  })).min(1, 'En az bir ürün ekleyin'),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']),
  cargoCompany: z.string().optional(),
  trackingNumber: z.string().optional(),
  internalNote: z.string().optional(),
});

export const bulkUpdateOrderStatusSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1, 'En az bir sipariş seçin'),
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']),
  cargoCompany: z.string().optional(),
  trackingNumber: z.string().optional(),
  internalNote: z.string().optional(),
});

export const scanOrderItemSchema = z.object({
  barcode: z.string().min(1, 'Barkod gerekli'),
  locationId: z.string().uuid().optional(),
});

// Order query schema with higher limit for reports (up to 10000)
const orderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(10000).default(20), // Increased max for reports
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'total', 'orderNumber']).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']).optional(),
  integrationId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  pickingWaveId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// Date validation schema for daily-products endpoint
const dailyProductsQuerySchema = z.object({
  date: z.string().optional().transform((val) => {
    if (!val) return undefined;
    // Try to parse as ISO date string or common date formats
    const parsed = new Date(val);
    if (isNaN(parsed.getTime())) {
      throw new z.ZodError([{
        code: 'custom',
        path: ['date'],
        message: 'Geçersiz tarih formatı. ISO formatında tarih girin (örn: 2025-12-23)',
      }]);
    }
    return parsed.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  }),
});

// ==================== CONTROLLER ====================

class OrderController extends BaseController {
  /**
   * GET /api/orders
   */
  getOrders = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query = orderQuerySchema.parse(req.query);

      // Normalize search string - remove empty strings
      const search = query.search && query.search.trim() ? query.search.trim() : undefined;

      // Parse dates safely
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (query.startDate) {
        startDate = new Date(query.startDate);
        if (isNaN(startDate.getTime())) {
          return sendError(res, 'Geçersiz başlangıç tarihi formatı', 400);
        }
      }
      
      if (query.endDate) {
        endDate = new Date(query.endDate);
        if (isNaN(endDate.getTime())) {
          return sendError(res, 'Geçersiz bitiş tarihi formatı', 400);
        }
      }

      // Validate date range
      if (startDate && endDate && startDate > endDate) {
        return sendError(res, 'Başlangıç tarihi bitiş tarihinden sonra olamaz', 400);
      }

      const result = await orderService.getOrders(this.getCompanyId(req), {
        page: query.page,
        limit: query.limit,
        search,
        status: query.status,
        integrationId: query.integrationId,
        warehouseId: query.warehouseId,
        pickingWaveId: query.pickingWaveId,
        startDate,
        endDate,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      sendSuccess(res, 'Siparişler listelendi', result.orders, 200, result.pagination);
    } catch (error) {
      if (error instanceof ZodError) {
        throw error; // Let error middleware handle it
      }
      throw error;
    }
  });

  /**
   * GET /api/orders/stats
   */
  getStats = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate } = req.query;

    const stats = await orderService.getOrderStats(
      this.getCompanyId(req),
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    sendSuccess(res, 'Sipariş istatistikleri', stats);
  });

  /**
   * GET /api/orders/daily-products
   */
  getDailyOrderedProducts = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Validate and parse date query parameter
      const query = dailyProductsQuerySchema.parse(req.query);
      
      // Parse date safely
      let targetDate: Date;
      if (query.date) {
        // Date is already validated and in YYYY-MM-DD format
        targetDate = new Date(query.date + 'T00:00:00.000Z');
        // Validate that the date is valid
        if (isNaN(targetDate.getTime())) {
          return sendError(res, 'Geçersiz tarih formatı', 400);
        }
      } else {
        targetDate = new Date();
      }

      const products = await orderService.getDailyOrderedProducts(
        this.getCompanyId(req),
        targetDate
      );

      sendSuccess(res, 'Günlük sipariş edilen ürünler', products);
    } catch (error) {
      if (error instanceof ZodError) {
        throw error; // Let error middleware handle it
      }
      throw error;
    }
  });

  /**
   * GET /api/orders/:id
   */
  getOrder = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const order = await orderService.getOrderById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Sipariş detayı', order);
  });

  /**
   * POST /api/orders
   */
  createOrder = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createOrderSchema.parse(req.body);
    const order = await orderService.createOrder(this.getCompanyId(req), data, this.getUserId(req));
    sendCreated(res, 'Sipariş oluşturuldu', order);
  });

  /**
   * PUT /api/orders/:id/status
   */
  updateStatus = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateOrderStatusSchema.parse(req.body);
    const order = await orderService.updateOrderStatus(
      req.params.id,
      this.getCompanyId(req),
      data.status,
      {
        cargoCompany: data.cargoCompany,
        trackingNumber: data.trackingNumber,
        internalNote: data.internalNote,
      },
      this.getUserId(req)
    );
    sendSuccess(res, 'Sipariş durumu güncellendi', order);
  });

  /**
   * POST /api/orders/:id/cancel
   */
  cancelOrder = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await orderService.cancelOrder(req.params.id, this.getCompanyId(req), this.getUserId(req));
    sendSuccess(res, result.message);
  });

  /**
   * PUT /api/orders/bulk-update
   * Toplu sipariş durumu güncelleme
   */
  bulkUpdateStatus = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = bulkUpdateOrderStatusSchema.parse(req.body);
    const result = await orderService.bulkUpdateOrderStatus(
      this.getCompanyId(req),
      data.orderIds,
      data.status,
      {
        cargoCompany: data.cargoCompany,
        trackingNumber: data.trackingNumber,
        internalNote: data.internalNote,
      }
    );
    sendSuccess(res, `${result.updated} sipariş durumu güncellendi`, result);
  });

  /**
   * POST /api/orders/:id/scan-item
   * Barkod okutulduğunda stok düşürme
   */
  scanOrderItem = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = scanOrderItemSchema.parse(req.body);
    const result = await orderService.scanOrderItem(
      req.params.id,
      this.getCompanyId(req),
      data.barcode,
      data.locationId,
      this.getUserId(req)
    );
    sendSuccess(res, 'Barkod okutuldu ve stok düşürüldü', result);
  });

  /**
   * GET /api/orders/barcode/:barcode
   * Barkod ile sipariş ara (Navlungo / Hepsijet barkodları için)
   */
  findOrderByBarcode = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { barcode } = req.params;
    const order = await orderService.findOrderByBarcode(barcode, this.getCompanyId(req));
    sendSuccess(res, 'Sipariş bulundu', order);
  });

  /**
   * GET /api/orders/by-shipping-code?code=XXXX
   * Shipping barcode ile sipariş ara (Depocu barkod okuttuğunda)
   */
  getByShippingCode = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const code = String(req.query.code || '').trim();
    
    if (!code) {
      return sendError(res, 'Geçersiz barkod kodu', 400);
    }

    const order = await orderService.findByShippingCode(code, this.getCompanyId(req));

    if (!order) {
      return sendNotFound(res, 'Bu barkod ile eşleşen sipariş bulunamadı');
    }

    sendSuccess(res, 'Sipariş bulundu', order);
  });
}

export const orderController = new OrderController();

