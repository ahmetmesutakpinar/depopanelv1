/**
 * Marketplace Product Repository
 * 
 * Manages the mapping between marketplace products and internal products.
 * This repository handles the MarketplaceProduct table which represents
 * "this marketplace product maps to this internal product".
 */

import { prisma } from '../config/index.js';
import { MarketplaceType, Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';

export interface CreateMarketplaceProductLinkInput {
  productId: string;
  integrationId: string;
  marketplaceProductId: string;
  price?: number | null;
  listingUrl?: string | null;
}

export interface MarketplaceProductLink {
  id: string;
  marketplaceProductId: string;
  productId: string;
  integrationId: string;
  price: number | null;
  listingUrl: string | null;
  isActive: boolean;
  lastSyncAt: Date | null;
  syncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class MarketplaceProductRepository {
  /**
   * Find marketplace product link by integration and marketplace product ID
   */
  async findByMarketplaceProductId(
    integrationId: string,
    marketplaceProductId: string
  ): Promise<MarketplaceProductLink | null> {
    try {
      const result = await prisma.marketplaceProduct.findUnique({
        where: {
          integrationId_marketplaceId: {
            integrationId,
            marketplaceId: marketplaceProductId,
          },
        },
      });

      if (!result) return null;

      return {
        id: result.id,
        marketplaceProductId: result.marketplaceId,
        productId: result.productId,
        integrationId: result.integrationId,
        price: result.price ? Number(result.price) : null,
        listingUrl: result.listingUrl,
        isActive: result.isActive,
        lastSyncAt: result.lastSyncAt,
        syncError: result.syncError,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    } catch (error) {
      logger.error('[MarketplaceProductRepository] Error finding by marketplace product ID', {
        error: error instanceof Error ? error.message : String(error),
        integrationId,
        marketplaceProductId,
      });
      throw error;
    }
  }

  /**
   * Find all marketplace product links for a given internal product
   */
  async findByProductId(productId: string): Promise<MarketplaceProductLink[]> {
    try {
      const results = await prisma.marketplaceProduct.findMany({
        where: { productId },
      });

      return results.map(result => ({
        id: result.id,
        marketplaceProductId: result.marketplaceId,
        productId: result.productId,
        integrationId: result.integrationId,
        price: result.price ? Number(result.price) : null,
        listingUrl: result.listingUrl,
        isActive: result.isActive,
        lastSyncAt: result.lastSyncAt,
        syncError: result.syncError,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      }));
    } catch (error) {
      logger.error('[MarketplaceProductRepository] Error finding by product ID', {
        error: error instanceof Error ? error.message : String(error),
        productId,
      });
      throw error;
    }
  }

  /**
   * Create or update marketplace product link
   */
  async upsert(input: CreateMarketplaceProductLinkInput): Promise<MarketplaceProductLink> {
    try {
      const result = await prisma.marketplaceProduct.upsert({
        where: {
          integrationId_marketplaceId: {
            integrationId: input.integrationId,
            marketplaceId: input.marketplaceProductId,
          },
        },
        update: {
          productId: input.productId,
          price: input.price !== undefined && input.price !== null ? input.price : undefined,
          listingUrl: input.listingUrl || undefined,
          lastSyncAt: new Date(),
          syncError: null,
        },
        create: {
          productId: input.productId,
          integrationId: input.integrationId,
          marketplaceId: input.marketplaceProductId,
          price: input.price !== undefined && input.price !== null ? input.price : null,
          listingUrl: input.listingUrl || null,
          isActive: true,
          lastSyncAt: new Date(),
        },
      });

      return {
        id: result.id,
        marketplaceProductId: result.marketplaceId,
        productId: result.productId,
        integrationId: result.integrationId,
        price: result.price ? Number(result.price) : null,
        listingUrl: result.listingUrl,
        isActive: result.isActive,
        lastSyncAt: result.lastSyncAt,
        syncError: result.syncError,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    } catch (error) {
      logger.error('[MarketplaceProductRepository] Error upserting marketplace product link', {
        error: error instanceof Error ? error.message : String(error),
        input,
      });
      throw error;
    }
  }

  /**
   * Delete marketplace product link (unmatch)
   */
  async delete(integrationId: string, marketplaceProductId: string): Promise<void> {
    try {
      await prisma.marketplaceProduct.delete({
        where: {
          integrationId_marketplaceId: {
            integrationId,
            marketplaceId: marketplaceProductId,
          },
        },
      });
    } catch (error) {
      logger.error('[MarketplaceProductRepository] Error deleting marketplace product link', {
        error: error instanceof Error ? error.message : String(error),
        integrationId,
        marketplaceProductId,
      });
      throw error;
    }
  }

  /**
   * Find unmatched marketplace products (products in orders that don't have a link)
   * This requires checking order items that don't have a corresponding MarketplaceProduct entry
   */
  async findUnmatched(companyId: string): Promise<Array<{
    integrationId: string;
    marketplaceProductId: string;
    sku: string | null;
    barcode: string | null;
    marketplaceType: MarketplaceType;
  }>> {
    try {
      // Get all integrations for the company
      const integrations = await prisma.marketplaceIntegration.findMany({
        where: { companyId, isActive: true },
        select: { id: true, type: true },
      });

      const unmatched: Array<{
        integrationId: string;
        marketplaceProductId: string;
        sku: string | null;
        barcode: string | null;
        marketplaceType: MarketplaceType;
      }> = [];

      // For each integration, find order items that don't have a MarketplaceProduct link
      for (const integration of integrations) {
        // Find order items for this integration
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
          },
          distinct: ['sku'],
        });

        // Check which ones don't have MarketplaceProduct links
        for (const item of orderItems) {
          if (!item.sku) continue;

          // Try to find if there's a MarketplaceProduct link
          // Note: We can't directly match by SKU in MarketplaceProduct, so we check via ProductSource
          // This is a simplified check - in reality, we'd need to check via ProductSource or other means
          // For now, we'll return items that appear in orders but don't have explicit links
          // This is a placeholder - full implementation would require more complex queries
        }
      }

      return unmatched;
    } catch (error) {
      logger.error('[MarketplaceProductRepository] Error finding unmatched products', {
        error: error instanceof Error ? error.message : String(error),
        companyId,
      });
      throw error;
    }
  }
}

export const marketplaceProductRepository = new MarketplaceProductRepository();

