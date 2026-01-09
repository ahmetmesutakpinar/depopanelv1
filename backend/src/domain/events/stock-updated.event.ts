/**
 * StockUpdated Domain Event
 * 
 * Fired when stock quantity is updated (increased or decreased).
 * Domain events represent something important that happened in the domain.
 * 
 * TODO: Add event metadata
 * TODO: Add event serialization
 * TODO: Add event handlers registration
 */

import { ProductId } from '../value-objects/ids.vo.js';
import { Quantity } from '../value-objects/quantity.vo.js';

export class StockUpdated {
  readonly productId: ProductId;
  readonly warehouseId: string;
  readonly previousQuantity: Quantity;
  readonly newQuantity: Quantity;
  readonly reason: string;
  readonly occurredAt: Date;

  constructor(data: {
    productId: ProductId;
    warehouseId: string;
    previousQuantity: Quantity;
    newQuantity: Quantity;
    reason: string;
    occurredAt?: Date;
  }) {
    this.productId = data.productId;
    this.warehouseId = data.warehouseId;
    this.previousQuantity = data.previousQuantity;
    this.newQuantity = data.newQuantity;
    this.reason = data.reason;
    this.occurredAt = data.occurredAt ?? new Date();
  }
}

