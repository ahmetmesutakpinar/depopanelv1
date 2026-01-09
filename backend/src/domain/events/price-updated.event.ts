/**
 * PriceUpdated Domain Event
 * 
 * Fired when a product price is updated.
 * Domain events represent something important that happened in the domain.
 * 
 * TODO: Add event metadata
 * TODO: Add event serialization
 * TODO: Add event handlers registration
 */

import { ProductId } from '../value-objects/ids.vo.js';
import { Money } from '../value-objects/money.vo.js';

export class PriceUpdated {
  readonly productId: ProductId;
  readonly previousPrice: Money;
  readonly newPrice: Money;
  readonly reason: string;
  readonly occurredAt: Date;

  constructor(data: {
    productId: ProductId;
    previousPrice: Money;
    newPrice: Money;
    reason: string;
    occurredAt?: Date;
  }) {
    this.productId = data.productId;
    this.previousPrice = data.previousPrice;
    this.newPrice = data.newPrice;
    this.reason = data.reason;
    this.occurredAt = data.occurredAt ?? new Date();
  }
}

