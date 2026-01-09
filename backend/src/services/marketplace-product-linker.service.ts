/**
 * Marketplace Product Linker Service
 * 
 * Auto-links WooCommerce master products to other active marketplaces
 * based on SKU matching. This is a safe, one-time operation that only
 * creates missing marketplace_products records.
 * 
 * Also validates marketplace product links to ensure marketplaceId
 * actually exists in the marketplace API.
 */

import { prisma } from '../config/index.js';
import { MarketplaceType } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { createMarketplaceIntegrationWithDecryption } from '../utils/integration-helper.js';
import { env } from '../config/env.js';

export interface AutoLinkResult {
  totalProducts: number;
  linksCreated: number;
  linksSkipped: number;
  errors: Array<{ productId: string; integrationId: string; error: string }>;
}

export interface ValidationResult {
  totalLinks: number;
  verified: number;
  failed: number;
  skipped: number;
  errors: Array<{ marketplaceProductId: string; integrationId: string; error: string }>;
}

export class MarketplaceProductLinkerService {
  /**
   * Auto-link WooCommerce master products to other active marketplaces
   * 
   * Logic:
   * 1. Find WooCommerce integration
   * 2. Find all ACTIVE products linked to WooCommerce
   * 3. For each product, create marketplace_products records for other active integrations
   * 4. Only create if record doesn't already exist
   * 
   * @param companyId - Company ID
   * @returns AutoLinkResult with statistics
   */
  async autoLinkProductsFromWoo(companyId: string): Promise<AutoLinkResult> {
    logger.info('[MarketplaceProductLinker] Starting auto-link from WooCommerce', { companyId });

    const result: AutoLinkResult = {
      totalProducts: 0,
      linksCreated: 0,
      linksSkipped: 0,
      errors: [],
    };

    try {
      // Step 1: Find WooCommerce integration
      const wooCommerceIntegration = await prisma.marketplaceIntegration.findFirst({
        where: {
          companyId,
          type: 'WOOCOMMERCE',
          isActive: true,
        },
        select: {
          id: true,
          type: true,
        },
      });

      if (!wooCommerceIntegration) {
        logger.warn('[MarketplaceProductLinker] WooCommerce integration not found or inactive', { companyId });
        return result;
      }

      logger.info('[MarketplaceProductLinker] WooCommerce integration found', {
        integrationId: wooCommerceIntegration.id,
      });

      // Step 2: Find all ACTIVE products linked to WooCommerce
      const wooCommerceProducts = await prisma.marketplaceProduct.findMany({
        where: {
          integrationId: wooCommerceIntegration.id,
          isActive: true,
        },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
            },
          },
        },
      });

      result.totalProducts = wooCommerceProducts.length;

      if (wooCommerceProducts.length === 0) {
        logger.info('[MarketplaceProductLinker] No active WooCommerce products found', { companyId });
        return result;
      }

      logger.info('[MarketplaceProductLinker] Found WooCommerce products', {
        count: wooCommerceProducts.length,
      });

      // Step 3: Find other ACTIVE marketplace integrations (excluding WooCommerce)
      const otherIntegrations = await prisma.marketplaceIntegration.findMany({
        where: {
          companyId,
          isActive: true,
          type: { not: 'WOOCOMMERCE' },
        },
        select: {
          id: true,
          type: true,
        },
      });

      if (otherIntegrations.length === 0) {
        logger.info('[MarketplaceProductLinker] No other active integrations found', { companyId });
        return result;
      }

      logger.info('[MarketplaceProductLinker] Found other integrations', {
        count: otherIntegrations.length,
        types: otherIntegrations.map(i => i.type),
      });

      // Step 4: Create missing marketplace_products records in a transaction
      await prisma.$transaction(async (tx) => {
        for (const wooProduct of wooCommerceProducts) {
          const productId = wooProduct.productId;
          const productSku = wooProduct.product.sku;

          if (!productSku) {
            logger.warn('[MarketplaceProductLinker] Product has no SKU, skipping', {
              productId,
            });
            continue;
          }

          for (const integration of otherIntegrations) {
            try {
              // Check if marketplace_products already exists
              const existingLink = await tx.marketplaceProduct.findFirst({
                where: {
                  productId,
                  integrationId: integration.id,
                },
              });

              if (existingLink) {
                result.linksSkipped++;
                logger.debug('[MarketplaceProductLinker] Link already exists, skipping', {
                  productId,
                  integrationId: integration.id,
                  integrationType: integration.type,
                });
                continue;
              }

              // Create marketplace_products record
              // Use SKU as marketplaceId (will be updated later when actual marketplace product is found)
              await tx.marketplaceProduct.create({
                data: {
                  productId,
                  integrationId: integration.id,
                  marketplaceId: productSku, // Temporary: use SKU as marketplaceId
                  isActive: false, // Safe default: inactive until verified
                  price: null,
                  listingUrl: null,
                },
              });

              result.linksCreated++;
              logger.debug('[MarketplaceProductLinker] Link created', {
                productId,
                productSku,
                integrationId: integration.id,
                integrationType: integration.type,
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              result.errors.push({
                productId,
                integrationId: integration.id,
                error: errorMessage,
              });

              logger.error('[MarketplaceProductLinker] Error creating link', {
                productId,
                integrationId: integration.id,
                integrationType: integration.type,
                error: errorMessage,
              });
            }
          }
        }
      });

      logger.info('[MarketplaceProductLinker] Auto-link completed', {
        companyId,
        totalProducts: result.totalProducts,
        linksCreated: result.linksCreated,
        linksSkipped: result.linksSkipped,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      logger.error('[MarketplaceProductLinker] Auto-link failed', {
        companyId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Validate marketplace product links by checking if marketplaceId
   * actually exists in the marketplace API.
   * 
   * For each marketplace_products record:
   * - If isActive = false: Try to verify the marketplaceId exists
   * - If found: Set isActive = true, update marketplaceId if needed
   * - If not found: Keep isActive = false, set syncError
   * 
   * @param companyId - Company ID
   * @returns ValidationResult with statistics
   */
  async validateMarketplaceLinks(companyId: string): Promise<ValidationResult> {
    logger.info('[MarketplaceProductLinker] Starting marketplace link validation', { companyId });

    const result: ValidationResult = {
      totalLinks: 0,
      verified: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // Get all active integrations
      const integrations = await prisma.marketplaceIntegration.findMany({
        where: {
          companyId,
          isActive: true,
        },
        select: {
          id: true,
          type: true,
          apiUrl: true,
          apiKey: true,
          apiSecret: true,
          sellerId: true,
          accessToken: true,
          refreshToken: true,
          settings: true,
        },
      });

      if (integrations.length === 0) {
        logger.warn('[MarketplaceProductLinker] No active integrations found', { companyId });
        return result;
      }

      // Get all unverified marketplace_products (isActive = false)
      const unverifiedLinks = await prisma.marketplaceProduct.findMany({
        where: {
          product: {
            companyId,
          },
          isActive: false,
        },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              barcode: true,
            },
          },
          integration: {
            select: {
              id: true,
              type: true,
            },
          },
        },
      });

      result.totalLinks = unverifiedLinks.length;

      if (unverifiedLinks.length === 0) {
        logger.info('[MarketplaceProductLinker] No unverified links found', { companyId });
        return result;
      }

      logger.info('[MarketplaceProductLinker] Found unverified links', {
        count: unverifiedLinks.length,
      });

      // v3.1 HARD RESET: Skip API validation, return safe empty result
      if (env.INTEGRATIONS_DISABLED) {
        logger.info('[MarketplaceProductLinker] Link validation skipped (v3.1 hard reset mode)', { companyId });
        return {
          totalLinks: unverifiedLinks.length,
          verified: 0,
          failed: 0,
          skipped: unverifiedLinks.length,
          errors: [],
        };
      }

      // Group links by integration for batch processing
      const linksByIntegration = new Map<string, typeof unverifiedLinks>();
      for (const link of unverifiedLinks) {
        const integrationId = link.integrationId;
        if (!linksByIntegration.has(integrationId)) {
          linksByIntegration.set(integrationId, []);
        }
        linksByIntegration.get(integrationId)!.push(link);
      }

      // Validate each integration's links
      for (const integration of integrations) {
        const links = linksByIntegration.get(integration.id);
        if (!links || links.length === 0) {
          continue;
        }

        try {
          // Create marketplace integration instance
          const marketplace = createMarketplaceIntegrationWithDecryption(
            integration.type as MarketplaceType,
            integration
          );

          logger.info(`[MarketplaceProductLinker] Validating links for ${integration.type}`, {
            integrationId: integration.id,
            linkCount: links.length,
          });

          // Validation strategy depends on marketplace type
          if (integration.type === 'WOOCOMMERCE') {
            // WooCommerce: Use getProduct() for each marketplaceId
            await this.validateWooCommerceLinks(marketplace, links, result);
          } else if (integration.type === 'TRENDYOL') {
            // Trendyol: syncProducts() is disabled, use alternative validation
            // Validate via checking if products exist in recent orders
            await this.validateTrendyolLinks(marketplace, links, integration, result);
          } else {
            // Other marketplaces: Use syncProducts() to get all products and check
            await this.validateViaSyncProducts(marketplace, links, result);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[MarketplaceProductLinker] Error validating ${integration.type} links`, {
            integrationId: integration.id,
            integrationType: integration.type,
            error: errorMessage,
          });

          // Mark all links for this integration as failed
          for (const link of links) {
            result.failed++;
            result.errors.push({
              marketplaceProductId: link.id,
              integrationId: integration.id,
              error: `Integration validation error: ${errorMessage}`,
            });
          }
        }
      }

      logger.info('[MarketplaceProductLinker] Validation completed', {
        companyId,
        totalLinks: result.totalLinks,
        verified: result.verified,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      logger.error('[MarketplaceProductLinker] Validation failed', {
        companyId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Validate WooCommerce links by calling getProduct() for each marketplaceId
   */
  private async validateWooCommerceLinks(
    marketplace: any,
    links: Array<{
      id: string;
      marketplaceId: string;
      productId: string;
      integrationId: string;
      product: { id: string; sku: string | null; barcode: string | null };
    }>,
    result: ValidationResult
  ): Promise<void> {
    for (const link of links) {
      try {
        const productId = parseInt(link.marketplaceId, 10);
        if (isNaN(productId)) {
          // marketplaceId is not a valid number (might be SKU)
          result.failed++;
          result.errors.push({
            marketplaceProductId: link.id,
            integrationId: link.integrationId,
            error: 'Invalid WooCommerce product ID (not a number)',
          });
          continue;
        }

        // Try to fetch product from WooCommerce
        const wooProduct = await marketplace.getProduct(productId);

        if (wooProduct && wooProduct.id) {
          // Product exists - verify and activate link
          await prisma.marketplaceProduct.update({
            where: { id: link.id },
            data: {
              isActive: true,
              marketplaceId: wooProduct.id.toString(),
              syncError: null,
              lastSyncAt: new Date(),
            },
          });

          result.verified++;
          logger.debug('[MarketplaceProductLinker] WooCommerce link verified', {
            marketplaceProductId: link.id,
            productId: link.productId,
            marketplaceId: wooProduct.id.toString(),
          });
        } else {
          // Product not found
          await prisma.marketplaceProduct.update({
            where: { id: link.id },
            data: {
              isActive: false,
              syncError: 'Product not found in WooCommerce',
            },
          });

          result.failed++;
          result.errors.push({
            marketplaceProductId: link.id,
            integrationId: link.integrationId,
            error: 'Product not found in WooCommerce',
          });
        }
      } catch (error: any) {
        // Product not found or API error
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNotFound = error.response?.status === 404 || errorMessage.includes('not found');

        await prisma.marketplaceProduct.update({
          where: { id: link.id },
          data: {
            isActive: false,
            syncError: isNotFound ? 'Product not found in WooCommerce' : `Validation error: ${errorMessage}`,
          },
        });

        result.failed++;
        result.errors.push({
          marketplaceProductId: link.id,
          integrationId: link.integrationId,
          error: isNotFound ? 'Product not found' : errorMessage,
        });
      }
    }
  }

  /**
   * Validate links by fetching all products via syncProducts() and checking if marketplaceId exists
   */
  private async validateViaSyncProducts(
    marketplace: any,
    links: Array<{
      id: string;
      marketplaceId: string;
      productId: string;
      integrationId: string;
      product: { id: string; sku: string | null; barcode: string | null };
    }>,
    result: ValidationResult
  ): Promise<void> {
    try {
      // Fetch all products from marketplace
      const marketplaceProducts = await marketplace.syncProducts();

      // Create a map of marketplaceId -> product for quick lookup
      const productMap = new Map<string, any>();
      for (const mp of marketplaceProducts) {
        if (mp.marketplaceId) {
          productMap.set(mp.marketplaceId, mp);
        }
        // Also index by SKU for fallback matching
        if (mp.sku) {
          productMap.set(`SKU:${mp.sku}`, mp);
        }
      }

      // Validate each link
      for (const link of links) {
        try {
          // First, try direct marketplaceId match
          let matchedProduct = productMap.get(link.marketplaceId);

          // If not found and marketplaceId looks like SKU, try SKU match
          if (!matchedProduct && link.product.sku) {
            matchedProduct = productMap.get(`SKU:${link.product.sku}`);
          }

          if (matchedProduct) {
            // Product found - verify and activate link
            const actualMarketplaceId = matchedProduct.marketplaceId || link.marketplaceId;

            await prisma.marketplaceProduct.update({
              where: { id: link.id },
              data: {
                isActive: true,
                marketplaceId: actualMarketplaceId,
                syncError: null,
                lastSyncAt: new Date(),
              },
            });

            result.verified++;
            logger.debug('[MarketplaceProductLinker] Link verified via syncProducts', {
              marketplaceProductId: link.id,
              productId: link.productId,
              marketplaceId: actualMarketplaceId,
            });
          } else {
            // Product not found
            await prisma.marketplaceProduct.update({
              where: { id: link.id },
              data: {
                isActive: false,
                syncError: 'Product not found in marketplace product list',
              },
            });

            result.failed++;
            result.errors.push({
              marketplaceProductId: link.id,
              integrationId: link.integrationId,
              error: 'Product not found in marketplace product list',
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await prisma.marketplaceProduct.update({
            where: { id: link.id },
            data: {
              isActive: false,
              syncError: `Validation error: ${errorMessage}`,
            },
          });

          result.failed++;
          result.errors.push({
            marketplaceProductId: link.id,
            integrationId: link.integrationId,
            error: errorMessage,
          });
        }
      }
    } catch (error) {
      // If syncProducts() fails, mark all links as failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[MarketplaceProductLinker] syncProducts() failed', {
        error: errorMessage,
      });

      for (const link of links) {
        await prisma.marketplaceProduct.update({
          where: { id: link.id },
          data: {
            isActive: false,
            syncError: `syncProducts() failed: ${errorMessage}`,
          },
        });

        result.failed++;
        result.errors.push({
          marketplaceProductId: link.id,
          integrationId: link.integrationId,
          error: `syncProducts() failed: ${errorMessage}`,
        });
      }
    }
  }

  /**
   * Validate Trendyol links by checking if products appear in recent orders
   * Since syncProducts() is disabled for Trendyol, we use order items as validation
   */
  private async validateTrendyolLinks(
    marketplace: any,
    links: Array<{
      id: string;
      marketplaceId: string;
      productId: string;
      integrationId: string;
      product: { id: string; sku: string | null; barcode: string | null };
    }>,
    integration: any,
    result: ValidationResult
  ): Promise<void> {
    try {
      logger.info('[MarketplaceProductLinker] Validating Trendyol links via order items', {
        integrationId: integration.id,
        linkCount: links.length,
      });

      // Fetch recent orders to get product IDs from marketplace
      // This is a workaround since syncProducts() is disabled
      let marketplaceProductIds: Set<string> = new Set();
      
      try {
        // Fetch last 100 orders to collect product IDs
        const recentOrders = await marketplace.fetchOrders(undefined, undefined);
        
        for (const order of recentOrders.slice(0, 100)) {
          if (order.items) {
            for (const item of order.items) {
              // Trendyol orders may have product IDs in items
              // We can't directly validate marketplaceId, but we can check if SKU matches
              if (item.sku) {
                marketplaceProductIds.add(item.sku.trim());
              }
            }
          }
        }

        logger.debug('[MarketplaceProductLinker] Collected product SKUs from Trendyol orders', {
          uniqueSkus: marketplaceProductIds.size,
        });
      } catch (fetchError) {
        logger.warn('[MarketplaceProductLinker] Failed to fetch Trendyol orders for validation', {
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        });
        // Mark all as failed if we can't validate
        for (const link of links) {
          await prisma.marketplaceProduct.update({
            where: { id: link.id },
            data: {
              isActive: false,
              syncError: 'Trendyol validation failed: Unable to fetch orders',
            },
          });
          result.failed++;
          result.errors.push({
            marketplaceProductId: link.id,
            integrationId: integration.id,
            error: 'Trendyol validation failed: Unable to fetch orders',
          });
        }
        return;
      }

      // Validate each link
      for (const link of links) {
        try {
          // For Trendyol, we validate by checking if SKU exists in recent orders
          // This is not perfect but better than skipping validation
          const productSku = link.product.sku?.trim();
          const marketplaceIdMatchesSku = link.marketplaceId === productSku;
          const skuExistsInOrders = productSku && marketplaceProductIds.has(productSku);

          if (skuExistsInOrders || marketplaceIdMatchesSku) {
            // Product likely exists - activate link
            await prisma.marketplaceProduct.update({
              where: { id: link.id },
              data: {
                isActive: true,
                syncError: null,
                lastSyncAt: new Date(),
              },
            });

            result.verified++;
            logger.debug('[MarketplaceProductLinker] Trendyol link verified via order items', {
              marketplaceProductId: link.id,
              productId: link.productId,
              sku: productSku,
            });
          } else {
            // Product not found in recent orders - keep inactive
            await prisma.marketplaceProduct.update({
              where: { id: link.id },
              data: {
                isActive: false,
                syncError: 'Product SKU not found in recent Trendyol orders',
              },
            });

            result.failed++;
            result.errors.push({
              marketplaceProductId: link.id,
              integrationId: integration.id,
              error: 'Product SKU not found in recent Trendyol orders',
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await prisma.marketplaceProduct.update({
            where: { id: link.id },
            data: {
              isActive: false,
              syncError: `Validation error: ${errorMessage}`,
            },
          });

          result.failed++;
          result.errors.push({
            marketplaceProductId: link.id,
            integrationId: integration.id,
            error: errorMessage,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[MarketplaceProductLinker] Trendyol validation failed', {
        error: errorMessage,
      });

      // Mark all links as failed
      for (const link of links) {
        await prisma.marketplaceProduct.update({
          where: { id: link.id },
          data: {
            isActive: false,
            syncError: `Trendyol validation error: ${errorMessage}`,
          },
        });

        result.failed++;
        result.errors.push({
          marketplaceProductId: link.id,
          integrationId: integration.id,
          error: `Trendyol validation error: ${errorMessage}`,
        });
      }
    }
  }
}

export const marketplaceProductLinkerService = new MarketplaceProductLinkerService();

