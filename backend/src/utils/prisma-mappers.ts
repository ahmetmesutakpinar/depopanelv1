/**
 * Prisma → Domain Mapper Utilities
 * 
 * Converts Prisma types to domain-safe types by:
 * - Converting Decimal → number
 * - Converting null → undefined where appropriate
 * - Explicitly mapping relations
 * - Never using unsafe casts
 */

import { Decimal } from '@prisma/client/runtime/library';
import { Order, OrderItem, Prisma } from '@prisma/client';
import { convertOrderDecimals } from './decimal-converter.js';
import { toNumber } from './decimal.js';
import { logger } from './logger.js';

/**
 * Converts Prisma Decimal to number safely
 * @deprecated Use toNumber from decimal.ts instead
 */
export function mapDecimal(value: Decimal | number | string | null | undefined): number {
  return toNumber(value);
}

/**
 * Converts null to undefined for optional fields
 */
export function mapNullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Domain type for Order Item (without Prisma Decimal)
 */
export interface OrderItemDomain {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  total: number;
  product: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    gtin: string | null;
    locationAssignments?: Array<{
      id: string;
      isPrimary: boolean;
      location: {
        id: string;
        code: string;
        name: string;
        zone: string | null;
        aisle: string | null;
        shelf: string | null;
        bin: string | null;
      } | null;
    }>;
  } | null;
  variant: {
    id: string;
    sku: string;
    barcode: string | null;
    name: string | null;
    locationAssignments?: Array<{
      id: string;
      isPrimary: boolean;
      location: {
        id: string;
        code: string;
        name: string;
        zone: string | null;
        aisle: string | null;
        shelf: string | null;
        bin: string | null;
      } | null;
    }>;
  } | null;
}

/**
 * Domain type for Order (without Prisma Decimal)
 */
export interface OrderDomain {
  id: string;
  orderNumber: string;
  marketplaceOrderId: string | null;
  status: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: string;
  shippingCity: string | null;
  shippingDistrict: string | null;
  shippingPostalCode: string | null;
  billingAddress: string | null;
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  discount: number;
  total: number;
  customerNote: string | null;
  integrationId: string | null;
  warehouseId: string | null;
  pickingWaveId: string | null;
  companyId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemDomain[];
  warehouse: {
    id: string;
    name: string;
    code: string;
  } | null;
  integration: {
    id: string;
    type: string;
    name: string;
  } | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

/**
 * Prisma Order with relations type (flexible - locationAssignments optional)
 */
type PrismaOrderWithRelations = Prisma.OrderGetPayload<{
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
            imageUrl?: true;
            locationAssignments?: {
              where: { isPrimary: true };
              select: {
                id: true;
                isPrimary: true;
                location: {
                  select: {
                    id: true;
                    code: true;
                    name: true;
                    zone: true;
                    aisle: true;
                    shelf: true;
                    bin: true;
                  };
                };
              };
            };
          };
        };
        variant: {
          select: {
            id: true;
            sku: true;
            barcode: true;
            name: true;
            locationAssignments?: {
              where: { isPrimary: true };
              select: {
                id: true;
                isPrimary: true;
                location: {
                  select: {
                    id: true;
                    code: true;
                    name: true;
                    zone: true;
                    aisle: true;
                    shelf: true;
                    bin: true;
                  };
                };
              };
            };
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
 * Maps Prisma Order Item to Domain Order Item
 */
function mapOrderItem(item: PrismaOrderWithRelations['items'][0]): OrderItemDomain {
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
      locationAssignments: 'locationAssignments' in item.product && item.product.locationAssignments && Array.isArray(item.product.locationAssignments)
        ? item.product.locationAssignments.map((la: any) => ({
            id: la.id,
            isPrimary: la.isPrimary,
            location: la.location ? {
              id: la.location.id,
              code: la.location.code,
              name: la.location.name,
              zone: la.location.zone,
              aisle: la.location.aisle,
              shelf: la.location.shelf,
              bin: la.location.bin,
            } : null,
          }))
        : undefined,
    } : null,
    variant: item.variant ? {
      id: item.variant.id,
      sku: item.variant.sku,
      barcode: item.variant.barcode,
      name: item.variant.name,
      locationAssignments: 'locationAssignments' in item.variant && item.variant.locationAssignments && Array.isArray(item.variant.locationAssignments)
        ? item.variant.locationAssignments.map((la: any) => ({
            id: la.id,
            isPrimary: la.isPrimary,
            location: la.location ? {
              id: la.location.id,
              code: la.location.code,
              name: la.location.name,
              zone: la.location.zone,
              aisle: la.location.aisle,
              shelf: la.location.shelf,
              bin: la.location.bin,
            } : null,
          }))
        : undefined,
    } : null,
  };
}

/**
 * Maps Prisma Order to Domain Order
 * This is the safe way to convert Prisma types to domain types
 */
export function mapOrderFromPrisma(order: PrismaOrderWithRelations | null): OrderDomain | null {
  if (!order) {
    return null;
  }

  try {
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[mapOrderFromPrisma] Mapping error', {
      orderId: order.id,
      error: errorMessage,
    });
    // Return null on error - let caller handle it
    return null;
  }
}

