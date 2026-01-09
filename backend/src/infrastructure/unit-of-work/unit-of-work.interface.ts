/**
 * Unit of Work Interface
 * 
 * Defines the contract for transaction management.
 * This abstraction allows use cases to group multiple repository operations
 * into a single atomic transaction.
 * 
 * Architecture:
 * - Application layer depends on this interface (Dependency Inversion)
 * - Infrastructure layer provides Prisma implementation
 * - Keeps transaction logic isolated from business logic
 * 
 * Usage:
 * ```ts
 * const result = await unitOfWork.withTransaction(async (tx) => {
 *   const product = await tx.productRepository.create(...);
 *   const stock = await tx.stockRepository.create(...);
 *   return { product, stock };
 * });
 * ```
 */

import { IProductRepository } from '../../../repositories/product.repository.interface.js';
import { IOrderRepository } from '../../../repositories/order.repository.interface.js';
import { IStockRepository } from '../../../repositories/stock.repository.interface.js';
import { ICompanyRepository } from '../../../repositories/company.repository.interface.js';
import { IMarketplaceConnectionRepository } from '../../../repositories/marketplace-connection.repository.interface.js';

/**
 * Transaction Context
 * 
 * Provides access to repositories bound to the same transaction.
 * All repository operations within this context will be part of the same transaction.
 */
export interface TransactionContext {
  /**
   * Product repository bound to transaction
   */
  productRepository: IProductRepository;

  /**
   * Order repository bound to transaction
   */
  orderRepository: IOrderRepository;

  /**
   * Stock repository bound to transaction
   */
  stockRepository: IStockRepository;

  /**
   * Company repository bound to transaction
   */
  companyRepository: ICompanyRepository;

  /**
   * Marketplace connection repository bound to transaction
   */
  marketplaceConnectionRepository: IMarketplaceConnectionRepository;
}

/**
 * Unit of Work Interface
 * 
 * Manages database transactions and provides transactional repository access.
 */
export interface UnitOfWork {
  /**
   * Execute a function within a database transaction.
   * 
   * All repository operations performed within the callback will be part of
   * the same transaction. If any operation fails, the entire transaction
   * will be rolled back.
   * 
   * @param fn Function to execute within transaction
   * @returns Promise resolving to the function's return value
   * 
   * @example
   * ```ts
   * const result = await unitOfWork.withTransaction(async (tx) => {
   *   const product = await tx.productRepository.create(productData);
   *   const stock = await tx.stockRepository.createStock(product.id, stockData);
   *   return { product, stock };
   * });
   * ```
   */
  withTransaction<T>(
    fn: (tx: TransactionContext) => Promise<T>
  ): Promise<T>;
}

