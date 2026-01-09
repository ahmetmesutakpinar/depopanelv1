/**
 * MarketplaceConnection Domain Entity
 * 
 * Represents a connection/integration to a marketplace platform.
 * This is a pure domain model with no infrastructure dependencies.
 * 
 * Business Rules:
 * - Connection must have a marketplace type
 * - Connection must belong to a company
 * - Connection can be active or inactive
 * - Connection settings are marketplace-specific
 * 
 * TODO: Add validation logic
 * TODO: Add business methods (isConnected, canSync, etc.)
 */

export type MarketplaceType = 
  | 'WOOCOMMERCE'
  | 'TRENDYOL'
  | 'HEPSIBURADA'
  | 'N11'
  | 'PAZARAMA'
  | 'AMAZON';

export type IntegrationStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR';

export class MarketplaceConnection {
  id: string;
  companyId: string;
  type: MarketplaceType;
  name: string;
  status: IntegrationStatus;
  settings: Record<string, unknown> | null;
  lastSyncAt: Date | null;
  syncMode: 'AUTO' | 'MANUAL' | 'WEBHOOK' | 'MIDDLEWARE';
  isReadOnly: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: {
    id: string;
    companyId: string;
    type: MarketplaceType;
    name: string;
    status?: IntegrationStatus;
    settings?: Record<string, unknown> | null;
    lastSyncAt?: Date | null;
    syncMode?: 'AUTO' | 'MANUAL' | 'WEBHOOK' | 'MIDDLEWARE';
    isReadOnly?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = data.id;
    this.companyId = data.companyId;
    this.type = data.type;
    this.name = data.name;
    this.status = data.status ?? 'ACTIVE';
    this.settings = data.settings ?? null;
    this.lastSyncAt = data.lastSyncAt ?? null;
    this.syncMode = data.syncMode ?? 'AUTO';
    this.isReadOnly = data.isReadOnly ?? false;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /**
   * Check if connection is active
   * TODO: Implement business logic
   */
  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  /**
   * Check if connection can sync
   * TODO: Implement business logic
   */
  canSync(): boolean {
    return this.isActive() && !this.isReadOnly;
  }

  /**
   * Check if connection allows stock updates
   * TODO: Implement business logic
   */
  allowsStockUpdates(): boolean {
    return this.canSync() && !this.isReadOnly;
  }
}

