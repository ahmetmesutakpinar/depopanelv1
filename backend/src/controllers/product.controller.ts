import { Response } from 'express';
import { z } from 'zod';
import { productService } from '../services/product.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { BaseController } from './base.controller.js';
import { CreateProductData, UpdateProductData } from '../repositories/product.repository.js';

// ==================== VALIDATION SCHEMAS ====================

export const createProductSchema = z.object({
  sku: z.string().min(1, 'SKU gerekli'),
  barcode: z.string().optional(),
  gtin: z.string().optional(), // GTIN, UPC, EAN, ISBN
  name: z.string().min(2, 'Ürün adı en az 2 karakter olmalı'),
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
  campaignSetId: z.string().uuid().nullable().optional(), // Campaign Set ID (FK relation)
  initialStock: z.object({
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    quantity: z.number().int().min(0),
  }).optional(),
});

export const updateProductSchema = z.object({
  campaignSetId: z.string().uuid().nullable().optional(),
  sku: z.string().min(1).optional(),
  barcode: z.string().optional(),
  gtin: z.string().optional(), // GTIN, UPC, EAN, ISBN
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
  primaryLocationId: z.string().uuid().nullable().optional(), // Lokasyon atama/değiştirme için
});

const productQuerySchema = paginationSchema.extend({
  categoryId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sortBy: z.enum(['name', 'sku', 'price', 'stock', 'createdAt']).optional(),
});

// ==================== CONTROLLER ====================

class ProductController extends BaseController {
  /**
   * GET /api/products
   */
  getProducts = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = productQuerySchema.parse(req.query);

    const result = await productService.getProducts(this.getCompanyId(req), {
      page: query.page,
      limit: query.limit,
      search: query.search,
      categoryId: query.categoryId,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    sendSuccess(res, 'Ürünler listelendi', result.products, 200, result.pagination);
  });

  /**
   * GET /api/products/stats
   */
  getStats = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await productService.getProductStats(this.getCompanyId(req));
    sendSuccess(res, 'Ürün istatistikleri', stats);
  });

  /**
   * GET /api/products/low-stock
   */
  getLowStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const products = await productService.getLowStockProducts(this.getCompanyId(req));
    sendSuccess(res, 'Düşük stoklu ürünler', products);
  });

  /**
   * GET /api/products/sku/:sku
   */
  getProductBySku = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const product = await productService.getProductBySku(this.getCompanyId(req), req.params.sku);
    sendSuccess(res, 'Ürün bulundu', product);
  });

  /**
   * GET /api/products/barcode/:barcode
   */
  getProductByBarcode = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const product = await productService.getProductByBarcode(this.getCompanyId(req), req.params.barcode);
    sendSuccess(res, 'Ürün bulundu', product);
  });

  /**
   * GET /api/products/:id
   */
  getProduct = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const product = await productService.getProductById(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Ürün detayı', product);
  });

  /**
   * POST /api/products
   */
  createProduct = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rawData = req.body;
    // Convert empty campaignSetId string to null for Prisma
    if (rawData.campaignSetId === '' || rawData.campaignSetId === undefined) {
      rawData.campaignSetId = null;
    }
    const parsed = createProductSchema.parse(rawData);
    const { initialStock, ...data } = parsed;
    const product = await productService.createProduct(this.getCompanyId(req), data as Omit<CreateProductData, 'companyId'>, initialStock);
    sendCreated(res, 'Ürün oluşturuldu', product);
  });

  /**
   * PUT /api/products/:id
   */
  updateProduct = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rawData = req.body;
    // Convert empty campaignSetId string to null for Prisma
    if (rawData.campaignSetId === '' || rawData.campaignSetId === undefined) {
      rawData.campaignSetId = null;
    }
    const data = updateProductSchema.parse(rawData) as UpdateProductData;
    const product = await productService.updateProduct(req.params.id, this.getCompanyId(req), data);
    sendSuccess(res, 'Ürün güncellendi', product);
  });

  /**
   * DELETE /api/products/:id
   */
  deleteProduct = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await productService.deleteProduct(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Ürün silindi');
  });

  /**
   * POST /api/products/:masterProductId/merge/:duplicateProductId
   * Merge duplicate product into master product
   */
  mergeProducts = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const masterProductId = req.params.masterProductId;
    const duplicateProductId = req.params.duplicateProductId;
    const companyId = this.getCompanyId(req);

    const result = await productService.mergeProducts(
      masterProductId,
      duplicateProductId,
      companyId
    );

    sendSuccess(res, 'Ürünler başarıyla birleştirildi', result);
  });

  /**
   * GET /api/products/:id/warehouses
   * Get product's warehouses and stock information
   */
  getProductWarehouses = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { getProductWarehouses } = await import('../utils/stock-helper.js');
    const warehouses = await getProductWarehouses(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Ürün depo bilgileri', warehouses);
  });

  /**
   * GET /api/products/:id/warehouses/:warehouseId/stock
   * Get product's stock in specific warehouse
   */
  getProductWarehouseStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { prisma } = await import('../config/index.js');
    const companyId = this.getCompanyId(req);
    
    // Verify product belongs to company
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        companyId,
      },
    });

    if (!product) {
      throw new (await import('../middleware/error.middleware.js')).NotFoundError('Ürün bulunamadı');
    }

    // Get stock
    const stock = await prisma.stock.findFirst({
      where: {
        productId: req.params.id,
        warehouseId: req.params.warehouseId,
        warehouse: {
          companyId,
        },
      },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
            isDefault: true,
          },
        },
        location: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!stock) {
      throw new (await import('../middleware/error.middleware.js')).NotFoundError('Stok kaydı bulunamadı');
    }

    sendSuccess(res, 'Stok bilgisi', stock);
  });

  /**
   * POST /api/products/:id/warehouses/:warehouseId/stock
   * Create or update product stock in warehouse
   */
  createOrUpdateProductStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { z } = await import('zod');
    const { createProductStock, updateProductStock, ensureProductStockInWarehouse } = await import('../utils/stock-helper.js');
    const { prisma } = await import('../config/index.js');
    const companyId = this.getCompanyId(req);

    const stockSchema = z.object({
      quantity: z.number().int().min(0),
      minQuantity: z.number().int().min(0).optional(),
      locationId: z.string().uuid().optional(),
      note: z.string().optional(),
    });

    const data = stockSchema.parse(req.body);

    // Verify product and warehouse belong to company
    const [product, warehouse] = await Promise.all([
      prisma.product.findFirst({
        where: { id: req.params.id, companyId },
      }),
      prisma.warehouse.findFirst({
        where: { id: req.params.warehouseId, companyId },
      }),
    ]);

    if (!product) {
      throw new (await import('../middleware/error.middleware.js')).NotFoundError('Ürün bulunamadı');
    }

    if (!warehouse) {
      throw new (await import('../middleware/error.middleware.js')).NotFoundError('Depo bulunamadı');
    }

    // Check if stock exists
    const existingStock = await prisma.stock.findFirst({
      where: {
        productId: req.params.id,
        warehouseId: req.params.warehouseId,
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      if (existingStock) {
        return await updateProductStock(tx, {
          productId: req.params.id,
          warehouseId: req.params.warehouseId,
          quantity: data.quantity,
          minQuantity: data.minQuantity,
          note: data.note || 'Stok güncelleme',
          userId: req.user?.id,
        });
      } else {
        return await createProductStock(tx, {
          productId: req.params.id,
          warehouseId: req.params.warehouseId,
          locationId: data.locationId,
          quantity: data.quantity,
          minQuantity: data.minQuantity,
          note: data.note || 'Stok oluşturma',
          userId: req.user?.id,
        });
      }
    });

    sendSuccess(res, existingStock ? 'Stok güncellendi' : 'Stok oluşturuldu', result.stock);
  });

  /**
   * DELETE /api/products/:id/warehouses/:warehouseId/stock
   * Delete product stock from warehouse
   */
  deleteProductStock = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { prisma } = await import('../config/index.js');
    const companyId = this.getCompanyId(req);

    // Verify product and warehouse belong to company
    const stock = await prisma.stock.findFirst({
      where: {
        productId: req.params.id,
        warehouseId: req.params.warehouseId,
        product: { companyId },
        warehouse: { companyId },
      },
    });

    if (!stock) {
      throw new (await import('../middleware/error.middleware.js')).NotFoundError('Stok kaydı bulunamadı');
    }

    // Check if this is the default warehouse and product has stock
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: req.params.warehouseId,
        companyId,
      },
    });

    if (warehouse?.isDefault && stock.quantity > 0) {
      throw new (await import('../middleware/error.middleware.js')).AppError(
        'Varsayılan depodaki stok silinemez. Önce stoğu sıfırlayın.',
        400
      );
    }

    await prisma.stock.delete({
      where: { id: stock.id },
    });

    sendSuccess(res, 'Stok kaydı silindi');
  });
}

export const productController = new ProductController();

