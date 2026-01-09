import { Decimal } from '@prisma/client/runtime/library';
import { Order, OrderItem } from '@prisma/client';
import { logger } from './logger.js';
import { toNumber } from './decimal.js';

/**
 * Prisma Decimal'ı JavaScript number'a çevirir
 * @deprecated Use toNumber from decimal.ts instead for consistency
 */
export function decimalToNumber(value: Decimal | number | string | null | undefined): number {
  return toNumber(value);
}

/**
 * Order item'larındaki Decimal değerleri number'a çevirir
 */
export function convertOrderItemDecimals(
  item: OrderItem & {
    unitPrice?: Decimal | number;
    taxRate?: Decimal | number;
    discount?: Decimal | number;
    total?: Decimal | number;
  } | null | undefined
): (Omit<OrderItem, 'unitPrice' | 'taxRate' | 'discount' | 'total'> & {
  id: string;
  unitPrice: number;
  taxRate: number;
  discount: number;
  total: number;
}) | null {
  try {
    if (!item) {
      return null;
    }
    return {
      ...item,
      unitPrice: decimalToNumber(item.unitPrice),
      taxRate: decimalToNumber(item.taxRate),
      discount: decimalToNumber(item.discount),
      total: decimalToNumber(item.total),
    };
  } catch (error) {
    // Return item with safe defaults if conversion fails
    if (!item) {
      return null;
    }
    return {
      ...item,
      id: item.id,
      unitPrice: decimalToNumber(item.unitPrice),
      taxRate: decimalToNumber(item.taxRate),
      discount: decimalToNumber(item.discount),
      total: decimalToNumber(item.total),
    };
  }
}

/**
 * Order'daki Decimal değerleri number'a çevirir
 */
export function convertOrderDecimals(
  order: (Order & {
    subtotal?: Decimal | number;
    taxAmount?: Decimal | number;
    shippingCost?: Decimal | number;
    discount?: Decimal | number;
    total?: Decimal | number;
    items?: Array<OrderItem & {
      unitPrice?: Decimal | number;
      taxRate?: Decimal | number;
      discount?: Decimal | number;
      total?: Decimal | number;
    }>;
  }) | null | undefined
): (Omit<Order, 'subtotal' | 'taxAmount' | 'shippingCost' | 'discount' | 'total'> & {
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  discount: number;
  total: number;
  items: Array<Omit<OrderItem, 'unitPrice' | 'taxRate' | 'discount' | 'total'> & {
    unitPrice: number;
    taxRate: number;
    discount: number;
    total: number;
  }>;
}) | null {
  try {
    if (!order) {
      return null;
    }
    return {
      ...order,
      subtotal: decimalToNumber(order.subtotal),
      taxAmount: decimalToNumber(order.taxAmount),
      shippingCost: decimalToNumber(order.shippingCost),
      discount: decimalToNumber(order.discount),
      total: decimalToNumber(order.total),
      items: Array.isArray(order.items)
        ? order.items.map((item) => convertOrderItemDecimals(item)).filter((item): item is NonNullable<typeof item> => item !== null)
        : [],
    };
  } catch (error: unknown) {
    // Log error but return safe defaults
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('[convertOrderDecimals] Decimal conversion hatası', {
      error: errorMessage,
      stack: errorStack,
      orderId: order?.id,
    });
    
    // Return order with safe defaults
    if (!order) {
      return null;
    }
    return {
      ...order,
      subtotal: decimalToNumber(order.subtotal),
      taxAmount: decimalToNumber(order.taxAmount),
      shippingCost: decimalToNumber(order.shippingCost),
      discount: decimalToNumber(order.discount),
      total: decimalToNumber(order.total),
      items: Array.isArray(order.items)
        ? order.items.map((item) => convertOrderItemDecimals(item)).filter((item): item is NonNullable<typeof item> => item !== null)
        : [],
    };
  }
}

