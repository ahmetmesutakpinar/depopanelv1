/**
 * Unified Product Matcher
 * 
 * This utility provides a single source of truth for matching marketplace products
 * to internal products following a strict priority order:
 * 
 * 1. marketplaceProductId (via ProductSource.externalProductId)
 * 2. sku
 * 3. barcode / gtin (if exists)
 * 
 * NEVER matches by name.
 * 
 * If no match is found, returns null and logs a warning.
 */

import { prisma } from '../config/index.js';
import { productRepository } from '../repositories/product.repository.js';
import { logger } from './logger.js';
import { MarketplaceType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface MarketplaceProductIdentifiers {
  marketplace: MarketplaceType | string;
  marketplaceProductId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  gtin?: string | null;
  companyId: string;
  integrationId?: string;
}

export interface MatchResult {
  product: any; // Product from Prisma
  matchMethod: 'marketplaceProductId' | 'sku' | 'barcode' | 'gtin' | null;
  productSource?: any; // ProductSource if found via marketplaceProductId
}

/**
 * Match a marketplace product to an internal product
 * 
 * Priority order:
 * 1. marketplaceProductId (via ProductSource.externalProductId)
 * 2. sku
 * 3. barcode / gtin
 * 
 * @param identifiers - Marketplace product identifiers
 * @returns MatchResult with product and match method, or null if no match
 */
export async function matchMarketplaceProduct(
  identifiers: MarketplaceProductIdentifiers
): Promise<MatchResult | null> {
  const { marketplace, marketplaceProductId, sku, barcode, gtin, companyId, integrationId } = identifiers;

  // Validate required fields
  if (!companyId) {
    logger.warn('[ProductMatcher] CompanyId is required', { identifiers });
    return null;
  }

  // STEP 1: Try matching by marketplaceProductId (HIGHEST PRIORITY)
  if (marketplaceProductId && integrationId) {
    try {
      const productSource = await prisma.productSource.findFirst({
        where: {
          integrationId,
          externalProductId: String(marketplaceProductId),
        },
        include: {
          product: true,
        },
      });

      if (productSource && productSource.product) {
        logger.debug('[ProductMatcher] Product matched via marketplaceProductId', {
          marketplace,
          marketplaceProductId,
          productId: productSource.product.id,
          productSku: productSource.product.sku,
          matchMethod: 'marketplaceProductId',
        });

        return {
          product: productSource.product,
          matchMethod: 'marketplaceProductId',
          productSource,
        };
      }
    } catch (error) {
      logger.error('[ProductMatcher] Error matching by marketplaceProductId', error, {
        marketplace,
        marketplaceProductId,
        integrationId,
      });
    }
  }

  // STEP 2: Try matching by SKU
  if (sku && sku.trim()) {
    try {
      const product = await productRepository.findBySku(companyId, sku.trim());

      if (product) {
        logger.debug('[ProductMatcher] Product matched via SKU', {
          marketplace,
          sku: sku.trim(),
          productId: product.id,
          productSku: product.sku,
          matchMethod: 'sku',
        });

        return {
          product,
          matchMethod: 'sku',
        };
      }
    } catch (error) {
      logger.error('[ProductMatcher] Error matching by SKU', error, {
        marketplace,
        sku,
        companyId,
      });
    }
  }

  // STEP 3: Try matching by barcode
  if (barcode && barcode.trim()) {
    try {
      const product = await productRepository.findByBarcode(companyId, barcode.trim());

      if (product) {
        logger.debug('[ProductMatcher] Product matched via barcode', {
          marketplace,
          barcode: barcode.trim(),
          productId: product.id,
          productSku: product.sku,
          matchMethod: 'barcode',
        });

        return {
          product,
          matchMethod: 'barcode',
        };
      }
    } catch (error) {
      logger.error('[ProductMatcher] Error matching by barcode', error, {
        marketplace,
        barcode,
        companyId,
      });
    }
  }

  // STEP 4: Try matching by GTIN (if different from barcode)
  if (gtin && gtin.trim() && gtin !== barcode) {
    try {
      // GTIN is stored in Product.gtin field
      const product = await prisma.product.findFirst({
        where: {
          companyId,
          gtin: gtin.trim(),
        },
      });

      if (product) {
        logger.debug('[ProductMatcher] Product matched via GTIN', {
          marketplace,
          gtin: gtin.trim(),
          productId: product.id,
          productSku: product.sku,
          matchMethod: 'gtin',
        });

        return {
          product,
          matchMethod: 'gtin',
        };
      }
    } catch (error) {
      logger.error('[ProductMatcher] Error matching by GTIN', error, {
        marketplace,
        gtin,
        companyId,
      });
    }
  }

  // NO MATCH FOUND - Log warning with all identifiers
  logger.warn('[ProductMatcher] Product could not be matched - UNMATCHED', {
    marketplace,
    marketplaceProductId: marketplaceProductId || 'N/A',
    sku: sku || 'N/A',
    barcode: barcode || 'N/A',
    gtin: gtin || 'N/A',
    companyId,
    integrationId: integrationId || 'N/A',
    message: 'Product will be marked as UNMATCHED. Stock updates will be skipped.',
  });

  return null;
}

/**
 * Check if a product is already linked to a marketplace via ProductSource
 * 
 * @param productId - Internal product ID
 * @param integrationId - Marketplace integration ID
 * @returns ProductSource if exists, null otherwise
 */
export async function getProductSource(
  productId: string,
  integrationId: string
): Promise<any | null> {
  try {
    return await prisma.productSource.findFirst({
      where: {
        productId,
        integrationId,
      },
    });
  } catch (error) {
    logger.error('[ProductMatcher] Error getting ProductSource', error, {
      productId,
      integrationId,
    });
    return null;
  }
}

/**
 * Create or update ProductSource for a matched product
 * 
 * @param productId - Internal product ID
 * @param integrationId - Marketplace integration ID
 * @param externalProductId - Marketplace product ID
 * @param externalSku - Marketplace SKU (optional)
 * @param externalBarcode - Marketplace barcode (optional)
 * @param externalPrice - Marketplace price (optional)
 * @returns Created or updated ProductSource
 */
export async function upsertProductSource(
  productId: string,
  integrationId: string,
  externalProductId: string,
  externalSku?: string | null,
  externalBarcode?: string | null,
  externalPrice?: number | null
): Promise<any> {
  try {
    const existing = await prisma.productSource.findFirst({
      where: {
        productId,
        integrationId,
      },
    });

    if (existing) {
      // Update existing ProductSource
      return await prisma.productSource.update({
        where: { id: existing.id },
        data: {
          externalProductId: String(externalProductId),
          externalSku: externalSku || null,
          externalBarcode: externalBarcode || null,
          externalPrice: externalPrice ? new Decimal(externalPrice) : null,
          lastSyncAt: new Date(),
        },
      });
    } else {
      // Create new ProductSource
      return await prisma.productSource.create({
        data: {
          productId,
          integrationId,
          externalProductId: String(externalProductId),
          externalSku: externalSku || null,
          externalBarcode: externalBarcode || null,
          externalPrice: externalPrice ? new Decimal(externalPrice) : null,
          lastSyncAt: new Date(),
        },
      });
    }
  } catch (error) {
    logger.error('[ProductMatcher] Error upserting ProductSource', error, {
      productId,
      integrationId,
      externalProductId,
    });
    throw error;
  }
}

