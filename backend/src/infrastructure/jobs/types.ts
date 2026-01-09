/**
 * Job Types and Payloads
 * 
 * Type-safe definitions for all background jobs.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Defines job names and payload structures
 * - Used by queue and processors
 */

/**
 * Job Type Names
 */
export enum JobType {
  SYNC_ORDERS = 'sync-orders',
  SYNC_STOCK = 'sync-stock',
  SYNC_MARKETPLACE = 'sync-marketplace',
}

/**
 * Base Job Payload
 * Common fields for all job payloads
 */
export interface BaseJobPayload {
  /**
   * Company ID (for multi-tenant isolation)
   */
  companyId: string;

  /**
   * Marketplace connection/integration ID
   */
  integrationId: string;
}

/**
 * Sync Orders Job Payload
 */
export interface SyncOrdersJobPayload extends BaseJobPayload {
  /**
   * Optional start date for syncing orders
   */
  startDate?: string; // ISO string

  /**
   * Optional end date for syncing orders
   */
  endDate?: string; // ISO string
}

/**
 * Sync Stock Job Payload
 */
export interface SyncStockJobPayload extends BaseJobPayload {
  /**
   * Optional product IDs to sync (if not provided, sync all)
   */
  productIds?: string[];

  /**
   * Optional warehouse ID to sync stock for
   */
  warehouseId?: string;
}

/**
 * Sync Marketplace Job Payload
 */
export interface SyncMarketplaceJobPayload extends BaseJobPayload {
  /**
   * Whether to sync products
   */
  syncProducts?: boolean;

  /**
   * Whether to sync orders
   */
  syncOrders?: boolean;

  /**
   * Whether to sync stock
   */
  syncStock?: boolean;

  /**
   * Optional start date for syncing
   */
  startDate?: string; // ISO string

  /**
   * Optional end date for syncing
   */
  endDate?: string; // ISO string
}

/**
 * Job Result
 * Standard structure for job execution results
 */
export interface JobResult<T = unknown> {
  /**
   * Whether the job completed successfully
   */
  success: boolean;

  /**
   * Result data (if successful)
   */
  data?: T;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Execution metadata
   */
  metadata?: {
    executionTimeMs: number;
    attempts?: number;
    [key: string]: unknown;
  };
}

