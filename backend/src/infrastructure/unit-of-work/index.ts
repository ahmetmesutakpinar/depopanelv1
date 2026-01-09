/**
 * Unit of Work / Transaction Layer
 * 
 * Provides transaction management abstraction for the application layer.
 * 
 * Architecture:
 * - Application layer depends on UnitOfWork interface (Dependency Inversion)
 * - Infrastructure layer provides Prisma implementation
 * - Keeps transaction logic isolated from business logic
 * 
 * Structure:
 * - unit-of-work.interface.ts - UnitOfWork interface and TransactionContext
 * - prisma-unit-of-work.ts - Prisma implementation
 * 
 * Usage:
 * ```ts
 * import { unitOfWork } from './infrastructure/unit-of-work/index.js';
 * 
 * const result = await unitOfWork.withTransaction(async (tx) => {
 *   const product = await tx.productRepository.create(productData);
 *   const stock = await tx.stockRepository.createStock(product.id, stockData);
 *   return { product, stock };
 * });
 * ```
 * 
 * Future Enhancements:
 * - Retry logic for transient failures
 * - Saga orchestration for distributed transactions
 * - Job-based execution for long-running transactions
 * - Isolation level configuration
 * - Transaction timeout configuration
 * - Deadlock detection and retry
 * - Transaction metrics and logging
 */

export { UnitOfWork, TransactionContext } from './unit-of-work.interface.js';
export { PrismaUnitOfWork } from './prisma-unit-of-work.js';

