import { prisma } from '../config/index.js';
import { productRepository } from '../repositories/product.repository.js';
import { integrationService } from './integration.service.js';
import { metricsService } from './metrics.service.js';
import { logger } from '../utils/logger.js';
import { MarketplaceType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toNumber } from '../utils/decimal.js';

export type BulkOperationType = 'PRICE_INCREASE' | 'PRICE_DECREASE' | 'STOCK_UPDATE' | 'BOTH';
export type BulkValueType = 'PERCENTAGE' | 'FIXED';

export interface BulkOperationRequest {
  productIds?: string[];
  operationType: BulkOperationType;
  value: number;
  valueType: BulkValueType;
  marketplaces?: MarketplaceType[];
}

export interface BulkOperationResult {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  error?: string;
}

class BulkOperationsService {
  async createBulkOperation(
    companyId: string,
    request: BulkOperationRequest
  ): Promise<string> {
    const bulkOperation = await prisma.bulkOperation.create({
      data: {
        companyId,
        operationType: request.operationType,
        value: new Decimal(request.value),
        valueType: request.valueType,
        status: 'PENDING',
        totalItems: request.productIds?.length ?? 0,
        processedItems: 0,
        failedItems: 0,
        marketplaces: request.marketplaces
          ? (request.marketplaces as Prisma.InputJsonValue)
          : undefined,
      },
    });

    logger.info(`[BulkOperations] Created bulk operation ${bulkOperation.id}`);

    this.processBulkOperation(bulkOperation.id).catch(err => {
      logger.error('[BulkOperations] Background process failed', err);
    });

    return bulkOperation.id;
  }

  async processBulkOperation(bulkOperationId: string): Promise<void> {
    const bulkOperation = await prisma.bulkOperation.findUnique({
      where: { id: bulkOperationId },
    });

    if (!bulkOperation) {
      throw new Error(`Bulk operation not found: ${bulkOperationId}`);
    }

    if (bulkOperation.status !== 'PENDING') return;

    await prisma.bulkOperation.update({
      where: { id: bulkOperationId },
      data: { status: 'PROCESSING' },
    });

    const startTime = Date.now();
    let processedItems = 0;
    let failedItems = 0;

    try {
      const products = await prisma.product.findMany({
        where: {
          companyId: bulkOperation.companyId,
          isActive: true,
        },
        select: {
          id: true,
          price: true,
        },
      });

      for (const product of products) {
        try {
          await this.processProduct(
            product.id,
            bulkOperation.companyId,
            bulkOperation.operationType as BulkOperationType,
            Number(bulkOperation.value),
            bulkOperation.valueType as BulkValueType,
            bulkOperation.marketplaces as MarketplaceType[] | null
          );

          processedItems++;
        } catch (err) {
          failedItems++;
          logger.error(`[BulkOperations] Product failed`, err);
        }

        if ((processedItems + failedItems) % 10 === 0) {
          await prisma.bulkOperation.update({
            where: { id: bulkOperationId },
            data: { processedItems, failedItems },
          });
        }
      }

      await prisma.bulkOperation.update({
        where: { id: bulkOperationId },
        data: {
          status: 'COMPLETED',
          processedItems,
          failedItems,
          completedAt: new Date(),
        },
      });

      metricsService.recordJobExecution(
        `bulk_operation:${bulkOperation.operationType}`,
        true,
        Date.now() - startTime
      );
    } catch (err: any) {
      await prisma.bulkOperation.update({
        where: { id: bulkOperationId },
        data: {
          status: 'FAILED',
          processedItems,
          failedItems,
          error: err?.message ?? 'Unknown error',
          completedAt: new Date(),
        },
      });

      metricsService.recordJobExecution(
        `bulk_operation:${bulkOperation.operationType}`,
        false,
        Date.now() - startTime,
        err?.name
      );

      logger.error('[BulkOperations] Failed', err);
    }
  }

  private async processProduct(
    productId: string,
    companyId: string,
    operationType: BulkOperationType,
    value: number,
    valueType: BulkValueType,
    marketplaces: MarketplaceType[] | null
  ): Promise<void> {
    const product = await productRepository.findByIdAndCompany(productId, companyId);

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    const updateData: {
      price?: Decimal;
      stock?: number;
    } = {};

    if (operationType === 'PRICE_INCREASE' || operationType === 'PRICE_DECREASE' || operationType === 'BOTH') {
      const currentPrice = toNumber(product.price);
      let newPrice = currentPrice;

      if (valueType === 'PERCENTAGE') {
        newPrice =
          operationType === 'PRICE_INCREASE'
            ? currentPrice * (1 + value / 100)
            : currentPrice * (1 - value / 100);
      } else {
        newPrice =
          operationType === 'PRICE_INCREASE'
            ? currentPrice + value
            : Math.max(0, currentPrice - value);
      }

      updateData.price = new Decimal(newPrice.toFixed(2));
    }

    if (Object.keys(updateData).length > 0) {
      // Convert Decimal to number for update
      const updatePayload: { price?: number; stock?: number } = {};
      if (updateData.price !== undefined) {
        updatePayload.price = typeof updateData.price === 'number' 
          ? updateData.price 
          : updateData.price.toNumber();
      }
      if (updateData.stock !== undefined) {
        updatePayload.stock = updateData.stock;
      }
      await productRepository.update(productId, updatePayload);
    }

    if (marketplaces?.length) {
      await this.syncToMarketplaces(productId, companyId, updateData, marketplaces);
    }
  }

  private async syncToMarketplaces(
    productId: string,
    companyId: string,
    updateData: { price?: Decimal; stock?: number },
    marketplaces: MarketplaceType[]
  ): Promise<void> {
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: {
        companyId,
        type: { in: marketplaces },
        status: 'ACTIVE',
        isActive: true,
      },
    });

    if (integrations.length === 0) {
      logger.warn(`[BulkOperations] No active integrations found for marketplaces: ${marketplaces.join(', ')}`);
      return;
    }

    // Get product information
    const product = await productRepository.findById(productId);
    if (!product) {
      logger.error(`[BulkOperations] Product not found: ${productId}`);
      return;
    }

    // Get MarketplaceProduct links to find marketplace product IDs
    const marketplaceProducts = await prisma.marketplaceProduct.findMany({
      where: {
        productId: productId,
        integrationId: { in: integrations.map(i => i.id) },
        isActive: true,
      },
    });

    // Group marketplace products by integration
    const productsByIntegration = new Map<string, any[]>();
    for (const mp of marketplaceProducts) {
      if (!productsByIntegration.has(mp.integrationId)) {
        productsByIntegration.set(mp.integrationId, []);
      }
      productsByIntegration.get(mp.integrationId)!.push(mp);
    }

    for (const integration of integrations) {
      try {
        // Create marketplace integration instance
        const { createMarketplaceIntegrationWithDecryption } = await import('../utils/integration-helper.js');
        const marketplace = createMarketplaceIntegrationWithDecryption(
          integration.type as MarketplaceType,
          integration
        );

        const marketplaceProductsForIntegration = productsByIntegration.get(integration.id) || [];

        // Prepare price updates
        if (updateData.price !== undefined) {
          if (marketplaceProductsForIntegration.length > 0) {
            const priceUpdates = marketplaceProductsForIntegration.map(mp => ({
              sku: product.sku,
              price: updateData.price!.toNumber(),
              marketplaceProductId: mp.marketplaceId,
            }));

            try {
              const result = await marketplace.updatePrice(priceUpdates);
              logger.info(
                `[BulkOperations] Price updated for ${integration.type}: ${product.sku} -> ${updateData.price.toNumber()} (${result.success} success, ${result.failed} failed)`
              );
            } catch (priceError: any) {
              logger.error(`[BulkOperations] Price update failed for ${integration.type}`, {
                error: priceError?.message || String(priceError),
                productId,
                sku: product.sku,
              });
            }
          } else {
            logger.warn(
              `[BulkOperations] No marketplace product link found for ${integration.type}: ${product.sku}. Price update skipped.`
            );
          }
        }

        // Prepare stock updates
        if (updateData.stock !== undefined) {
          if (marketplaceProductsForIntegration.length > 0) {
            const stockUpdates = marketplaceProductsForIntegration.map(mp => ({
              sku: product.sku,
              quantity: updateData.stock!,
              marketplaceProductId: mp.marketplaceId,
            }));

            try {
              const result = await marketplace.updateStock(stockUpdates);
              logger.info(
                `[BulkOperations] Stock updated for ${integration.type}: ${product.sku} -> ${updateData.stock} (${result.success} success, ${result.failed} failed)`
              );
            } catch (stockError: any) {
              logger.error(`[BulkOperations] Stock update failed for ${integration.type}`, {
                error: stockError?.message || String(stockError),
                productId,
                sku: product.sku,
              });
            }
          } else {
            logger.warn(
              `[BulkOperations] No marketplace product link found for ${integration.type}: ${product.sku}. Stock update skipped.`
            );
          }
        }
      } catch (err: any) {
        logger.error(`[BulkOperations] Marketplace sync failed for ${integration.type}`, {
          error: err?.message || String(err),
          productId,
          integrationId: integration.id,
        });
      }
    }
  }

  async getBulkOperationStatus(
    bulkOperationId: string,
    companyId: string
  ): Promise<BulkOperationResult | null> {
    const bulkOperation = await prisma.bulkOperation.findFirst({
      where: { id: bulkOperationId, companyId },
    });

    if (!bulkOperation) return null;

    return {
      id: bulkOperation.id,
      status: bulkOperation.status as BulkOperationResult['status'],
      totalItems: bulkOperation.totalItems,
      processedItems: bulkOperation.processedItems,
      failedItems: bulkOperation.failedItems,
      error: bulkOperation.error || undefined,
    };
  }

  async getBulkOperations(companyId: string, options?: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.BulkOperationWhereInput = {
      companyId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [bulkOperations, total] = await Promise.all([
      prisma.bulkOperation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bulkOperation.count({ where }),
    ]);

    return {
      data: bulkOperations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const bulkOperationsService = new BulkOperationsService();
