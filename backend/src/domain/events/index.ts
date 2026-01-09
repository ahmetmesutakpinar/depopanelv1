/**
 * Domain Events
 * 
 * Domain events represent something important that happened in the domain.
 * They are used for decoupling and event-driven architecture.
 * 
 * Events should be:
 * - Immutable
 * - Serializable
 * - Contain relevant domain data
 * - Have a clear name describing what happened
 */

export { OrderCreated } from './order-created.event.js';
export { StockUpdated } from './stock-updated.event.js';
export { PriceUpdated } from './price-updated.event.js';
