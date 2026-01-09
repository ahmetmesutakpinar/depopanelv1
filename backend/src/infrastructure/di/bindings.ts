/**
 * Dependency Injection Bindings
 * 
 * Defines how dependencies are wired together.
 * This is the composition root where all dependencies are registered.
 * 
 * Architecture:
 * - Centralized dependency registration
 * - Explicit wiring (no magic)
 * - Infrastructure layer only
 * - Keeps business logic isolated
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/index.js';
import { MarketplaceConfig } from '../../contracts/marketplace.contract.js';

// Repository Implementations
import { PrismaProductRepository } from '../prisma/repositories/prisma-product.repository.js';
import { PrismaOrderRepository } from '../prisma/repositories/prisma-order.repository.js';
import { PrismaStockRepository } from '../prisma/repositories/prisma-stock.repository.js';
import { PrismaCompanyRepository } from '../prisma/repositories/prisma-company.repository.js';
import { PrismaMarketplaceConnectionRepository } from '../prisma/repositories/prisma-marketplace-connection.repository.js';

// Repository Interfaces
import { IProductRepository } from '../../repositories/product.repository.interface.js';
import { IOrderRepository } from '../../repositories/order.repository.interface.js';
import { IStockRepository } from '../../repositories/stock.repository.interface.js';
import { ICompanyRepository } from '../../repositories/company.repository.interface.js';
import { IMarketplaceConnectionRepository } from '../../repositories/marketplace-connection.repository.interface.js';

// Use Cases
import { GetProductByIdUseCase } from '../../services/application/get-product-by-id.use-case.js';
import { CreateProductUseCase } from '../../services/application/create-product.use-case.js';
import { UpdateProductUseCase } from '../../services/application/update-product.use-case.js';
import { GetOrderByIdUseCase } from '../../services/application/get-order-by-id.use-case.js';
import { CreateOrderUseCase } from '../../services/application/create-order.use-case.js';
import { SyncOrdersUseCase } from '../../services/application/sync-orders.use-case.js';
import { UpdateStockUseCase } from '../../services/application/update-stock.use-case.js';
import { SyncStockUseCase } from '../../services/application/sync-stock.use-case.js';
import { ConnectMarketplaceUseCase } from '../../services/application/connect-marketplace.use-case.js';
import { SyncMarketplaceUseCase } from '../../services/application/sync-marketplace.use-case.js';

// Marketplace Adapter Contract
import { MarketplaceAdapter } from '../../contracts/marketplace.contract.js';

// Marketplace Integration Factory
import { createMarketplaceIntegration, BaseMarketplaceIntegration } from '../../utils/integration-index.js';
import { MarketplaceType } from '@prisma/client';
import { IntegrationDisabledError } from '../../errors/integration-disabled.error.js';
import { env } from '../../config/env.js';

// Unit of Work
import { UnitOfWork } from '../unit-of-work/unit-of-work.interface.js';
import { PrismaUnitOfWork } from '../unit-of-work/prisma-unit-of-work.js';

/**
 * Repository Bindings
 * Maps repository interfaces to their Prisma implementations
 */
export const repositoryBindings = {
  /**
   * Get Product Repository implementation
   */
  getProductRepository(): IProductRepository {
    return new PrismaProductRepository(prisma);
  },

  /**
   * Get Order Repository implementation
   */
  getOrderRepository(): IOrderRepository {
    return new PrismaOrderRepository(prisma);
  },

  /**
   * Get Stock Repository implementation
   */
  getStockRepository(): IStockRepository {
    return new PrismaStockRepository(prisma);
  },

  /**
   * Get Company Repository implementation
   */
  getCompanyRepository(): ICompanyRepository {
    return new PrismaCompanyRepository(prisma);
  },

  /**
   * Get Marketplace Connection Repository implementation
   */
  getMarketplaceConnectionRepository(): IMarketplaceConnectionRepository {
    return new PrismaMarketplaceConnectionRepository(prisma);
  },
};

/**
 * Marketplace Adapter Factory
 * Creates marketplace adapter instances based on type and config
 * 
 * DISABLED v3.1: API integrations hard reset
 * TODO: Re-enable when re-adding integrations from scratch
 */
export function createMarketplaceAdapter(
  type: MarketplaceType,
  config: {
    apiUrl?: string;
    apiKey?: string;
    apiSecret?: string;
    sellerId?: string;
    accessToken?: string;
    refreshToken?: string;
    settings?: any;
  }
): MarketplaceAdapter {
  // v3.1 HARD RESET: Disable all marketplace adapter creation
  if (env.INTEGRATIONS_DISABLED) {
    throw new IntegrationDisabledError();
  }

  // DISABLED - Original implementation commented out for v3.1 reset
  // TODO: Re-enable when re-adding integrations from scratch
  /*
  // TODO: Wrap BaseMarketplaceIntegration to implement MarketplaceAdapter interface
  // For now, we'll create the integration and wrap it
  // createMarketplaceIntegration expects MarketplaceConfig from integration-base
  // which requires apiUrl to be string (not undefined)
  const marketplaceConfig = {
    apiUrl: config.apiUrl || '',
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    supplierId: config.sellerId,
    ...config.settings,
  } as any; // Type assertion needed due to different MarketplaceConfig types
  const integration = createMarketplaceIntegration(type, marketplaceConfig);
  
  // Create adapter wrapper that implements MarketplaceAdapter
  return {
    async testConnection(): Promise<void> {
      // TODO: Call integration testConnection method
      await (integration as any).testConnection?.();
    },
    
    async syncProducts(startDate?: Date): Promise<any> {
      // TODO: Call integration syncProducts method and map result
      return (integration as any).syncProducts?.(startDate) || { synced: 0, failed: 0 };
    },
    
    async syncOrders(startDate?: Date): Promise<any> {
      // TODO: Call integration syncOrders method and map result
      return (integration as any).syncOrders?.(startDate) || { synced: 0, failed: 0, orders: [] };
    },
    
    async updateStock(updates: any[]): Promise<void> {
      // TODO: Call integration updateStock method
      await (integration as any).updateStock?.(updates);
    },
    
    async updatePrice(updates: any[]): Promise<void> {
      // TODO: Call integration updatePrice method
      await (integration as any).updatePrice?.(updates);
    },
  };
  */
  
  // This code path should never be reached if INTEGRATIONS_DISABLED is true
  // but TypeScript requires a return statement
  throw new IntegrationDisabledError();
}

/**
 * Use Case Bindings
 * Maps use cases to their implementations with dependencies injected
 */
export const useCaseBindings = {
  /**
   * Get Product By ID Use Case
   */
  getGetProductByIdUseCase(): GetProductByIdUseCase {
    return new GetProductByIdUseCase(
      repositoryBindings.getProductRepository()
    );
  },

  /**
   * Create Product Use Case
   */
  getCreateProductUseCase(): CreateProductUseCase {
    return new CreateProductUseCase(
      repositoryBindings.getProductRepository()
    );
  },

  /**
   * Update Product Use Case
   */
  getUpdateProductUseCase(): UpdateProductUseCase {
    return new UpdateProductUseCase(
      repositoryBindings.getProductRepository()
    );
  },

  /**
   * Get Order By ID Use Case
   */
  getGetOrderByIdUseCase(): GetOrderByIdUseCase {
    return new GetOrderByIdUseCase(
      repositoryBindings.getOrderRepository()
    );
  },

  /**
   * Create Order Use Case
   */
  getCreateOrderUseCase(): CreateOrderUseCase {
    return new CreateOrderUseCase(
      repositoryBindings.getOrderRepository()
    );
  },

  /**
   * Sync Orders Use Case
   * 
   * Note: Marketplace adapter is created dynamically based on integration
   * TODO: Inject adapter factory or use adapter resolver
   */
  getSyncOrdersUseCase(adapter: MarketplaceAdapter): SyncOrdersUseCase {
    return new SyncOrdersUseCase(
      repositoryBindings.getOrderRepository(),
      repositoryBindings.getMarketplaceConnectionRepository(),
      adapter,
      unitOfWorkBinding.getUnitOfWork()
    );
  },

  /**
   * Update Stock Use Case
   */
  getUpdateStockUseCase(): UpdateStockUseCase {
    return new UpdateStockUseCase(
      repositoryBindings.getStockRepository()
    );
  },

  /**
   * Sync Stock Use Case
   * 
   * Note: Marketplace adapter is created dynamically based on integration
   * TODO: Inject adapter factory or use adapter resolver
   */
  getSyncStockUseCase(adapter: MarketplaceAdapter): SyncStockUseCase {
    return new SyncStockUseCase(
      repositoryBindings.getStockRepository(),
      repositoryBindings.getProductRepository(),
      repositoryBindings.getMarketplaceConnectionRepository(),
      adapter,
      unitOfWorkBinding.getUnitOfWork()
    );
  },

  /**
   * Connect Marketplace Use Case
   * 
   * Note: Marketplace adapter is created dynamically based on integration type
   * TODO: Inject adapter factory or use adapter resolver
   */
  getConnectMarketplaceUseCase(adapter: MarketplaceAdapter): ConnectMarketplaceUseCase {
    return new ConnectMarketplaceUseCase(
      repositoryBindings.getMarketplaceConnectionRepository(),
      adapter,
      unitOfWorkBinding.getUnitOfWork()
    );
  },

  /**
   * Sync Marketplace Use Case
   * 
   * Note: Marketplace adapter is created dynamically based on integration
   * TODO: Inject adapter factory or use adapter resolver
   */
  getSyncMarketplaceUseCase(adapter: MarketplaceAdapter): SyncMarketplaceUseCase {
    return new SyncMarketplaceUseCase(
      repositoryBindings.getProductRepository(),
      repositoryBindings.getOrderRepository(),
      repositoryBindings.getMarketplaceConnectionRepository(),
      adapter,
      unitOfWorkBinding.getUnitOfWork()
    );
  },
};

/**
 * Transaction Manager
 * TODO: Implement transaction support
 * This will be used to wrap use case executions in database transactions
 */
export interface ITransactionManager {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Logger
 * TODO: Inject logger for use cases
 * This will be used for logging use case executions
 */
export interface IUseCaseLogger {
  log(level: string, message: string, data?: any): void;
}

/**
 * Unit of Work Binding
 * Provides transaction management
 */
export const unitOfWorkBinding = {
  /**
   * Get Unit of Work implementation
   */
  getUnitOfWork(): UnitOfWork {
    return new PrismaUnitOfWork(prisma);
  },
};

