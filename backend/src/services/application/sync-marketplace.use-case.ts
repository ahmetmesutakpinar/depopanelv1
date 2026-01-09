/**
 * Sync Marketplace Use Case
 * 
 * Application layer use case for synchronizing products and orders from marketplace.
 * 
 * Architecture:
 * - Orchestrates marketplace adapter and repository calls
 * - Handles full marketplace synchronization workflow
 * - Returns sync results
 * - Uses AdapterExecutor for robust adapter execution
 * 
 * Transaction Boundary:
 * - Adapter calls are OUTSIDE UnitOfWork transactions
 * - DB writes remain inside UnitOfWork
 * - This prevents adapter timeouts from blocking database transactions
 */

import { IProductRepository } from '../../../repositories/product.repository.interface.js';
import { IOrderRepository } from '../../../repositories/order.repository.interface.js';
import { IMarketplaceConnectionRepository } from '../../../repositories/marketplace-connection.repository.interface.js';
import { MarketplaceAdapter } from '../../../contracts/marketplace.contract.js';
import { CompanyId } from '../../../domain/value-objects/ids.vo.js';
import { AdapterExecutor, defaultRetryPolicy, createAdapterContext } from '../../../infrastructure/adapters/runtime/index.js';
import { UnitOfWork } from '../../../infrastructure/unit-of-work/index.js';
import { mapAdapterErrorToDomainError } from './adapter-error-mapper.js';
import { IntegrationDisabledError } from '../../../errors/integration-disabled.error.js';
import { env } from '../../../config/env.js';

export interface SyncMarketplaceInput {
  integrationId: string;
  companyId: string;
  syncProducts?: boolean;
  syncOrders?: boolean;
  syncStock?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export interface SyncMarketplaceOutput {
  products: {
    synced: number;
    failed: number;
  };
  orders: {
    synced: number;
    failed: number;
  };
  stock: {
    synced: number;
    failed: number;
  };
}

export class SyncMarketplaceUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly marketplaceConnectionRepository: IMarketplaceConnectionRepository,
    private readonly marketplaceAdapter: MarketplaceAdapter,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(input: SyncMarketplaceInput): Promise<SyncMarketplaceOutput> {
    // v3.1 HARD RESET: Disable marketplace sync
    if (env.INTEGRATIONS_DISABLED) {
      throw new IntegrationDisabledError();
    }

    // TODO: Add validation
    // TODO: Add progress tracking

    // Get marketplace connection (read operation, no transaction needed)
    const connection = await this.marketplaceConnectionRepository.findByIdAndCompany(
      input.integrationId,
      input.companyId
    );

    if (!connection) {
      throw new Error(`Marketplace connection not found: ${input.integrationId}`);
    }

    // Extract credentials from connection settings
    const credentials = {
      apiUrl: connection.settings?.apiUrl as string | undefined,
      apiKey: connection.settings?.apiKey as string | undefined,
      apiSecret: connection.settings?.apiSecret as string | undefined,
      sellerId: connection.settings?.sellerId as string | undefined,
      accessToken: connection.settings?.accessToken as string | undefined,
      refreshToken: connection.settings?.refreshToken as string | undefined,
      tokenExpiry: connection.settings?.tokenExpiry as Date | undefined,
    };

    // Create adapter context from connection
    const context = createAdapterContext(
      connection.type,
      connection.companyId,
      connection.id,
      credentials,
      connection.settings as Record<string, unknown> | undefined
    );

    // Create adapter executor with retry policy
    const executor = new AdapterExecutor(defaultRetryPolicy, context);

    // ============================================================
    // TRANSACTION BOUNDARY: Adapter calls are OUTSIDE transactions
    // ============================================================
    // All adapter operations are executed OUTSIDE transactions
    // to prevent adapter timeouts from blocking database transactions

    // Sync products if requested
    if (input.syncProducts) {
      try {
        const syncResult = await executor.syncProducts(
          this.marketplaceAdapter,
          input.startDate
        );
        // TODO: Store sync result for later processing in transaction
      } catch (error) {
        // Map adapter errors to domain errors
        throw mapAdapterErrorToDomainError(error);
      }
    }

    // Sync orders if requested
    if (input.syncOrders) {
      try {
        const syncResult = await executor.syncOrders(
          this.marketplaceAdapter,
          input.startDate
        );
        // TODO: Store sync result for later processing in transaction
      } catch (error) {
        // Map adapter errors to domain errors
        throw mapAdapterErrorToDomainError(error);
      }
    }

    // Sync stock if requested
    if (input.syncStock && !connection.isReadOnly) {
      // TODO: Get products with stock
      // TODO: Build stock update payloads
      const stockUpdates: any[] = []; // TODO: Build actual stock update payloads
      
      if (stockUpdates.length > 0) {
        try {
          await executor.updateStock(
            this.marketplaceAdapter,
            stockUpdates
          );
        } catch (error) {
          // Map adapter errors to domain errors
          throw mapAdapterErrorToDomainError(error);
        }
      }
    }

    // ============================================================
    // TRANSACTION BOUNDARY: Database writes are INSIDE transaction
    // ============================================================
    // All database write operations are wrapped in a transaction
    // to ensure atomicity and consistency
    return await this.unitOfWork.withTransaction(async (tx) => {
      const result = {
        products: { synced: 0, failed: 0 },
        orders: { synced: 0, failed: 0 },
        stock: { synced: 0, failed: 0 },
      };

      // TODO: Map marketplace products to domain entities
      // TODO: Create or update products using tx.productRepository
      // TODO: Track success/failure

      // TODO: Map marketplace orders to domain entities
      // TODO: Create or update orders using tx.orderRepository
      // TODO: Track success/failure

      // TODO: Track stock sync success/failure

      // Update lastSyncAt on connection using transactional repository
      await tx.marketplaceConnectionRepository.updateLastSyncAt(
        input.integrationId,
        new Date()
      );

      return result;
    });
  }
}

