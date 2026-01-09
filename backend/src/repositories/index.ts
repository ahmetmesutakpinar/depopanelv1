/**
 * Repository Layer
 * 
 * This layer provides an abstraction over data persistence.
 * Repositories define interfaces for data access, not implementations.
 * 
 * Architecture:
 * - Repository interfaces define what data operations are needed
 * - Infrastructure layer provides concrete implementations (Prisma)
 * - Domain layer depends on repository interfaces, not implementations
 * 
 * Repository Interfaces:
 * - IProductRepository - Product persistence operations
 * - IOrderRepository - Order persistence operations
 * - IStockRepository - Stock/inventory persistence operations
 * - ICompanyRepository - Company persistence operations
 * - IMarketplaceConnectionRepository - Marketplace connection persistence operations
 * 
 * TODO: Move existing repository implementations to infrastructure layer
 * TODO: Update existing repositories to implement these interfaces
 */

// Export repository interfaces
export { IProductRepository, ProductWithStock, FindProductsOptions } from './product.repository.interface.js';
export { IOrderRepository, OrderWithItems, FindOrdersOptions } from './order.repository.interface.js';
export { IStockRepository, StockLog, FindWarehouseStocksOptions } from './stock.repository.interface.js';
export { ICompanyRepository, FindCompaniesOptions } from './company.repository.interface.js';
export { IMarketplaceConnectionRepository, FindConnectionsOptions } from './marketplace-connection.repository.interface.js';
