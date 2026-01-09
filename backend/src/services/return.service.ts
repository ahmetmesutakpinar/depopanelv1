import { prisma } from '../config/index.js';
import { NotFoundError, AppError } from '../middleware/error.middleware.js';
import { generateOrderNumber } from '../utils/helpers.js';
import { returnRepository, CreateReturnData, CreateReturnItemData } from '../repositories/return.repository.js';
import { stockRepository } from '../repositories/stock.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { locationRepository } from '../repositories/location.repository.js';
import { StockLogType } from '@prisma/client';
import { logger } from '../utils/logger.js';

class ReturnService {
  async getReturns(companyId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    orderId?: string;
  }) {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    const { returns, total } = await returnRepository.findByCompany(companyId, {
      skip,
      take,
      search: options?.search,
      status: options?.status,
      orderId: options?.orderId,
    });

    return {
      returns,
      pagination: {
        page: options?.page || 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async getReturnById(id: string, companyId: string) {
    const returnRecord = await returnRepository.findById(id, companyId);

    if (!returnRecord) {
      throw new NotFoundError('İade bulunamadı');
    }

    return returnRecord;
  }

  async createReturn(companyId: string, data: {
    orderId: string;
    reason: string;
    note?: string;
    items: Array<{
      orderItemId: string;
      quantity: number;
      reason?: string;
    }>;
  }, userId?: string) {
    // Verify order belongs to company
    const order = await orderRepository.findByIdAndCompany(data.orderId, companyId);
    if (!order) {
      throw new NotFoundError('Sipariş bulunamadı');
    }

    // Generate return number
    const returnNumber = `RTN-${generateOrderNumber()}`;

    // Create return
    const createData: CreateReturnData = {
      returnNumber,
      orderId: data.orderId,
      reason: data.reason,
      note: data.note,
      status: 'PENDING',
    };

    const itemsData: CreateReturnItemData[] = data.items.map(item => ({
      orderItemId: item.orderItemId,
      quantity: item.quantity,
      reason: item.reason,
    }));

    const returnRecord = await returnRepository.create(createData, itemsData);

    return returnRecord;
  }

  async approveReturn(id: string, companyId: string, data: {
    warehouseId: string;
    locationId?: string;
  }, userId?: string) {
    const returnRecord = await this.getReturnById(id, companyId);

    if (returnRecord.status !== 'PENDING') {
      throw new AppError('Sadece bekleyen iadeler onaylanabilir', 400);
    }

    // Verify warehouse
    const warehouse = await warehouseRepository.findByIdAndCompany(data.warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Verify location if provided
    if (data.locationId) {
      const location = await locationRepository.findById(data.locationId);
      if (!location || location.warehouseId !== data.warehouseId) {
        throw new NotFoundError('Lokasyon bulunamadı veya depoya ait değil');
      }
    }

    // Approve return and add stock
    await prisma.$transaction(async (tx) => {
      // Update return status
      await tx.return.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      // Add stock for each return item
      for (const returnItem of returnRecord.items) {
        const orderItem = returnItem.orderItem;
        
        // Skip if no productId
        if (!orderItem.productId) {
          continue;
        }

        // Get product to check if it's a Campaign SET
        const product = await tx.product.findUnique({
          where: { id: orderItem.productId },
          include: {
            campaignSet: {
              include: {
                items: {
                  include: {
                    product: {
                      select: { id: true, sku: true, name: true },
                    },
                    variant: {
                      select: { id: true, sku: true, name: true },
                    },
                  },
                },
              },
            },
          },
        });

        if (!product) {
          continue;
        }

        // Check if product is a Campaign SET (using FK relation)
        if (product.campaignSetId && product.campaignSet) {
          // Campaign SET return - assume intact (kapalı kutu) for approved returns
          // Increase CampaignStock
          let campaignStock = await tx.campaignStock.findUnique({
            where: {
              campaignSetId_warehouseId_locationId: {
                campaignSetId: product.campaignSetId,
                warehouseId: data.warehouseId,
                locationId: data.locationId || '',
              },
            },
          });

          if (!campaignStock) {
            campaignStock = await tx.campaignStock.create({
              data: {
                campaignSetId: product.campaignSetId,
                warehouseId: data.warehouseId,
                locationId: data.locationId || null,
                quantity: 0,
                reservedQty: 0,
              },
            });
          }

          const previousQty = campaignStock.quantity;
          const newQty = previousQty + returnItem.quantity;

          await tx.campaignStock.update({
            where: { id: campaignStock.id },
            data: { quantity: newQty },
          });

          await tx.stockLog.create({
            data: {
              type: 'RETURN_SET_READY',
              quantity: returnItem.quantity,
              previousQty,
              newQty,
              productId: orderItem.productId,
              warehouseId: data.warehouseId,
              userId,
              setSku: product.sku,
              note: `İade (Campaign SET): ${returnRecord.returnNumber}`,
              reference: returnRecord.id,
            },
          });
        } else {
          // Normal product return - use StockLog only (LEDGER ARCHITECTURE)
          // Check idempotency: prevent duplicate return logs
          const existingReturnLog = await tx.stockLog.findFirst({
            where: {
              reference: returnRecord.id,
              productId: orderItem.productId,
              type: 'IN_RETURN' as any, // TODO: Use StockLogType.IN_RETURN after Prisma generate
            },
          });

          if (!existingReturnLog) {
            // Create stock log entry (positive quantity for IN_RETURN)
            // Note: previousQty and newQty are optional in Stock Ledger architecture
            await tx.stockLog.create({
              data: {
                type: 'IN_RETURN' as any, // TODO: Use StockLogType.IN_RETURN after Prisma generate
                quantity: returnItem.quantity, // Positive for IN movement
                previousQty: 0, // Not used in ledger architecture, but required by schema
                newQty: 0, // Not used in ledger architecture, but required by schema
                reference: returnRecord.id,
                productId: orderItem.productId,
                variantId: orderItem.variantId || null,
                warehouseId: data.warehouseId,
                note: `Order return: ${returnRecord.returnNumber}`,
                userId,
              },
            });

            logger.info('[ReturnService] Stock movement created for order return', {
              returnId: returnRecord.id,
              returnNumber: returnRecord.returnNumber,
              productId: orderItem.productId,
              quantity: returnItem.quantity,
              type: 'IN_RETURN',
            });
          } else {
            logger.warn('[ReturnService] Duplicate return log detected, skipping', {
              returnId: returnRecord.id,
              productId: orderItem.productId,
            });
          }
        }
      }
    });

    return this.getReturnById(id, companyId);
  }

  async rejectReturn(id: string, companyId: string, reason?: string) {
    const returnRecord = await this.getReturnById(id, companyId);

    if (returnRecord.status !== 'PENDING') {
      throw new AppError('Sadece bekleyen iadeler reddedilebilir', 400);
    }

    return returnRepository.update(id, {
      status: 'REJECTED',
      note: reason ? `${returnRecord.note || ''}\nRed nedeni: ${reason}`.trim() : returnRecord.note || undefined,
    });
  }

  async completeReturn(id: string, companyId: string) {
    const returnRecord = await this.getReturnById(id, companyId);

    if (returnRecord.status !== 'APPROVED') {
      throw new AppError('Sadece onaylanmış iadeler tamamlanabilir', 400);
    }

    return returnRepository.update(id, {
      status: 'COMPLETED',
    });
  }
}

export const returnService = new ReturnService();

