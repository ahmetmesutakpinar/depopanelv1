/**
 * Product Matcher Service
 * 
 * Central service for matching or creating products based on SKU and/or barcode.
 * 
 * This service ensures products are discovered ONLY via orders, never via direct
 * marketplace product API calls (to avoid Cloudflare blocking).
 * 
 * Matching Priority:
 * 1. barcode (exact match)
 * 2. sku (case-insensitive)
 * 3. fallback → create new product
 * 
 * Rules:
 * - barcode preferred over sku
 * - trim & normalize strings
 * - ignore empty values
 * - SKU comparison must be case-insensitive
 * - barcode must be exact match
 */

import { prisma } from '../config/index.js';
import { productRepository } from '../repositories/product.repository.js';
import { marketplaceProductRepository } from '../repositories/marketplace-product.repository.js';
import { logger } from '../utils/logger.js';
import { Product, MarketplaceType } from '@prisma/client';
import { createMarketplaceIntegrationWithDecryption } from '../utils/integration-helper.js';
import { env } from '../config/env.js';

export interface MatchOrCreateProductInput {
  companyId: string;
  sku?: string;
  barcode?: string;
  name?: string;
  marketplaceProductId?: string;
  integrationId?: string;
  marketplaceSku?: string;
  marketplaceBarcode?: string;
  price?: number | null;
  listingUrl?: string | null;
}

export type MatchMethod = 'BARCODE' | 'SKU' | 'CREATED';

export interface MatchOrCreateProductResult {
  product: Product;
  matchedBy: MatchMethod;
  marketplaceLink: {
    id: string;
    marketplaceProductId: string;
    integrationId: string;
  } | null;
}

/**
 * Auto-fetch listingUrl from marketplace API if not provided
 */
async function fetchListingUrlFromMarketplace(
  integrationId: string,
  marketplaceProductId: string
): Promise<string | null> {
  // v3.1 HARD RESET: Skip API calls, return null
  if (env.INTEGRATIONS_DISABLED) {
    logger.debug('[ProductMatcher] ListingUrl fetch skipped (v3.1 hard reset mode)', {
      integrationId,
      marketplaceProductId,
    });
    return null;
  }

  try {
    const integration = await prisma.marketplaceIntegration.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      logger.debug('[ProductMatcher] Integration not found for listingUrl fetch', { integrationId });
      return null;
    }

    const marketplaceIntegration = createMarketplaceIntegrationWithDecryption(
      integration.type as MarketplaceType,
      integration
    );

    if (integration.type === 'WOOCOMMERCE') {
      const productId = parseInt(marketplaceProductId, 10);
      if (!isNaN(productId)) {
        const wcProduct = await (marketplaceIntegration as any).getProduct(productId);
        const listingUrl = wcProduct?.permalink || wcProduct?.link || null;
        if (listingUrl) {
          logger.debug('[ProductMatcher] ListingUrl auto-fetched from WooCommerce API', {
            marketplaceProductId,
            listingUrl,
          });
        }
        return listingUrl;
      }
    }
    // TODO: Add other marketplaces (Trendyol, Hepsiburada, etc.)

    return null;
  } catch (error) {
    // Silently continue if API fetch fails (non-critical)
    logger.debug('[ProductMatcher] Failed to auto-fetch listingUrl (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
      integrationId,
      marketplaceProductId,
    });
    return null;
  }
}

/**
 * Match or create a product based on SKU and/or barcode.
 * 
 * Matching priority:
 * 1. barcode (exact match)
 * 2. sku (case-insensitive)
 * 3. fallback → create new product
 * 
 * Also creates marketplace product link if marketplaceProductId is provided.
 * 
 * @param input - Product identifiers (companyId is required, sku/barcode/name optional)
 * @returns MatchOrCreateProductResult with product, match method, and marketplace link
 */
export async function matchOrCreateProduct(
  input: MatchOrCreateProductInput
): Promise<MatchOrCreateProductResult> {
  const { companyId, sku, barcode, name } = input;

  // Validate required fields
  if (!companyId) {
    throw new Error('companyId is required for matchOrCreateProduct');
  }

  // Normalize inputs (trim and filter empty strings)
  const normalizedSku = sku?.trim() || undefined;
  const normalizedBarcode = barcode?.trim() || undefined;
  const normalizedName = name?.trim() || undefined;

  // If both SKU and barcode are empty, throw error (cannot create product without identifier)
  if (!normalizedSku && !normalizedBarcode) {
    throw new Error('Either sku or barcode must be provided for matchOrCreateProduct');
  }

  // STEP 1: Try matching by barcode (exact match - highest priority)
  if (normalizedBarcode) {
    try {
      const product = await productRepository.findByBarcode(companyId, normalizedBarcode);
      if (product) {
        logger.debug('[ProductMatcher] Product matched via barcode', {
          barcode: normalizedBarcode,
          productId: product.id,
          productSku: product.sku,
        });

        // Create marketplace link if marketplaceProductId is provided
        let marketplaceLink = null;
        if (input.marketplaceProductId && input.integrationId) {
          try {
            // Auto-fetch listingUrl if not provided
            let listingUrl = input.listingUrl || null;
            if (!listingUrl) {
              listingUrl = await fetchListingUrlFromMarketplace(input.integrationId, input.marketplaceProductId);
            }

            const link = await marketplaceProductRepository.upsert({
              productId: product.id,
              integrationId: input.integrationId,
              marketplaceProductId: input.marketplaceProductId,
              price: input.price,
              listingUrl: listingUrl,
            });
            marketplaceLink = {
              id: link.id,
              marketplaceProductId: link.marketplaceProductId,
              integrationId: link.integrationId,
            };
          } catch (linkError) {
            logger.warn('[ProductMatcher] Failed to create marketplace link', {
              error: linkError instanceof Error ? linkError.message : String(linkError),
              productId: product.id,
              marketplaceProductId: input.marketplaceProductId,
            });
          }
        }

        return {
          product: product as Product,
          matchedBy: 'BARCODE',
          marketplaceLink,
        };
      }
    } catch (error) {
      logger.error('[ProductMatcher] Error matching by barcode', {
        error: error instanceof Error ? error.message : String(error),
        barcode: normalizedBarcode,
        companyId,
      });
    }
  }

  // STEP 2: Try matching by SKU (case-insensitive)
  if (normalizedSku) {
    try {
      // Use repository for case-insensitive SKU matching
      const product = await productRepository.findBySkuCaseInsensitive(companyId, normalizedSku);
      
      if (product) {
        logger.debug('[ProductMatcher] Product matched via SKU', {
          sku: normalizedSku,
          productId: product.id,
          productSku: product.sku,
        });

        // Create marketplace link if marketplaceProductId is provided
        let marketplaceLink = null;
        if (input.marketplaceProductId && input.integrationId) {
          try {
            // Auto-fetch listingUrl if not provided
            let listingUrl = input.listingUrl || null;
            if (!listingUrl) {
              listingUrl = await fetchListingUrlFromMarketplace(input.integrationId, input.marketplaceProductId);
            }

            const link = await marketplaceProductRepository.upsert({
              productId: product.id,
              integrationId: input.integrationId,
              marketplaceProductId: input.marketplaceProductId,
              price: input.price,
              listingUrl: listingUrl,
            });
            marketplaceLink = {
              id: link.id,
              marketplaceProductId: link.marketplaceProductId,
              integrationId: link.integrationId,
            };
          } catch (linkError) {
            logger.warn('[ProductMatcher] Failed to create marketplace link', {
              error: linkError instanceof Error ? linkError.message : String(linkError),
              productId: product.id,
              marketplaceProductId: input.marketplaceProductId,
            });
          }
        }

        return {
          product,
          matchedBy: 'SKU',
          marketplaceLink,
        };
      }
    } catch (error) {
      logger.error('[ProductMatcher] Error matching by SKU', {
        error: error instanceof Error ? error.message : String(error),
        sku: normalizedSku,
        companyId,
      });
    }
  }

  // STEP 3: No match found - create new product
  // Generate SKU if not provided (use barcode as fallback, or generate UUID-based)
  const productSku = normalizedSku || normalizedBarcode || `AUTO-${Date.now()}`;
  
  // Generate name if not provided
  const productName = normalizedName || `Product ${productSku}`;

  logger.info('[ProductMatcher] Creating new product (no match found)', {
    sku: productSku,
    barcode: normalizedBarcode || null,
    name: productName,
    companyId,
  });

  try {
    const newProduct = await productRepository.create({
      sku: productSku,
      barcode: normalizedBarcode || undefined,
      name: productName,
      price: 0, // Default price - will be updated from order data if available
      isActive: true,
      companyId,
      taxRate: 20, // Default tax rate
    });

    logger.info('[ProductMatcher] New product created', {
      productId: newProduct.id,
      sku: newProduct.sku,
      barcode: newProduct.barcode,
      name: newProduct.name,
    });

    // Create marketplace link if marketplaceProductId is provided
    let marketplaceLink = null;
    if (input.marketplaceProductId && input.integrationId) {
      try {
        // Auto-fetch listingUrl if not provided
        let listingUrl = input.listingUrl || null;
        if (!listingUrl) {
          listingUrl = await fetchListingUrlFromMarketplace(input.integrationId, input.marketplaceProductId);
        }

        const link = await marketplaceProductRepository.upsert({
          productId: newProduct.id,
          integrationId: input.integrationId,
          marketplaceProductId: input.marketplaceProductId,
          price: input.price,
          listingUrl: listingUrl,
        });
        marketplaceLink = {
          id: link.id,
          marketplaceProductId: link.marketplaceProductId,
          integrationId: link.integrationId,
        };
      } catch (linkError) {
        logger.warn('[ProductMatcher] Failed to create marketplace link for new product', {
          error: linkError instanceof Error ? linkError.message : String(linkError),
          productId: newProduct.id,
          marketplaceProductId: input.marketplaceProductId,
        });
      }
    }

    return {
      product: newProduct,
      matchedBy: 'CREATED',
      marketplaceLink,
    };
  } catch (error) {
    logger.error('[ProductMatcher] Error creating new product', {
      error: error instanceof Error ? error.message : String(error),
      sku: productSku,
      barcode: normalizedBarcode,
      name: productName,
      companyId,
    });
    throw error;
  }
}

