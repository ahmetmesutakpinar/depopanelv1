/**
 * Order Item Fixer Service
 * 
 * Fixes unlinked OrderItems by matching SKU with existing products.
 * This is a one-time fix for production data where OrderItems have
 * productId = NULL but products exist with matching SKUs.
 */

import { prisma } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface FixUnlinkedOrderItemsResult {
  totalUnlinked: number;
  fixed: number;
  skipped: number;
  ambiguous: number;
  errors: Array<{ orderItemId: string; sku: string; reason: string }>;
}

export class OrderItemFixerService {
  /**
   * Fix unlinked OrderItems by matching SKU with existing products
   * 
   * Rules:
   * - Only updates order_items where productId IS NULL
   * - Only matches with active products (isActive = true)
   * - Skips ambiguous cases (multiple products with same SKU)
   * - Does NOT create new products
   * - Does NOT touch stock or StockLog
   * - Does NOT change orders
   * 
   * @param companyId - Company ID
   * @returns FixUnlinkedOrderItemsResult with statistics
   */
  async fixUnlinkedOrderItemsBySku(companyId: string): Promise<FixUnlinkedOrderItemsResult> {
    logger.info('[OrderItemFixer] Starting fix for unlinked OrderItems', { companyId });

    const result: FixUnlinkedOrderItemsResult = {
      totalUnlinked: 0,
      fixed: 0,
      skipped: 0,
      ambiguous: 0,
      errors: [],
    };

    try {
      // Step 1: Find all OrderItems where productId IS NULL and sku IS NOT NULL
      const unlinkedOrderItems = await prisma.orderItem.findMany({
        where: {
          productId: null,
          sku: { not: null },
          order: {
            companyId,
          },
        },
        select: {
          id: true,
          sku: true,
          orderId: true,
        },
      });

      result.totalUnlinked = unlinkedOrderItems.length;

      if (unlinkedOrderItems.length === 0) {
        logger.info('[OrderItemFixer] No unlinked OrderItems found', { companyId });
        return result;
      }

      logger.info('[OrderItemFixer] Found unlinked OrderItems', {
        companyId,
        count: unlinkedOrderItems.length,
      });

      // Step 2: Group by SKU for batch processing
      const itemsBySku = new Map<string, typeof unlinkedOrderItems>();
      for (const item of unlinkedOrderItems) {
        const sku = item.sku?.trim();
        if (!sku) {
          result.skipped++;
          result.errors.push({
            orderItemId: item.id,
            sku: item.sku || '',
            reason: 'SKU is empty or null',
          });
          continue;
        }

        if (!itemsBySku.has(sku)) {
          itemsBySku.set(sku, []);
        }
        itemsBySku.get(sku)!.push(item);
      }

      logger.info('[OrderItemFixer] Grouped by SKU', {
        uniqueSkus: itemsBySku.size,
        totalItems: unlinkedOrderItems.length,
      });

      // Step 3: Process in transaction
      await prisma.$transaction(async (tx) => {
        for (const [sku, items] of itemsBySku.entries()) {
          try {
            // Find products matching this SKU (case-insensitive, active only)
            const matchingProducts = await tx.product.findMany({
              where: {
                companyId,
                sku: {
                  equals: sku,
                  mode: 'insensitive', // Case-insensitive match
                },
                isActive: true, // CRITICAL: Only active products
              },
              select: {
                id: true,
                sku: true,
              },
            });

            // Safety check: If multiple products share same SKU, SKIP and log warning
            if (matchingProducts.length === 0) {
              // No product found - skip
              result.skipped += items.length;
              for (const item of items) {
                result.errors.push({
                  orderItemId: item.id,
                  sku,
                  reason: 'No active product found with matching SKU',
                });
              }
              logger.debug('[OrderItemFixer] No product found for SKU', {
                sku,
                itemCount: items.length,
              });
              continue;
            }

            if (matchingProducts.length > 1) {
              // Ambiguous case: multiple products with same SKU
              result.ambiguous += items.length;
              result.skipped += items.length;
              for (const item of items) {
                result.errors.push({
                  orderItemId: item.id,
                  sku,
                  reason: `Multiple products found with same SKU (${matchingProducts.length} products) - ambiguous, skipping`,
                });
              }
              logger.warn('[OrderItemFixer] Ambiguous SKU match - multiple products found', {
                sku,
                productCount: matchingProducts.length,
                productIds: matchingProducts.map(p => p.id),
                itemCount: items.length,
              });
              continue;
            }

            // Perfect match: exactly one product found
            const product = matchingProducts[0];
            const productId = product.id;

            // Update all OrderItems with this SKU
            const updateResult = await tx.orderItem.updateMany({
              where: {
                id: { in: items.map(i => i.id) },
                productId: null, // Double-check: only update if still null
              },
              data: {
                productId,
              },
            });

            result.fixed += updateResult.count;

            logger.debug('[OrderItemFixer] Fixed OrderItems', {
              sku,
              productId,
              itemCount: items.length,
              updatedCount: updateResult.count,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('[OrderItemFixer] Error processing SKU', {
              sku,
              error: errorMessage,
            });

            result.skipped += items.length;
            for (const item of items) {
              result.errors.push({
                orderItemId: item.id,
                sku,
                reason: `Processing error: ${errorMessage}`,
              });
            }
          }
        }
      });

      logger.info('[OrderItemFixer] Fix completed', {
        companyId,
        totalUnlinked: result.totalUnlinked,
        fixed: result.fixed,
        skipped: result.skipped,
        ambiguous: result.ambiguous,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      logger.error('[OrderItemFixer] Fix failed', {
        companyId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}

export const orderItemFixerService = new OrderItemFixerService();

