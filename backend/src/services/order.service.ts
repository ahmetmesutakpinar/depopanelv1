import { prisma } from '../config/index.js';
import { orderRepository, CreateOrderData } from '../repositories/order.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { stockRepository } from '../repositories/stock.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { NotFoundError, AppError } from '../middleware/error.middleware.js';
import { generateOrderNumber } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { OrderStatus, StockLogType } from '@prisma/client';
import { toNumber } from '../utils/decimal.js';

interface CreateOrderInput {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCity?: string;
  shippingDistrict?: string;
  shippingPostalCode?: string;
  billingAddress?: string;
  warehouseId?: string;
  customerNote?: string;
  items: {
    productId: string;
    variantId?: string;
    quantity: number;
  }[];
}

class OrderService {
  async getOrders(companyId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: OrderStatus;
    integrationId?: string;
    warehouseId?: string;
    pickingWaveId?: string;
    startDate?: Date;
    endDate?: Date;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    // For reports: If limit is very high (> 5000), fetch all orders without pagination
    // This ensures historical orders are included in reports
    const isHighLimit = options?.limit && options.limit > 5000;
    
    const skip = isHighLimit ? 0 : ((options?.page || 1) - 1) * (options?.limit || 20);
    // If high limit, don't use take (fetch all) - repository will handle undefined
    const take = isHighLimit ? undefined : (options?.limit || 20);

    const { orders, total } = await orderRepository.findByCompany(companyId, {
      skip: isHighLimit ? undefined : skip,
      take,
      search: options?.search,
      status: options?.status,
      integrationId: options?.integrationId,
      warehouseId: options?.warehouseId,
      pickingWaveId: options?.pickingWaveId,
      startDate: options?.startDate,
      endDate: options?.endDate,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder,
    });

    return {
      orders,
      pagination: {
        page: isHighLimit ? 1 : (options?.page || 1),
        limit: take || total,
        total,
        totalPages: isHighLimit ? 1 : Math.ceil(total / (take || 20)),
      },
    };
  }

  async getOrderById(id: string, companyId: string) {
    const order = await orderRepository.findByIdAndCompany(id, companyId);

    if (!order) {
      throw new NotFoundError('Sipariş bulunamadı');
    }

    return order;
  }

  async createOrder(companyId: string, input: CreateOrderInput, userId?: string) {
    // Get default warehouse if not specified
    let warehouseId = input.warehouseId;
    if (!warehouseId) {
      const defaultWarehouse = await warehouseRepository.findDefaultByCompany(companyId);
      if (!defaultWarehouse) {
        throw new AppError('Varsayılan depo bulunamadı', 400);
      }
      warehouseId = defaultWarehouse.id;
    }

    // Validate products and calculate totals
    let subtotal = 0;
    const orderItems: any[] = [];

    for (const item of input.items) {
      const product = await productRepository.findByIdAndCompany(item.productId, companyId);
      if (!product) {
        throw new NotFoundError(`Ürün bulunamadı: ${item.productId}`);
      }

      // Check stock
      const stock = await stockRepository.findStock(item.productId, warehouseId, item.variantId);
      const availableQty = (stock?.quantity || 0) - (stock?.reservedQty || 0);

      if (availableQty < item.quantity) {
        throw new AppError(`Yetersiz stok: ${product.name}. Mevcut: ${availableQty}, Talep: ${item.quantity}`, 400);
      }

      const itemTotal = Number(product.price) * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        productId: item.productId,
        variantId: item.variantId,
        sku: product.sku,
        name: product.name,
        quantity: item.quantity,
        unitPrice: toNumber(product.price),
        taxRate: toNumber(product.taxRate),
        discount: 0,
        total: itemTotal,
      });
    }

    const taxAmount = subtotal * 0.20; // Default 20% KDV
    const total = subtotal + taxAmount;

    // Create order with stock deduction (WooCommerce mantığı: sipariş oluşturulduğunda stok düşer)
    const order = await prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          status: 'PENDING',
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          shippingAddress: input.shippingAddress,
          shippingCity: input.shippingCity,
          shippingDistrict: input.shippingDistrict,
          shippingPostalCode: input.shippingPostalCode,
          billingAddress: input.billingAddress,
          subtotal,
          taxAmount,
          shippingCost: 0,
          discount: 0,
          total,
          customerNote: input.customerNote,
          warehouseId,
          companyId,
          createdById: userId,
          items: {
            create: orderItems,
          },
        },
        include: {
          items: true,
        },
      });

      // Deduct stock for each item when order is created (WooCommerce behavior)
      for (const item of newOrder.items) {
        if (!item.productId) {
          // Try to find product by SKU
          if (item.sku) {
            const product = await tx.product.findFirst({
              where: {
                sku: item.sku,
                companyId: companyId,
              },
            });

            if (product) {
              // Update order item with productId
              await tx.orderItem.update({
                where: { id: item.id },
                data: { productId: product.id },
              });
              // Update item reference
              item.productId = product.id;
            } else {
              logger.warn(`[createOrder] Product bulunamadı: ${item.sku}, stok düşürme atlanıyor`);
              continue;
            }
          } else {
            logger.warn(`[createOrder] ProductId ve SKU bulunamadı, stok düşürme atlanıyor`);
            continue;
          }
        }

        // Get product to check if it's a Campaign SET
        const product = await tx.product.findUnique({
          where: { id: item.productId },
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
          logger.warn(`[createOrder] Product bulunamadı: ${item.productId}, stok düşürme atlanıyor`);
          continue;
        }

        // Check if product is a Campaign SET (using FK relation)
        if (product.campaignSetId && product.campaignSet) {
          // Campaign SET picking algorithm
          await this.processCampaignSetItemForOrder(tx, {
            setProductId: product.id,
            campaignSetId: product.campaignSetId,
            setSku: product.sku,
            quantity: item.quantity,
            warehouseId: warehouseId!,
            orderNumber: newOrder.orderNumber,
            orderId: newOrder.id,
            userId,
            campaignSet: product.campaignSet,
          });
        } else {
          // Normal product stock deduction
          // Find stock - prioritize location-based if available
          const primaryLocation = await tx.productLocationAssignment.findFirst({
            where: {
              productId: item.productId,
              variantId: item.variantId || null,
              isPrimary: true,
            },
            include: {
              location: true,
            },
          });

          let stock: any = null;
          
          // If primary location exists and belongs to this warehouse, use it
          if (primaryLocation && primaryLocation.location.warehouseId === warehouseId) {
            stock = await tx.stock.findFirst({
              where: {
                productId: item.productId,
                warehouseId: warehouseId!,
                locationId: primaryLocation.locationId,
                variantId: item.variantId || null,
              },
            });
          }

          // If no primary location stock, try any location-based stock in this warehouse
          if (!stock) {
            stock = await tx.stock.findFirst({
              where: {
                productId: item.productId,
                warehouseId: warehouseId!,
                locationId: { not: null },
                variantId: item.variantId || null,
              },
              orderBy: {
                quantity: 'desc',
              },
            });
          }

          // If no location stock found, try warehouse-level stock
          if (!stock) {
            stock = await tx.stock.findFirst({
              where: {
                productId: item.productId,
                warehouseId: warehouseId!,
                locationId: null,
                variantId: item.variantId || null,
              },
            });
          }

          if (!stock) {
            logger.warn(`[createOrder] Stok bulunamadı: ${product.name}, stok düşürme atlanıyor`);
            continue;
          }

          const availableQty = stock.quantity - stock.reservedQty;
          if (availableQty < item.quantity) {
            logger.warn(`[createOrder] Yetersiz stok: ${product.name}. Mevcut: ${availableQty}, Gerekli: ${item.quantity}, stok düşürme atlanıyor`);
            continue;
          }

          // Update stock
          const previousQty = stock.quantity;
          const newQty = Math.max(0, previousQty - item.quantity);

          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantity: newQty,
            },
          });

          // Create stock log with location info
          const locationInfo = stock.locationId 
            ? await tx.location.findUnique({ 
                where: { id: stock.locationId },
                select: { code: true }
              }).then(loc => loc ? ` - Lokasyon: ${loc.code}` : '')
            : '';
          
          await tx.stockLog.create({
            data: {
              type: 'OUT',
              quantity: item.quantity,
              previousQty,
              newQty,
              note: `Sipariş oluşturuldu: ${newOrder.orderNumber}${locationInfo}`,
              reference: newOrder.id,
              productId: item.productId,
              variantId: item.variantId || null,
              warehouseId: warehouseId!,
              userId,
            },
          });
        }
      }

      return newOrder;
    });

    return order;
  }

  async updateOrderStatus(id: string, companyId: string, status: OrderStatus, data?: {
    cargoCompany?: string;
    trackingNumber?: string;
    internalNote?: string;
  }, userId?: string) {
    const order = await orderRepository.findByIdAndCompany(id, companyId);

    if (!order) {
      throw new NotFoundError('Sipariş bulunamadı');
    }

    const updateData: any = { ...data };

    // Stok düşürme artık sipariş oluşturulduğunda (createOrder) yapılıyor (WooCommerce mantığı)
    // PENDING -> PROCESSING geçişinde stok düşürme yapılmıyor (çift düşüşü önlemek için)
    // Sadece status güncellemesi yapılıyor

    if (status === 'SHIPPED' && !order.shippedAt) {
      updateData.shippedAt = new Date();
    }

    if (status === 'DELIVERED' && !order.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    return orderRepository.updateStatus(id, status, updateData);
  }

  async cancelOrder(id: string, companyId: string, userId?: string) {
    const order = await orderRepository.findByIdAndCompany(id, companyId);

    if (!order) {
      throw new NotFoundError('Sipariş bulunamadı');
    }

    if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
      throw new AppError('Gönderilmiş veya teslim edilmiş sipariş iptal edilemez', 400);
    }

    if (order.status === 'CANCELLED') {
      throw new AppError('Sipariş zaten iptal edilmiş', 400);
    }

    // Cancel order and return stock
    await prisma.$transaction(async (tx) => {
      // Update order status
      await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // Return stock for each item
      if (order.warehouseId) {
        for (const item of order.items) {
          // Skip if no productId
          if (!item.productId) {
            continue; // Skip items without productId
          }

          // Get product to check if it's a Campaign SET
          const product = await tx.product.findUnique({
            where: { id: item.productId },
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
            continue; // Skip if product not found
          }

          // Check if product is a Campaign SET (using FK relation)
          if (product.campaignSetId && product.campaignSet) {
            // Campaign SET return - assume intact (kapalı kutu) for cancellations
            await this.processCampaignSetReturn(tx, {
              setProductId: product.id,
              campaignSetId: product.campaignSetId,
              setSku: product.sku,
              quantity: item.quantity,
              warehouseId: order.warehouseId,
              orderNumber: order.orderNumber,
              orderId: order.id,
              userId,
              isIntact: true, // Cancelled orders are assumed intact
            });
          } else {
            // Normal product cancellation - use StockLog only (LEDGER ARCHITECTURE)
            // Check idempotency: prevent duplicate cancellation logs
            const existingCancelLog = await tx.stockLog.findFirst({
              where: {
                reference: order.id,
                productId: item.productId,
                type: 'IN_CANCEL' as any, // TODO: Use StockLogType.IN_CANCEL after Prisma generate
              },
            });

            if (!existingCancelLog) {
              // Create stock log entry (positive quantity for IN_CANCEL)
              await tx.stockLog.create({
                data: {
                  type: 'IN_CANCEL' as any, // TODO: Use StockLogType.IN_CANCEL after Prisma generate
                  previousQty: 0, // Not used in ledger architecture, but required by schema
                  newQty: 0, // Not used in ledger architecture, but required by schema
                  quantity: item.quantity, // Positive for IN movement
                  reference: order.id,
                  productId: item.productId,
                  warehouseId: order.warehouseId,
                  note: `Order cancelled: ${order.orderNumber}`,
                  userId,
                },
              });

              logger.info('[OrderService] Stock movement created for order cancellation', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                productId: item.productId,
                quantity: item.quantity,
                type: 'IN_CANCEL',
              });
            } else {
              logger.warn('[OrderService] Duplicate cancellation log detected, skipping', {
                orderId: order.id,
                productId: item.productId,
              });
            }
          }
        }
      }
    });

    return { message: 'Sipariş iptal edildi' };
  }

  async getOrderStats(companyId: string, startDate?: Date, endDate?: Date) {
    return orderRepository.getOrderStats(companyId, startDate, endDate);
  }

  async getDailyOrderedProducts(companyId: string, date?: Date) {
    const targetDate = date || new Date();
    return orderRepository.getDailyOrderedProducts(companyId, targetDate);
  }

  async bulkUpdateOrderStatus(
    companyId: string,
    orderIds: string[],
    status: OrderStatus,
    data?: {
      cargoCompany?: string;
      trackingNumber?: string;
      internalNote?: string;
    }
  ) {
    // Verify all orders belong to company
    const orders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        companyId,
      },
    });

    if (orders.length !== orderIds.length) {
      throw new AppError('Bazı siparişler bulunamadı veya yetkiniz yok', 403);
    }

    const updateData: any = { status, ...data };

    if (status === 'SHIPPED') {
      updateData.shippedAt = new Date();
    }

    if (status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    }

    const result = await prisma.order.updateMany({
      where: {
        id: { in: orderIds },
        companyId,
      },
      data: updateData,
    });

    return {
      updated: result.count,
      orderIds,
    };
  }

  /**
   * Barkod okutulduğunda sadece doğrulama yapılır
   * Stok düşürme sipariş tamamlandığında (PENDING -> PROCESSING) yapılır
   */
  async scanOrderItem(
    orderId: string,
    companyId: string,
    barcode: string,
    locationId?: string,
    userId?: string
  ) {
    try {
      const order = await orderRepository.findByIdAndCompany(orderId, companyId);

      if (!order) {
        throw new NotFoundError('Sipariş bulunamadı');
      }

      if (order.status !== 'PENDING') {
        throw new AppError('Sadece bekleyen siparişler için barkod okutulabilir', 400);
      }

      if (!order.warehouseId) {
        throw new AppError('Sipariş için depo belirtilmemiş', 400);
      }

      // Ensure items array exists
      if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
        throw new AppError('Siparişte ürün bulunamadı', 400);
      }

      // Find order item by barcode using central barcode matcher
      const { findOrderItemByBarcode } = await import('../utils/barcode-matcher.js');
      const orderItem = findOrderItemByBarcode(barcode, order.items);

      if (!orderItem) {
        throw new NotFoundError(`Barkod siparişte bulunamadı: ${barcode}`);
      }

      // If no productId, try to find product by SKU and update the order item
      if (!orderItem.productId) {
        // Try to find product by SKU (case-insensitive)
        if (orderItem.sku) {
          const product = await productRepository.findBySkuCaseInsensitive(
            companyId,
            orderItem.sku
          );

          if (product && product.isActive) {
            // Update order item with productId
            await prisma.orderItem.update({
              where: { id: orderItem.id },
              data: { productId: product.id },
            });
            // Update orderItem reference
            orderItem.productId = product.id;
          } else {
            throw new AppError(
              `SKU ile ürün bulunamadı: ${orderItem.sku}`,
              400
            );
          }
        } else {
          throw new AppError(
            `SKU ile ürün bulunamadı: Sipariş item'ında SKU bulunamadı`,
            400
          );
        }
      }

      // Stok kontrolü - bilgi amaçlı, hata vermez
      // Stok zaten sipariş geldiğinde düşürüldü
      const stock = await prisma.stock.findFirst({
        where: {
          productId: orderItem.productId,
          warehouseId: order.warehouseId,
          variantId: orderItem.variantId || null,
        },
        orderBy: { quantity: 'desc' },
      });

      const availableQty = stock ? stock.quantity - stock.reservedQty : 0;

      // Sadece doğrulama yap - ürün siparişte var mı?
      // Stok kontrolü yapılmıyor çünkü stok zaten düşürüldü
      return {
        success: true,
        orderItem: {
          id: orderItem.id,
          name: orderItem.name,
          sku: orderItem.sku,
          barcode: barcode,
        },
        stock: {
          availableQty,
          locationId: stock?.locationId || null,
        },
      };
    } catch (error: any) {
      // Log error for debugging
      logger.error('scanOrderItem error:', {
        orderId,
        companyId,
        barcode,
        error: error.message,
        stack: error.stack,
      });

      // Re-throw if it's already an AppError
      if (error instanceof AppError || error instanceof NotFoundError) {
        throw error;
      }

      // Wrap unexpected errors
      throw new AppError(
        `Barkod okutma sırasında bir hata oluştu: ${error.message || 'Bilinmeyen hata'}`,
        500
      );
    }
  }

  /**
   * SET ürünü için picking algoritmasını uygula
   * Transaction içinde çalışır
   */
  /**
   * Campaign SET item processing for orders
   * Uses CampaignSet and CampaignStock (FK relation as single source of truth)
   */
  private async processCampaignSetItemForOrder(
    tx: any,
    params: {
      setProductId: string;
      campaignSetId: string;
      setSku: string;
      quantity: number;
      warehouseId: string;
      orderNumber: string;
      orderId: string;
      userId?: string;
      locationId?: string;
      campaignSet: {
        items: Array<{
          productId: string;
          variantId: string | null;
          quantity: number;
          product: { id: string; sku: string; name: string };
          variant: { id: string; sku: string; name: string } | null;
        }>;
      };
    }
  ) {
    const { setProductId, campaignSetId, setSku, quantity, warehouseId, orderNumber, orderId, userId, locationId, campaignSet } = params;

    // Get Campaign SET stock (CampaignStock)
    const campaignStock = await tx.campaignStock.findUnique({
      where: {
        campaignSetId_warehouseId_locationId: {
          campaignSetId,
          warehouseId,
          locationId: locationId || '',
        },
      },
    });

    const campaignStockQty = campaignStock ? campaignStock.quantity - campaignStock.reservedQty : 0;

    // Scenario A: CampaignStock sufficient → Use ready package
    if (campaignStockQty >= quantity) {
      const previousQty = campaignStock!.quantity;
      const newQty = previousQty - quantity;

      await tx.campaignStock.update({
        where: { id: campaignStock!.id },
        data: { quantity: newQty },
      });

      await tx.stockLog.create({
        data: {
          type: StockLogType.OUT_SET_READY,
          quantity,
          previousQty,
          newQty,
          productId: setProductId,
          warehouseId,
          userId,
          setSku,
          note: `Sipariş tamamlandı: ${orderNumber}`,
          reference: orderId,
        },
      });

      return;
    }

    // Get Campaign SET components (CampaignSetItem)
    const setItems = campaignSet.items;

    if (setItems.length === 0) {
      throw new AppError(`Campaign SET içinde ürün bulunamadı: ${setSku}`, 400);
    }

    // Scenario B & C: Component stock check and deduction
    const componentLogs: Array<{ sku: string; qty: number }> = [];

    for (const setItem of setItems) {
      const requiredQty = setItem.quantity * quantity;

      // Find component stock
      let componentStock = await tx.stock.findFirst({
        where: {
          productId: setItem.productId,
          warehouseId,
          locationId: locationId || null,
          variantId: setItem.variantId || null,
        },
        orderBy: {
          quantity: 'desc',
        },
      });

      if (!componentStock) {
        throw new AppError(
          `Component stok bulunamadı: ${setItem.product.sku}. SET: ${setSku}`,
          400
        );
      }

      const availableQty = componentStock.quantity - componentStock.reservedQty;
      if (availableQty < requiredQty) {
        throw new AppError(
          `Yetersiz component stok: ${setItem.product.sku}. Mevcut: ${availableQty}, Gerekli: ${requiredQty}. SET: ${setSku}`,
          400
        );
      }

      // Deduct component stock
      const previousQty = componentStock.quantity;
      const newQty = previousQty - requiredQty;

      await tx.stock.update({
        where: { id: componentStock.id },
        data: { quantity: newQty },
      });

      // Create component stock log
      await tx.stockLog.create({
        data: {
          type: StockLogType.OUT_SET_COMPONENT,
          quantity: requiredQty,
          previousQty,
          newQty,
          productId: setItem.productId,
          variantId: setItem.variantId || null,
          warehouseId,
          userId,
          note: `Campaign SET component çıkışı: ${setSku} (${quantity} adet SET)`,
          reference: orderId,
        },
      });

      componentLogs.push({
        sku: setItem.product.sku,
        qty: requiredQty,
      });
    }

    // Create Campaign SET component log
    await tx.stockLog.create({
      data: {
        type: StockLogType.OUT_SET_COMPONENT,
        quantity,
        previousQty: 0,
        newQty: 0,
        productId: setProductId,
        warehouseId,
        userId,
        setSku,
        components: componentLogs as any,
        note: `Campaign SET component çıkışı: ${orderNumber}`,
        reference: orderId,
      },
    });
  }

  /**
   * Campaign SET return processing
   * Uses CampaignSet and CampaignStock (FK relation as single source of truth)
   */
  private async processCampaignSetReturn(
    tx: any,
    params: {
      setProductId: string;
      campaignSetId: string;
      setSku: string;
      quantity: number;
      warehouseId: string;
      orderNumber: string;
      orderId: string;
      userId?: string;
      locationId?: string;
      isIntact?: boolean; // true = kapalı kutu, false = bozuk
    }
  ) {
    const { setProductId, campaignSetId, setSku, quantity, warehouseId, orderNumber, orderId, userId, locationId, isIntact = true } = params;

    // Get Campaign SET items
    const campaignSet = await tx.campaignSet.findUnique({
      where: { id: campaignSetId },
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
    });

    if (!campaignSet) {
      throw new AppError(`Campaign SET bulunamadı: ${campaignSetId}`, 400);
    }

    if (isIntact) {
      // Scenario 1: Intact package → Increase CampaignStock
      let campaignStock = await tx.campaignStock.findUnique({
        where: {
          campaignSetId_warehouseId_locationId: {
            campaignSetId,
            warehouseId,
            locationId: locationId || '',
          },
        },
      });

      if (!campaignStock) {
        campaignStock = await tx.campaignStock.create({
          data: {
            campaignSetId,
            warehouseId,
            locationId: locationId || null,
            quantity: 0,
            reservedQty: 0,
          },
        });
      }

      const previousQty = campaignStock.quantity;
      const newQty = previousQty + quantity;

      await tx.campaignStock.update({
        where: { id: campaignStock.id },
        data: { quantity: newQty },
      });

      await tx.stockLog.create({
        data: {
          type: StockLogType.RETURN_SET_READY,
          quantity,
          previousQty,
          newQty,
          productId: setProductId,
          warehouseId,
          userId,
          setSku,
          note: `Sipariş iptali (Campaign SET): ${orderNumber}`,
          reference: orderId,
        },
      });
    } else {
      // Scenario 2: Broken/incomplete → Add to component stocks
      const componentLogs: Array<{ sku: string; qty: number }> = [];

      for (const setItem of campaignSet.items) {
        const returnQty = setItem.quantity * quantity;

        let componentStock = await tx.stock.findFirst({
          where: {
            productId: setItem.productId,
            warehouseId,
            locationId: locationId || null,
            variantId: setItem.variantId || null,
          },
        });

        if (!componentStock) {
          componentStock = await tx.stock.create({
            data: {
              productId: setItem.productId,
              warehouseId,
              locationId: locationId || null,
              variantId: setItem.variantId || null,
              quantity: 0,
              reservedQty: 0,
              minQuantity: 0,
            },
          });
        }

        const previousQty = componentStock.quantity;
        const newQty = previousQty + returnQty;

        await tx.stock.update({
          where: { id: componentStock.id },
          data: { quantity: newQty },
        });

        await tx.stockLog.create({
          data: {
            type: StockLogType.RETURN_SET_COMPONENT,
            quantity: returnQty,
            previousQty,
            newQty,
            productId: setItem.productId,
            variantId: setItem.variantId || null,
            warehouseId,
            userId,
            note: `Campaign SET component iadesi: ${setSku} (${quantity} adet SET)`,
            reference: orderId,
          },
        });

        componentLogs.push({
          sku: setItem.product.sku,
          qty: returnQty,
        });
      }

      await tx.stockLog.create({
        data: {
          type: StockLogType.RETURN_SET_COMPONENT,
          quantity,
          previousQty: 0,
          newQty: 0,
          productId: setProductId,
          warehouseId,
          userId,
          setSku,
          components: componentLogs as any,
          note: `Campaign SET component iadesi: ${orderNumber}`,
          reference: orderId,
        },
      });
    }
  }

  /**
   * Barkod ile sipariş ara (Navlungo / Hepsijet barkodları için)
   * 3 alanda arama yapar:
   * 1. externalTrackingNumber (Navlungo → Hepsijet barkodu)
   * 2. externalShipmentId (Navlungo shipment ID)
   * 3. orderNumber (Sipariş numarası)
   */
  /**
   * Find order by shipping barcode (from OrderSource table)
   * Used when depocu scans shipping barcode to open order
   */
  async findByShippingCode(code: string, companyId: string) {
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new AppError('Barkod kodu boş olamaz', 400);
    }

    // Find OrderSource by shippingBarcode
    const orderSource = await prisma.orderSource.findFirst({
      where: {
        shippingBarcode: normalizedCode,
        order: {
          companyId: companyId,
        },
      },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    barcode: true,
                    gtin: true,
                    imageUrl: true,
                  },
                },
                variant: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    barcode: true,
                  },
                },
              },
            },
            warehouse: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            integration: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            pickingWave: {
              select: {
                id: true,
                code: true,
                status: true,
              },
            },
            cargoCompany: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!orderSource || !orderSource.order) {
      return null;
    }

    // Return full order details
    return orderSource.order;
  }

  async findOrderByBarcode(barcode: string, companyId: string) {
    const normalizedBarcode = barcode.trim();

    if (!normalizedBarcode) {
      throw new AppError('Barkod boş olamaz', 400);
    }

    // Search in 3 fields: externalTrackingNumber, externalShipmentId, orderNumber
    // Also search in OrderSource.shippingBarcode
    const order = await prisma.order.findFirst({
      where: {
        companyId,
        OR: [
          { externalTrackingNumber: normalizedBarcode },
          { externalShipmentId: normalizedBarcode },
          { orderNumber: normalizedBarcode },
          {
            orderSources: {
              some: {
                shippingBarcode: normalizedBarcode,
              },
            },
          },
        ],
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                gtin: true,
                imageUrl: true,
              },
            },
            variant: {
              select: {
                id: true,
                sku: true,
                barcode: true,
              },
            },
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        integration: {
          select: {
            id: true,
            type: true,
            name: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Bu barkoda ait sipariş bulunamadı: ${normalizedBarcode}`);
    }

    return order;
  }
}

export const orderService = new OrderService();

