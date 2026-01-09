/**
 * Prisma Repository Implementations
 * 
 * Infrastructure layer implementations of repository interfaces.
 * These use Prisma ORM for database access.
 * 
 * Architecture:
 * - Implements interfaces from src/repositories/*.interface.ts
 * - Uses PrismaClient for database operations
 * - Maps Prisma models to domain entities
 * - No business logic, only data access
 * 
 * TODO: Register these in dependency injection container
 * TODO: Replace existing repository classes with these implementations
 */

export { PrismaProductRepository } from './prisma-product.repository.js';
export { PrismaOrderRepository } from './prisma-order.repository.js';
export { PrismaStockRepository } from './prisma-stock.repository.js';
export { PrismaCompanyRepository } from './prisma-company.repository.js';
export { PrismaMarketplaceConnectionRepository } from './prisma-marketplace-connection.repository.js';

// Export mappers for use in other infrastructure code
export * from './mappers.js';

