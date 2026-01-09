/**
 * Unresolved Product Service
 * 
 * Handles resolution of products that could not be automatically identified
 * during order import. Provides admin interface to manually link or create products.
 */

import { prisma } from '../config/index.js';
import { OrderStatus, StockLogType } from '@prisma/client';
import { productResolverService } from './product-resolver.service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import { stockRepository } from '../repositories/stock.repository.js';

export interface UnresolvedProductItem {
  orderId: string;
  orderNumber: string;
  marketplace: string;
  customerName: string;
  orderItemId: string;
  incomingProductName: string;
  incomingSku: string;
  incomingBarcode: string | null;
  createdAt: Date;
  orderStatus: OrderStatus;
  warehouseId: string | null;
  quantity: number;
}

export interface LinkExistingProductInput {
  orderItemId: string;
  productId: string;
  userId: string;
}

export interface CreateAndLinkProductInput {
  orderItemId: string;
  companyId: string;
  sku: string;
  barcode?: string | null;
  name: string;
  price?: number;
  costPrice?: number;
  taxRate?: number;
  categoryId?: string;
  userId: string;
}

class UnresolvedProductService {
  /**
   * Get all unresolved products (OrderItems with productId = NULL)
   */
  async getUnresolvedProducts(companyId: string): Promise<UnresolvedProductItem[]> {
    const unresolvedItems = await prisma.orderItem.findMany({
      where: {
        productId: null,
        order: {
          companyId,
          status: {
            in: ['PENDING_RESOLUTION', 'PENDING'], // Support both statuses
          },
        },
      },
      include: {
        order: {
          include: {
            integration: {
              select: {
                type: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return unresolvedItems.map(item => ({
      orderId: item.orderId,
      orderNumber: item.order.orderNumber,
      marketplace: item.order.integration?.type || 'UNKNOWN',
      customerName: item.order.customerName,
      orderItemId: item.id,
      incomingProductName: item.name,
      incomingSku: item.sku,
      incomingBarcode: item.barcode,
      createdAt: item.createdAt,
      orderStatus: item.order.status,
      warehouseId: item.order.warehouseId,
      quantity: item.quantity,
    }));
  }

  /**
   * Link unresolved OrderItem to existing product
   */
  async linkExistingProduct(
    companyId: string,
    input: LinkExistingProductInput
  ): Promise<{
    success: boolean;
    orderItemId: string;
    productId: string;
    stockMovementCreated: boolean;
    orderStatusUpdated: boolean;
  }> {
    const { orderItemId, productId, userId } = input;

    return await prisma.$transaction(async (tx) => {
      // 1. Verify order item exists and is unresolved
      const orderItem = await tx.orderItem.findUnique({
        where: { id: orderItemId },
        include: {
          order: {
            include: {
              items: true,
            },
          },
        },
      });

      if (!orderItem) {
        throw new AppError('Order item bulunamadı', 404, 'ORDER_ITEM_NOT_FOUND');
      }

      if (orderItem.productId !== null) {
        throw new AppError('Bu order item zaten bir ürüne bağlı', 400, 'ALREADY_LINKED');
      }

      if (orderItem.order.companyId !== companyId) {
        throw new AppError('Bu sipariş bu şirkete ait değil', 403, 'FORBIDDEN');
      }

      // 2. Verify product exists and belongs to company
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new AppError('Ürün bulunamadı', 404, 'PRODUCT_NOT_FOUND');
      }

      if (product.companyId !== companyId) {
        throw new AppError('Bu ürün bu şirkete ait değil', 403, 'FORBIDDEN');
      }

      // 3. Update OrderItem.productId
      await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          productId: productId,
          // Clear unresolved flags (they're stored in sku, barcode, name fields)
        },
      });

      logger.info('[UnresolvedProductService] OrderItem linked to existing product', {
        orderItemId,
        productId,
        orderId: orderItem.orderId,
        userId,
      });

      // 4. Create stock movement for this item (if order was already processed)
      let stockMovementCreated = false;
      const order = orderItem.order;
      
      if (order.warehouseId && order.status !== 'CANCELLED') {
        // Check if stock movement already exists for this order+product
        const existingMovement = await tx.stockLog.findFirst({
          where: {
            reference: order.id,
            productId: productId,
            type: StockLogType.OUT,
          },
        });

        if (!existingMovement) {
          // Create stock movement (OUT_ORDER)
          await tx.stockLog.create({
            data: {
              type: StockLogType.OUT,
              quantity: -orderItem.quantity, // Negative for OUT
              reference: order.id,
              productId: productId,
              warehouseId: order.warehouseId,
              note: `Order: ${order.orderNumber} - Resolved product`,
              userId,
            },
          });

          stockMovementCreated = true;
          logger.info('[UnresolvedProductService] Stock movement created for resolved product', {
            orderItemId,
            productId,
            orderId: order.id,
            quantity: orderItem.quantity,
          });
        }
      }

      // 5. Check if all items are now resolved, update order status if needed
      const allItems = await tx.orderItem.findMany({
        where: { orderId: order.id },
      });

      const hasUnresolvedItems = allItems.some(item => item.productId === null);
      let orderStatusUpdated = false;

      if (!hasUnresolvedItems && order.status === 'PENDING_RESOLUTION') {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'READY_TO_PICK', // All items resolved, ready for picking
          },
        });

        orderStatusUpdated = true;
        logger.info('[UnresolvedProductService] Order status updated to READY_TO_PICK', {
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
      }

      return {
        success: true,
        orderItemId,
        productId,
        stockMovementCreated,
        orderStatusUpdated,
      };
    });
  }

  /**
   * Create new product and link unresolved OrderItems with same SKU/barcode
   */
  async createAndLinkProduct(
    companyId: string,
    input: CreateAndLinkProductInput
  ): Promise<{
    success: boolean;
    productId: string;
    linkedOrderItems: string[];
    ordersUpdated: string[];
  }> {
    const { orderItemId, sku, barcode, name, price, costPrice, taxRate, categoryId, userId } = input;

    return await prisma.$transaction(async (tx) => {
      // 1. Verify order item exists and is unresolved
      const sourceOrderItem = await tx.orderItem.findUnique({
        where: { id: orderItemId },
        include: {
          order: true,
        },
      });

      if (!sourceOrderItem) {
        throw new AppError('Order item bulunamadı', 404, 'ORDER_ITEM_NOT_FOUND');
      }

      if (sourceOrderItem.productId !== null) {
        throw new AppError('Bu order item zaten bir ürüne bağlı', 400, 'ALREADY_LINKED');
      }

      if (sourceOrderItem.order.companyId !== companyId) {
        throw new AppError('Bu sipariş bu şirkete ait değil', 403, 'FORBIDDEN');
      }

      // 2. Create product using ProductResolverService (with allowCreate = true)
      const resolverResult = await productResolverService.resolve({
        companyId,
        sku,
        barcode: barcode || null,
        name,
        source: 'MANUAL',
        allowCreate: true,
        metadata: {
          price: price,
          costPrice: costPrice,
          taxRate: taxRate || 20,
          categoryId: categoryId,
          createdBy: userId,
        },
      });

      if (resolverResult.status !== 'RESOLVED' || !resolverResult.product) {
        throw new AppError(
          `Ürün oluşturulamadı: ${resolverResult.status}`,
          500,
          'PRODUCT_CREATION_FAILED',
          { resolverResult }
        );
      }

      const productId = resolverResult.product.id;

      logger.info('[UnresolvedProductService] Product created via resolver', {
        productId,
        sku,
        barcode,
        orderItemId,
        userId,
      });

      // 3. Find all unresolved OrderItems with same SKU or barcode
      const matchingItems = await tx.orderItem.findMany({
        where: {
          productId: null,
          order: {
            companyId,
          },
          OR: [
            { sku: sku },
            ...(barcode ? [{ barcode: barcode }] : []),
          ],
        },
        include: {
          order: true,
        },
      });

      // 4. Link all matching items to the new product
      const linkedOrderItemIds: string[] = [];
      const updatedOrderIds = new Set<string>();

      for (const item of matchingItems) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            productId: productId,
          },
        });

        linkedOrderItemIds.push(item.id);
        updatedOrderIds.add(item.orderId);

        // Create stock movement for each linked item (if order was processed)
        if (item.order.warehouseId && item.order.status !== 'CANCELLED') {
          const existingMovement = await tx.stockLog.findFirst({
            where: {
              reference: item.orderId,
              productId: productId,
              type: StockLogType.OUT,
            },
          });

          if (!existingMovement) {
            await tx.stockLog.create({
              data: {
                type: StockLogType.OUT,
                quantity: -item.quantity,
                reference: item.orderId,
                productId: productId,
                warehouseId: item.order.warehouseId,
                note: `Order: ${item.order.orderNumber} - Auto-linked after product creation`,
                userId,
              },
            });
          }
        }
      }

      // 5. Update order statuses for all affected orders
      const ordersToUpdate = await tx.order.findMany({
        where: {
          id: { in: Array.from(updatedOrderIds) },
          status: 'PENDING_RESOLUTION',
        },
        include: {
          items: true,
        },
      });

      const ordersUpdated: string[] = [];

      for (const order of ordersToUpdate) {
        const hasUnresolvedItems = order.items.some(item => item.productId === null);

        if (!hasUnresolvedItems) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'READY_TO_PICK',
            },
          });

          ordersUpdated.push(order.id);
          logger.info('[UnresolvedProductService] Order status updated after auto-link', {
            orderId: order.id,
            orderNumber: order.orderNumber,
          });
        }
      }

      return {
        success: true,
        productId,
        linkedOrderItems: linkedOrderItemIds,
        ordersUpdated: Array.from(updatedOrderIds),
      };
    });
  }
}

export const unresolvedProductService = new UnresolvedProductService();

