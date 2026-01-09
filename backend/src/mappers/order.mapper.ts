/**
 * Order Mapper
 * Maps Prisma Order types to OrderDTO
 */

import { Prisma } from '@prisma/client';
import { OrderDTO, OrderItemDTO } from '../dto/order.dto.js';
import { toNumber } from '../utils/decimal.js';

type PrismaOrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: {
          select: {
            id: true;
            sku: true;
            barcode: true;
            gtin: true;
            name: true;
          };
        };
        variant: {
          select: {
            id: true;
            sku: true;
            barcode: true;
            name: true;
          };
        };
      };
    };
    warehouse: {
      select: { id: true; name: true; code: true };
    };
    integration: {
      select: { id: true; type: true; name: true };
    };
    createdBy: {
      select: { id: true; firstName: true; lastName: true };
    };
  };
}>;

/**
 * Maps Prisma Order Item to OrderItemDTO
 */
function mapOrderItem(item: PrismaOrderWithItems['items'][0]): OrderItemDTO {
  return {
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    unitPrice: toNumber(item.unitPrice),
    taxRate: toNumber(item.taxRate),
    discount: toNumber(item.discount),
    total: toNumber(item.total),
    product: item.product ? {
      id: item.product.id,
      name: item.product.name,
      sku: item.product.sku,
      barcode: item.product.barcode,
      gtin: item.product.gtin,
    } : null,
    variant: item.variant ? {
      id: item.variant.id,
      sku: item.variant.sku,
      barcode: item.variant.barcode,
      name: item.variant.name,
    } : null,
  };
}

/**
 * Maps Prisma Order to OrderDTO
 */
export function mapPrismaOrderToDTO(order: PrismaOrderWithItems | null): OrderDTO | null {
  if (!order) {
    return null;
  }

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    marketplaceOrderId: order.marketplaceOrderId,
    status: order.status,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    shippingCity: order.shippingCity,
    shippingDistrict: order.shippingDistrict,
    shippingPostalCode: order.shippingPostalCode,
    billingAddress: order.billingAddress,
    subtotal: toNumber(order.subtotal),
    taxAmount: toNumber(order.taxAmount),
    shippingCost: toNumber(order.shippingCost),
    discount: toNumber(order.discount),
    total: toNumber(order.total),
    customerNote: order.customerNote,
    integrationId: order.integrationId,
    warehouseId: order.warehouseId,
    pickingWaveId: order.pickingWaveId,
    companyId: order.companyId,
    createdById: order.createdById,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map(mapOrderItem),
    warehouse: order.warehouse ? {
      id: order.warehouse.id,
      name: order.warehouse.name,
      code: order.warehouse.code,
    } : null,
    integration: order.integration ? {
      id: order.integration.id,
      type: order.integration.type,
      name: order.integration.name,
    } : null,
    createdBy: order.createdBy ? {
      id: order.createdBy.id,
      firstName: order.createdBy.firstName,
      lastName: order.createdBy.lastName,
    } : null,
  };
}

