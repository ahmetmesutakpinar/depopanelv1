/**
 * OrderItem Domain Entity
 * 
 * Represents an item within an order.
 * This is a pure domain model with no infrastructure dependencies.
 * 
 * Business Rules:
 * - OrderItem must have a product reference
 * - OrderItem must have a quantity (positive)
 * - OrderItem must have a unit price (non-negative)
 * - OrderItem total = quantity * unitPrice * (1 + taxRate) - discount
 * 
 * TODO: Add validation logic
 * TODO: Add business methods
 */

export class OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  total: number;

  constructor(data: {
    id: string;
    orderId: string;
    productId?: string | null;
    variantId?: string | null;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
    discount?: number;
    total: number;
  }) {
    this.id = data.id;
    this.orderId = data.orderId;
    this.productId = data.productId ?? null;
    this.variantId = data.variantId ?? null;
    this.sku = data.sku;
    this.name = data.name;
    this.quantity = data.quantity;
    this.unitPrice = data.unitPrice;
    this.taxRate = data.taxRate ?? 20;
    this.discount = data.discount ?? 0;
    this.total = data.total;
  }

  /**
   * Calculate item total
   * TODO: Implement calculation logic
   */
  calculateTotal(): number {
    // TODO: Calculate: (quantity * unitPrice * (1 + taxRate/100)) - discount
    return this.total;
  }
}

