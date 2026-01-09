/**
 * Dependency Injection Container
 * 
 * Composition root that provides resolved dependencies.
 * This is the single entry point for getting use cases and repositories.
 * 
 * Architecture:
 * - Centralized dependency resolution
 * - Explicit wiring (no magic)
 * - Infrastructure layer only
 * - Keeps business logic isolated
 * 
 * Usage:
 * ```ts
 * import { container } from './infrastructure/di/container.js';
 * 
 * const useCase = container.getCreateProductUseCase();
 * const result = await useCase.execute(input);
 * ```
 */

import { repositoryBindings, useCaseBindings, createMarketplaceAdapter, unitOfWorkBinding } from './bindings.js';
import { MarketplaceType } from '@prisma/client';
import { MarketplaceAdapter } from '../../contracts/marketplace.contract.js';
import { UnitOfWork } from '../unit-of-work/unit-of-work.interface.js';

/**
 * Dependency Injection Container
 * 
 * Provides access to all resolved dependencies.
 * All dependencies are created lazily (on-demand).
 */
export class Container {
  /**
   * Get Product Repository
   */
  getProductRepository() {
    return repositoryBindings.getProductRepository();
  }

  /**
   * Get Order Repository
   */
  getOrderRepository() {
    return repositoryBindings.getOrderRepository();
  }

  /**
   * Get Stock Repository
   */
  getStockRepository() {
    return repositoryBindings.getStockRepository();
  }

  /**
   * Get Company Repository
   */
  getCompanyRepository() {
    return repositoryBindings.getCompanyRepository();
  }

  /**
   * Get Marketplace Connection Repository
   */
  getMarketplaceConnectionRepository() {
    return repositoryBindings.getMarketplaceConnectionRepository();
  }

  /**
   * Get Product Use Cases
   */
  getGetProductByIdUseCase() {
    return useCaseBindings.getGetProductByIdUseCase();
  }

  getCreateProductUseCase() {
    return useCaseBindings.getCreateProductUseCase();
  }

  getUpdateProductUseCase() {
    return useCaseBindings.getUpdateProductUseCase();
  }

  /**
   * Get Order Use Cases
   */
  getGetOrderByIdUseCase() {
    return useCaseBindings.getGetOrderByIdUseCase();
  }

  getCreateOrderUseCase() {
    return useCaseBindings.getCreateOrderUseCase();
  }

  /**
   * Get Sync Orders Use Case
   * 
   * Note: Requires marketplace adapter to be created first
   * TODO: Create adapter resolver that gets adapter from connection
   */
  getSyncOrdersUseCase(adapter: MarketplaceAdapter) {
    return useCaseBindings.getSyncOrdersUseCase(adapter);
  }

  /**
   * Get Stock Use Cases
   */
  getUpdateStockUseCase() {
    return useCaseBindings.getUpdateStockUseCase();
  }

  /**
   * Get Sync Stock Use Case
   * 
   * Note: Requires marketplace adapter to be created first
   * TODO: Create adapter resolver that gets adapter from connection
   */
  getSyncStockUseCase(adapter: MarketplaceAdapter) {
    return useCaseBindings.getSyncStockUseCase(adapter);
  }

  /**
   * Get Marketplace Use Cases
   */
  getConnectMarketplaceUseCase(adapter: MarketplaceAdapter) {
    return useCaseBindings.getConnectMarketplaceUseCase(adapter);
  }

  /**
   * Get Sync Marketplace Use Case
   * 
   * Note: Requires marketplace adapter to be created first
   * TODO: Create adapter resolver that gets adapter from connection
   */
  getSyncMarketplaceUseCase(adapter: MarketplaceAdapter) {
    return useCaseBindings.getSyncMarketplaceUseCase(adapter);
  }

  /**
   * Create Marketplace Adapter
   * 
   * Factory method to create marketplace adapters based on type and config.
   * This is used by use cases that need marketplace adapters.
   * 
   * TODO: Move this to a separate adapter factory service
   */
  createMarketplaceAdapter(
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
    return createMarketplaceAdapter(type, config);
  }
}

/**
 * Default Container Instance
 * 
 * This is the singleton container instance that should be used throughout the application.
 * Controllers and services should use this instance to get use cases.
 */
export const container = new Container();

/**
 * Container Factory
 * 
 * Creates a new container instance.
 * Useful for testing or when you need multiple container instances.
 */
export function createContainer(): Container {
  return new Container();
}

