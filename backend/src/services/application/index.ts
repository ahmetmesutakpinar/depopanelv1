/**
 * Application / Use Case Layer
 * 
 * This layer contains use cases that orchestrate repositories and domain logic.
 * 
 * Architecture:
 * - Use cases coordinate multiple repositories
 * - Use cases control transactions (later)
 * - Use cases contain workflow logic
 * - Use cases do NOT contain infrastructure code
 * - Use cases do NOT depend on Prisma
 * - Use cases are the only layer controllers should call
 * 
 * Principles:
 * - Single Responsibility: Each use case handles one business operation
 * - Dependency Inversion: Depend on interfaces, not implementations
 * - Clean Boundaries: No HTTP, no Prisma, no infrastructure details
 */

// Product Use Cases
export { GetProductByIdUseCase, GetProductByIdInput, GetProductByIdOutput } from './get-product-by-id.use-case.js';
export { CreateProductUseCase, CreateProductInput, CreateProductOutput } from './create-product.use-case.js';
export { UpdateProductUseCase, UpdateProductInput, UpdateProductOutput } from './update-product.use-case.js';

// Order Use Cases
export { GetOrderByIdUseCase, GetOrderByIdInput, GetOrderByIdOutput } from './get-order-by-id.use-case.js';
export { CreateOrderUseCase, CreateOrderInput, CreateOrderOutput } from './create-order.use-case.js';
export { SyncOrdersUseCase, SyncOrdersInput, SyncOrdersOutput } from './sync-orders.use-case.js';

// Stock Use Cases
export { UpdateStockUseCase, UpdateStockInput, UpdateStockOutput } from './update-stock.use-case.js';
export { SyncStockUseCase, SyncStockInput, SyncStockOutput } from './sync-stock.use-case.js';

// Marketplace Use Cases
export { ConnectMarketplaceUseCase, ConnectMarketplaceInput, ConnectMarketplaceOutput } from './connect-marketplace.use-case.js';
export { SyncMarketplaceUseCase, SyncMarketplaceInput, SyncMarketplaceOutput } from './sync-marketplace.use-case.js';
