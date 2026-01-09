/**
 * Domain Entities
 * 
 * Entities represent core business objects with identity and lifecycle.
 * They encapsulate business logic and rules.
 * 
 * All entities are pure TypeScript classes with no infrastructure dependencies.
 */

export { Product } from './product.entity.js';
export { Order, OrderStatus } from './order.entity.js';
export { OrderItem } from './order-item.entity.js';
export { Stock } from './stock.entity.js';
export { Company, CompanyStatus } from './company.entity.js';
export { MarketplaceConnection, MarketplaceType, IntegrationStatus } from './marketplace-connection.entity.js';
