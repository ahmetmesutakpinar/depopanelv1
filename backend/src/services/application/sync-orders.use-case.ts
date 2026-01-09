/**
 * Sync Orders Use Case
 * 
 * Application layer use case for synchronizing orders from marketplace.
 * 
 * Architecture:
 * - Orchestrates marketplace adapter and repository calls
 * - Handles order synchronization workflow
 * - Returns sync results
 * - Uses AdapterExecutor for robust adapter execution
 * 
 * Transaction Boundary:
 * - Adapter calls are OUTSIDE UnitOfWork transactions
 * - DB writes remain inside UnitOfWork
 * - This prevents adapter timeouts from blocking database transactions
 */

import { IOrderRepository } from '../../../repositories/order.repository.interface.js';
import { IMarketplaceConnectionRepository } from '../../../repositories/marketplace-connection.repository.interface.js';
import { MarketplaceAdapter } from '../../../contracts/marketplace.contract.js';
import { Order } from '../../../domain/entities/order.entity.js';
import { CompanyId } from '../../../domain/value-objects/ids.vo.js';
import { AdapterExecutor, defaultRetryPolicy, createAdapterContext } from '../../../infrastructure/adapters/runtime/index.js';
import { UnitOfWork } from '../../../infrastructure/unit-of-work/index.js';
import { mapAdapterErrorToDomainError } from './adapter-error-mapper.js';
import { AdapterError } from '../../../infrastructure/adapters/runtime/adapter-errors.js';
import { IntegrationDisabledError } from '../../../errors/integration-disabled.error.js';
import { env } from '../../../config/env.js';

export interface SyncOrdersInput {
  integrationId: string;
  companyId: string;
  startDate?: Date;
  endDate?: Date;
}

export interface SyncOrdersOutput {
  synced: number;
  failed: number;
  orders: Order[];
}

export class SyncOrdersUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly marketplaceConnectionRepository: IMarketplaceConnectionRepository,
    private readonly marketplaceAdapter: MarketplaceAdapter,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(input: SyncOrdersInput): Promise<SyncOrdersOutput> {
    // v3.1 HARD RESET: Disable order sync
    if (env.INTEGRATIONS_DISABLED) {
      throw new IntegrationDisabledError();
    }

    // TODO: Add validation
    // TODO: Add deduplication logic

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
    // Execute adapter operation via executor (with retry logic)
    // This call is OUTSIDE any database transaction to prevent
    // adapter timeouts from blocking database transactions
    let syncResult;
    try {
      syncResult = await executor.syncOrders(
        this.marketplaceAdapter,
        input.startDate
      );
    } catch (error) {
      // Map adapter errors to domain errors
      throw mapAdapterErrorToDomainError(error);
    }

    // Extract orders from sync result
    const marketplaceOrders = syncResult.result?.orders || [];

    // ============================================================
    // TRANSACTION BOUNDARY: Database writes are INSIDE transaction
    // ============================================================
    // All database write operations are wrapped in a transaction
    // to ensure atomicity and consistency
    return await this.unitOfWork.withTransaction(async (tx) => {
      // TODO: Map marketplace orders to domain entities
      // TODO: Check for duplicates
      // TODO: Create or update orders using tx.orderRepository
      // TODO: Handle errors per order

      const synced = 0;
      const failed = 0;
      const orders: Order[] = [];

      // Update lastSyncAt on connection using transactional repository
      await tx.marketplaceConnectionRepository.updateLastSyncAt(
        input.integrationId,
        new Date()
      );

      return { synced, failed, orders };
    });
  }
}

