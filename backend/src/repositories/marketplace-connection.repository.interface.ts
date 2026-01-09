/**
 * MarketplaceConnection Repository Interface
 * 
 * Defines the contract for marketplace connection/integration persistence operations.
 * This interface is implementation-agnostic and depends only on domain entities.
 * 
 * Architecture:
 * - Domain layer depends on this interface (Dependency Inversion Principle)
 * - Infrastructure layer provides concrete implementation (Prisma-based)
 * - No Prisma types or infrastructure details exposed
 */

import { MarketplaceConnection, MarketplaceType, IntegrationStatus } from '../domain/entities/marketplace-connection.entity.js';
import { CompanyId } from '../domain/value-objects/ids.vo.js';

/**
 * Options for finding marketplace connections
 */
export interface FindConnectionsOptions {
  skip?: number;
  take?: number;
  type?: MarketplaceType;
  status?: IntegrationStatus;
  search?: string;
}

/**
 * MarketplaceConnection Repository Interface
 * 
 * Defines all marketplace connection persistence operations using domain entities.
 */
export interface IMarketplaceConnectionRepository {
  /**
   * Find connection by ID and company (for multi-tenant security)
   */
  findByIdAndCompany(id: string, companyId: CompanyId | string): Promise<MarketplaceConnection | null>;

  /**
   * Find connection by type and company
   */
  findByTypeAndCompany(type: MarketplaceType, companyId: CompanyId | string): Promise<MarketplaceConnection | null>;

  /**
   * Find all connections for a company
   */
  findByCompany(companyId: CompanyId | string, options?: FindConnectionsOptions): Promise<{
    connections: MarketplaceConnection[];
    total: number;
  }>;

  /**
   * Create a new marketplace connection
   */
  create(connection: MarketplaceConnection): Promise<MarketplaceConnection>;

  /**
   * Update an existing marketplace connection
   */
  update(id: string, connection: Partial<MarketplaceConnection>): Promise<MarketplaceConnection>;

  /**
   * Delete a marketplace connection
   */
  delete(id: string): Promise<void>;

  /**
   * Update last sync timestamp
   */
  updateLastSyncAt(id: string, lastSyncAt: Date): Promise<void>;
}

