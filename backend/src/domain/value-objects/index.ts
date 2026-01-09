/**
 * Value Objects
 * 
 * Value objects are immutable objects defined by their attributes.
 * They have no identity and are compared by value.
 * 
 * All value objects are pure TypeScript classes with no infrastructure dependencies.
 */

export { Money } from './money.vo.js';
export { Quantity } from './quantity.vo.js';
export { SKU } from './sku.vo.js';
export { CompanyId, OrderId, ProductId } from './ids.vo.js';
export { MarketplaceType, MarketplaceTypeValue } from './marketplace-type.vo.js';
