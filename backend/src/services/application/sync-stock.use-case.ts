/**
 * Sync Stock Use Case
 * 
 * Application layer use case for synchronizing stock to marketplace.
 * 
 * Architecture:
 * - Orchestrates marketplace adapter and repository calls
 * - Handles stock synchronization workflow
 * - Returns sync results
 * - Uses AdapterExecutor for robust adapter execution
 * 
 * Transaction Boundary:
 * - Adapter calls are OUTSIDE UnitOfWork transactions
 * - DB writes remain inside UnitOfWork
 * - This prevents adapter timeouts from blocking database transactions
 */

import { IStockRepository } from '../../../repositories/stock.repository.interface.js';
import { IProductRepository } from '../../../repositories/product.repository.interface.js';
import { IMarketplaceConnectionRepository } from '../../../repositories/marketplace-connection.repository.interface.js';
import { MarketplaceAdapter } from '../../../contracts/marketplace.contract.js';
import { CompanyId } from '../../../domain/value-objects/ids.vo.js';
import { AdapterExecutor, defaultRetryPolicy, createAdapterContext } from '../../../infrastructure/adapters/runtime/index.js';
import { UnitOfWork } from '../../../infrastructure/unit-of-work/index.js';
import { mapAdapterErrorToDomainError } from './adapter-error-mapper.js';
import { IntegrationDisabledError } from '../../../errors/integration-disabled.error.js';
import { env } from '../../../config/env.js';

export interface SyncStockInput {
  integrationId: string;
  companyId: string;
  productIds?: string[];
  warehouseId?: string;
}

export interface SyncStockOutput {
  synced: number;
  failed: number;
  errors: Array<{ productId: string; error: string }>;
}

export class SyncStockUseCase {
  constructor(
    private readonly stockRepository: IStockRepository,
    private readonly productRepository: IProductRepository,
    private readonly marketplaceConnectionRepository: IMarketplaceConnectionRepository,
    private readonly marketplaceAdapter: MarketplaceAdapter,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(input: SyncStockInput): Promise<SyncStockOutput> {
    // v3.1 HARD RESET: Disable stock sync
    if (env.INTEGRATIONS_DISABLED) {
      throw new IntegrationDisabledError();
    }

    // TODO: Add validation
    // TODO: Add batch processing

    // Get marketplace connection (read operation, no transaction needed)
    const connection = await this.marketplaceConnectionRepository.findByIdAndCompany(
      input.integrationId,
      input.companyId
    );

    if (!connection) {
      throw new Error(`Marketplace connection not found: ${input.integrationId}`);
    }

    // Check if connection is read-only
    if (connection.isReadOnly) {
      throw new Error('Marketplace connection is read-only');
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
    // TRANSACTION BOUNDARY: Database reads (no transaction needed)
    // ============================================================
    // Get products to sync
    // TODO: If productIds provided, get those products
    // TODO: Otherwise, get all active products for company

    // Get stock for each product
    // TODO: Build stock update payloads
    const stockUpdates: any[] = []; // TODO: Build actual stock update payloads

    // ============================================================
    // TRANSACTION BOUNDARY: Adapter calls are OUTSIDE transactions
    // ============================================================
    // Execute adapter operation via executor (with retry logic)
    // This call is OUTSIDE any database transaction to prevent
    // adapter timeouts from blocking database transactions
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

    // ============================================================
    // TRANSACTION BOUNDARY: Database writes are INSIDE transaction
    // ============================================================
    // All database write operations are wrapped in a transaction
    // to ensure atomicity and consistency
    return await this.unitOfWork.withTransaction(async (tx) => {
      // TODO: Handle errors per product
      const synced = 0;
      const failed = 0;
      const errors: Array<{ productId: string; error: string }> = [];

      // Update lastSyncAt on connection using transactional repository
      await tx.marketplaceConnectionRepository.updateLastSyncAt(
        input.integrationId,
        new Date()
      );

      return { synced, failed, errors };
    });
  }
}

