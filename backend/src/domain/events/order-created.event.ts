/**
 * OrderCreated Domain Event
 * 
 * Fired when a new order is created in the system.
 * Domain events represent something important that happened in the domain.
 * 
 * TODO: Add event metadata (timestamp, eventId, etc.)
 * TODO: Add event serialization
 * TODO: Add event handlers registration
 */

import { OrderId } from '../value-objects/ids.vo.js';

export class OrderCreated {
  readonly orderId: OrderId;
  readonly orderNumber: string;
  readonly companyId: string;
  readonly customerName: string;
  readonly total: number;
  readonly occurredAt: Date;

  constructor(data: {
    orderId: OrderId;
    orderNumber: string;
    companyId: string;
    customerName: string;
    total: number;
    occurredAt?: Date;
  }) {
    this.orderId = data.orderId;
    this.orderNumber = data.orderNumber;
    this.companyId = data.companyId;
    this.customerName = data.customerName;
    this.total = data.total;
    this.occurredAt = data.occurredAt ?? new Date();
  }
}

