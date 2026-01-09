/**
 * Stock Domain Entity
 * 
 * Represents stock/inventory for a product in a warehouse.
 * This is a pure domain model with no infrastructure dependencies.
 * 
 * Business Rules:
 * - Stock quantity cannot be negative
 * - Reserved quantity cannot exceed total quantity
 * - Available quantity = quantity - reservedQty
 * - Stock must belong to a product and warehouse
 * 
 * TODO: Add validation logic
 * TODO: Add business methods (reserve, release, adjust, etc.)
 */

export class Stock {
  id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  locationId: string | null;
  quantity: number;
  reservedQty: number;
  minQuantity: number;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: {
    id: string;
    productId: string;
    variantId?: string | null;
    warehouseId: string;
    locationId?: string | null;
    quantity: number;
    reservedQty?: number;
    minQuantity?: number;
    companyId: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = data.id;
    this.productId = data.productId;
    this.variantId = data.variantId ?? null;
    this.warehouseId = data.warehouseId;
    this.locationId = data.locationId ?? null;
    this.quantity = data.quantity;
    this.reservedQty = data.reservedQty ?? 0;
    this.minQuantity = data.minQuantity ?? 0;
    this.companyId = data.companyId;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /**
   * Get available quantity (quantity - reserved)
   * TODO: Implement calculation
   */
  getAvailableQuantity(): number {
    return Math.max(0, this.quantity - this.reservedQty);
  }

  /**
   * Check if stock is below minimum threshold
   * TODO: Implement business logic
   */
  isBelowMinimum(): boolean {
    return this.quantity < this.minQuantity;
  }

  /**
   * Check if stock can fulfill requested quantity
   * TODO: Implement business logic
   */
  canFulfill(requestedQty: number): boolean {
    return this.getAvailableQuantity() >= requestedQty;
  }
}

