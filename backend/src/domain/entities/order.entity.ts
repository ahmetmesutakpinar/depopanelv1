/**
 * Order Domain Entity
 * 
 * Represents an order in the domain.
 * This is a pure domain model with no infrastructure dependencies.
 * 
 * Business Rules:
 * - Order must have a unique order number
 * - Order must have customer information
 * - Order must have at least one item
 * - Order total must match sum of items + tax + shipping - discount
 * 
 * TODO: Add validation logic
 * TODO: Add business methods (canBeCancelled, canBeShipped, etc.)
 * TODO: Add state machine for order status
 */

export type OrderStatus = 
  | 'PENDING'
  | 'PROCESSING'
  | 'READY_TO_PICK'
  | 'PICKING'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export class Order {
  id: string;
  orderNumber: string;
  marketplaceOrderId: string | null;
  status: OrderStatus;
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
  items: OrderItem[];

  constructor(data: {
    id: string;
    orderNumber: string;
    marketplaceOrderId?: string | null;
    status: OrderStatus;
    customerName: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    shippingAddress: string;
    shippingCity?: string | null;
    shippingDistrict?: string | null;
    shippingPostalCode?: string | null;
    billingAddress?: string | null;
    subtotal: number;
    taxAmount?: number;
    shippingCost?: number;
    discount?: number;
    total: number;
    customerNote?: string | null;
    integrationId?: string | null;
    warehouseId?: string | null;
    pickingWaveId?: string | null;
    companyId: string;
    createdById?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    items?: OrderItem[];
  }) {
    this.id = data.id;
    this.orderNumber = data.orderNumber;
    this.marketplaceOrderId = data.marketplaceOrderId ?? null;
    this.status = data.status;
    this.customerName = data.customerName;
    this.customerEmail = data.customerEmail ?? null;
    this.customerPhone = data.customerPhone ?? null;
    this.shippingAddress = data.shippingAddress;
    this.shippingCity = data.shippingCity ?? null;
    this.shippingDistrict = data.shippingDistrict ?? null;
    this.shippingPostalCode = data.shippingPostalCode ?? null;
    this.billingAddress = data.billingAddress ?? null;
    this.subtotal = data.subtotal;
    this.taxAmount = data.taxAmount ?? 0;
    this.shippingCost = data.shippingCost ?? 0;
    this.discount = data.discount ?? 0;
    this.total = data.total;
    this.customerNote = data.customerNote ?? null;
    this.integrationId = data.integrationId ?? null;
    this.warehouseId = data.warehouseId ?? null;
    this.pickingWaveId = data.pickingWaveId ?? null;
    this.companyId = data.companyId;
    this.createdById = data.createdById ?? null;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
    this.items = data.items ?? [];
  }

  /**
   * Check if order can be cancelled
   * TODO: Implement business logic
   */
  canBeCancelled(): boolean {
    return this.status === 'PENDING' || this.status === 'PROCESSING';
  }

  /**
   * Check if order can be shipped
   * TODO: Implement business logic
   */
  canBeShipped(): boolean {
    return this.status === 'PACKED';
  }

  /**
   * Calculate total from items
   * TODO: Implement calculation logic
   */
  calculateTotal(): number {
    // TODO: Calculate from items + tax + shipping - discount
    return this.total;
  }
}

