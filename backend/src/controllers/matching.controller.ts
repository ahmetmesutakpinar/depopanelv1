/**
 * Product Matching Controller
 * 
 * Handles manual product matching between internal products and marketplace products.
 * 
 * Endpoints:
 * - GET /api/products/unmatched - Get unmatched marketplace products
 * - POST /api/products/:productId/match - Manually match a product to a marketplace
 * - POST /api/products/:productId/unmatch - Unmatch a product from a marketplace
 */

import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendErrorResponse } from '../utils/response.js';
import { BaseController } from './base.controller.js';
import { prisma } from '../config/index.js';
import { marketplaceProductRepository } from '../repositories/marketplace-product.repository.js';
import { logger } from '../utils/logger.js';
import { MarketplaceType } from '@prisma/client';
import { createMarketplaceIntegrationWithDecryption } from '../utils/integration-helper.js';

// ==================== VALIDATION SCHEMAS ====================

const matchProductSchema = z.object({
  integrationId: z.string().uuid('Geçersiz integration ID'),
  marketplaceProductId: z.string().min(1, 'Marketplace product ID gerekli'),
  sku: z.string().optional(),
  barcode: z.string().optional().nullable(),
  price: z.number().optional().nullable(),
  listingUrl: z.string().url().optional().nullable(),
});

const unmatchProductSchema = z.object({
  integrationId: z.string().uuid('Geçersiz integration ID'),
  marketplaceProductId: z.string().min(1, 'Marketplace product ID gerekli'),
});

// ==================== CONTROLLER ====================

class MatchingController extends BaseController {
  /**
   * GET /api/products/unmatched
   * Get unmatched marketplace products (products in orders without a MarketplaceProduct link)
   * 
   * Returns order items from active integrations that don't have a corresponding
   * MarketplaceProduct entry linked to an internal product.
   */
  getUnmatched = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);

    try {
      // Get all active integrations for the company
      const integrations = await prisma.marketplaceIntegration.findMany({
        where: { companyId, isActive: true },
        select: { id: true, type: true, name: true },
      });

      const unmatched: Array<{
        integrationId: string;
        integrationName: string;
        marketplaceType: MarketplaceType;
        marketplaceProductId: string | null;
        sku: string | null;
        barcode: string | null;
        orderCount: number;
        lastSeen: Date | null;
      }> = [];

      // For each integration, find order items that don't have MarketplaceProduct links
      for (const integration of integrations) {
        // Find distinct SKUs from order items for this integration
        // that don't have a MarketplaceProduct link
        const orderItems = await prisma.orderItem.findMany({
          where: {
            order: {
              integrationId: integration.id,
              companyId,
            },
            sku: { not: null },
          },
          select: {
            sku: true,
            barcode: true,
            order: {
              select: {
                createdAt: true,
              },
            },
          },
          orderBy: {
            order: {
              createdAt: 'desc',
            },
          },
        });

        // Group by SKU and check which ones don't have MarketplaceProduct links
        const skuMap = new Map<string, {
          sku: string;
          barcode: string | null;
          orderCount: number;
          lastSeen: Date;
        }>();

        for (const item of orderItems) {
          if (!item.sku) continue;

          if (!skuMap.has(item.sku)) {
            skuMap.set(item.sku, {
              sku: item.sku,
              barcode: item.barcode,
              orderCount: 0,
              lastSeen: item.order.createdAt,
            });
          }

          const entry = skuMap.get(item.sku)!;
          entry.orderCount++;
          if (item.order.createdAt > entry.lastSeen) {
            entry.lastSeen = item.order.createdAt;
          }
        }

        // Check which SKUs don't have MarketplaceProduct links
        // We need to check if there's a Product with this SKU that has a MarketplaceProduct link
        for (const [sku, data] of skuMap.entries()) {
          // Find product by SKU
          const product = await prisma.product.findFirst({
            where: {
              companyId,
              sku,
            },
            include: {
              marketplaceProducts: {
                where: {
                  integrationId: integration.id,
                },
              },
            },
          });

          // If product doesn't exist or doesn't have a MarketplaceProduct link, it's unmatched
          if (!product || product.marketplaceProducts.length === 0) {
            unmatched.push({
              integrationId: integration.id,
              integrationName: integration.name,
              marketplaceType: integration.type,
              marketplaceProductId: null, // We don't have this in order items
              sku: data.sku,
              barcode: data.barcode,
              orderCount: data.orderCount,
              lastSeen: data.lastSeen,
            });
          }
        }
      }

      sendSuccess(res, 'Eşleşmeyen ürünler listelendi', unmatched);
    } catch (error) {
      logger.error('[MatchingController] Error getting unmatched products', {
        error: error instanceof Error ? error.message : String(error),
        companyId,
      });
      sendErrorResponse(res, error);
    }
  });

  /**
   * POST /api/products/:productId/match
   * Manually match an internal product to a marketplace product
   * 
   * Creates a MarketplaceProduct link between the internal product and the marketplace product.
   * This allows the system to track that this marketplace product maps to this internal product.
   */
  matchProduct = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const productId = req.params.productId;
    const data = matchProductSchema.parse(req.body);

    try {
      // Verify product belongs to company
      const product = await prisma.product.findFirst({
        where: {
          id: productId,
          companyId,
        },
      });

      if (!product) {
        return sendErrorResponse(res, new Error('Ürün bulunamadı'), 404);
      }

      // Verify integration belongs to company
      const integration = await prisma.marketplaceIntegration.findFirst({
        where: {
          id: data.integrationId,
          companyId,
          isActive: true,
        },
      });

      if (!integration) {
        return sendErrorResponse(res, new Error('Integration bulunamadı veya aktif değil'), 404);
      }

      // If listingUrl is not provided, try to fetch it from marketplace API
      let listingUrl = data.listingUrl || null;
      if (!listingUrl && data.marketplaceProductId) {
        try {
          const marketplaceIntegration = createMarketplaceIntegrationWithDecryption(
            integration.type as MarketplaceType,
            integration
          );

          // Try to get product URL from marketplace API
          if (integration.type === 'WOOCOMMERCE') {
            const productId = parseInt(data.marketplaceProductId, 10);
            if (!isNaN(productId)) {
              logger.debug('[MatchingController] Fetching WooCommerce product', { productId });
              const wcProduct = await (marketplaceIntegration as any).getProduct(productId);
              logger.debug('[MatchingController] WooCommerce product fetched', {
                productId,
                hasPermalink: !!wcProduct?.permalink,
                hasLink: !!wcProduct?.link,
                productKeys: wcProduct ? Object.keys(wcProduct).slice(0, 20) : null,
              });

              // WooCommerce API returns 'permalink' or 'link' field in product response
              if (wcProduct?.permalink) {
                listingUrl = wcProduct.permalink;
                logger.info('[MatchingController] ListingUrl fetched from WooCommerce API (permalink)', {
                  marketplaceProductId: data.marketplaceProductId,
                  listingUrl,
                });
              } else if (wcProduct?.link) {
                listingUrl = wcProduct.link;
                logger.info('[MatchingController] ListingUrl fetched from WooCommerce API (link)', {
                  marketplaceProductId: data.marketplaceProductId,
                  listingUrl,
                });
              } else {
                logger.warn('[MatchingController] WooCommerce product URL not found in API response', {
                  marketplaceProductId: data.marketplaceProductId,
                  productId,
                  availableKeys: wcProduct ? Object.keys(wcProduct).slice(0, 30) : null,
                });
              }
            } else {
              logger.warn('[MatchingController] Invalid WooCommerce product ID (not a number)', {
                marketplaceProductId: data.marketplaceProductId,
              });
            }
          } else if (integration.type === 'TRENDYOL') {
            // Trendyol için URL formatı: https://www.trendyol.com/{supplierName}/{productSlug}-p-{productId}
            // API'den ürün bilgisi çekmek için gerekirse buraya eklenebilir
            // Şimdilik sadece log atıyoruz
            logger.debug('[MatchingController] Trendyol listingUrl auto-fetch not implemented yet', {
              marketplaceProductId: data.marketplaceProductId,
            });
          }
        } catch (error) {
          // API'den çekme hatası - sessizce devam et, kullanıcının girdiği URL'yi kullan
          logger.warn('[MatchingController] Failed to fetch listingUrl from marketplace API', {
            error: error instanceof Error ? error.message : String(error),
            marketplaceProductId: data.marketplaceProductId,
            integrationType: integration.type,
          });
        }
      }

      // Create or update marketplace product link
      const link = await marketplaceProductRepository.upsert({
        productId,
        integrationId: data.integrationId,
        marketplaceProductId: data.marketplaceProductId,
        price: data.price || null,
        listingUrl: listingUrl,
      });

      logger.info('[MatchingController] Product matched to marketplace', {
        productId,
        integrationId: data.integrationId,
        marketplaceProductId: data.marketplaceProductId,
        companyId,
      });

      sendSuccess(res, 'Ürün marketplace ile eşleştirildi', {
        id: link.id,
        productId: link.productId,
        integrationId: link.integrationId,
        marketplaceProductId: link.marketplaceProductId,
      });
    } catch (error) {
      logger.error('[MatchingController] Error matching product', {
        error: error instanceof Error ? error.message : String(error),
        productId,
        companyId,
      });
      sendErrorResponse(res, error);
    }
  });

  /**
   * POST /api/products/:productId/unmatch
   * Unmatch an internal product from a marketplace product
   * 
   * Removes the MarketplaceProduct link, indicating this marketplace product
   * is no longer linked to this internal product.
   */
  unmatchProduct = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const productId = req.params.productId;
    const data = unmatchProductSchema.parse(req.body);

    try {
      // Verify product belongs to company
      const product = await prisma.product.findFirst({
        where: {
          id: productId,
          companyId,
        },
      });

      if (!product) {
        return sendErrorResponse(res, new Error('Ürün bulunamadı'), 404);
      }

      // Verify integration belongs to company
      const integration = await prisma.marketplaceIntegration.findFirst({
        where: {
          id: data.integrationId,
          companyId,
        },
      });

      if (!integration) {
        return sendErrorResponse(res, new Error('Integration bulunamadı'), 404);
      }

      // Delete marketplace product link
      await marketplaceProductRepository.delete(data.integrationId, data.marketplaceProductId);

      logger.info('[MatchingController] Product unmatched from marketplace', {
        productId,
        integrationId: data.integrationId,
        marketplaceProductId: data.marketplaceProductId,
        companyId,
      });

      sendSuccess(res, 'Ürün marketplace ile eşleştirme kaldırıldı');
    } catch (error) {
      logger.error('[MatchingController] Error unmatching product', {
        error: error instanceof Error ? error.message : String(error),
        productId,
        companyId,
      });
      sendErrorResponse(res, error);
    }
  });
}

export const matchingController = new MatchingController();

