/**
 * Unresolved Product Controller
 * 
 * Handles admin operations for resolving products that could not be automatically identified.
 */

import { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { unresolvedProductService } from '../services/unresolved-product.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

// Validation schemas
const linkExistingProductSchema = z.object({
  orderItemId: z.string().uuid(),
  productId: z.string().uuid(),
});

const createAndLinkProductSchema = z.object({
  orderItemId: z.string().uuid(),
  sku: z.string().min(1),
  barcode: z.string().nullable().optional(),
  name: z.string().min(1),
  price: z.number().positive().optional(),
  costPrice: z.number().positive().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  categoryId: z.string().uuid().optional(),
});

class UnresolvedProductController {
  /**
   * GET /api/admin/unresolved-products
   * Get all unresolved products
   */
  getUnresolvedProducts: RequestHandler = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const companyId = req.user?.companyId;
      
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: 'Company ID is required',
        });
      }

      const unresolvedProducts = await unresolvedProductService.getUnresolvedProducts(companyId);

      sendSuccess(
        res,
        'Çözümlenmemiş ürünler listelendi',
        unresolvedProducts,
        200
      );
    }
  );

  /**
   * POST /api/admin/unresolved-products/link-existing
   * Link unresolved OrderItem to existing product
   */
  linkExistingProduct: RequestHandler = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId || !userId) {
        return res.status(403).json({
          success: false,
          message: 'Company ID and User ID are required',
        });
      }

      const data = linkExistingProductSchema.parse(req.body);

      const result = await unresolvedProductService.linkExistingProduct(companyId, {
        ...data,
        userId,
      });

      sendSuccess(
        res,
        'Order item mevcut ürüne bağlandı',
        result,
        200
      );
    }
  );

  /**
   * POST /api/admin/unresolved-products/create-and-link
   * Create new product and link unresolved OrderItems
   */
  createAndLinkProduct: RequestHandler = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId || !userId) {
        return res.status(403).json({
          success: false,
          message: 'Company ID and User ID are required',
        });
      }

      const data = createAndLinkProductSchema.parse(req.body);

      const result = await unresolvedProductService.createAndLinkProduct(companyId, {
        ...data,
        companyId,
        userId,
      });

      sendCreated(
        res,
        'Ürün oluşturuldu ve order item\'lar bağlandı',
        result
      );
    }
  );
}

export const unresolvedProductController = new UnresolvedProductController();

