/**
 * Adapter Context
 * 
 * Context object that holds information needed for adapter execution.
 * This context is passed to adapters and used by the adapter executor.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - No business logic
 * - Used by adapter executor and adapters
 */

import { MarketplaceType } from '@prisma/client';

/**
 * Adapter Context
 * 
 * Contains all information needed to execute adapter operations.
 */
export interface AdapterContext {
  /**
   * Marketplace type (WOOCOMMERCE, TRENDYOL, etc.)
   */
  marketplaceType: MarketplaceType;

  /**
   * Company ID (for multi-tenant isolation)
   */
  companyId: string;

  /**
   * Integration ID
   */
  integrationId: string;

  /**
   * Adapter credentials
   */
  credentials: {
    apiUrl?: string;
    apiKey?: string;
    apiSecret?: string;
    sellerId?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: Date;
    [key: string]: unknown; // Allow additional credentials
  };

  /**
   * Integration settings
   */
  settings?: {
    syncMode?: string;
    isReadOnly?: boolean;
    middlewareType?: string;
    middlewareConfig?: Record<string, unknown>;
    [key: string]: unknown;
  };

  /**
   * Environment information
   */
  environment?: {
    nodeEnv: string;
    timeout?: number;
    retryEnabled?: boolean;
    [key: string]: unknown;
  };

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Create adapter context from integration data
 * 
 * TODO: Add token refresh hooks
 * TODO: Add credential encryption/decryption
 */
export function createAdapterContext(
  marketplaceType: MarketplaceType,
  companyId: string,
  integrationId: string,
  credentials: AdapterContext['credentials'],
  settings?: AdapterContext['settings']
): AdapterContext {
  return {
    marketplaceType,
    companyId,
    integrationId,
    credentials,
    settings,
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      timeout: parseInt(process.env.ADAPTER_TIMEOUT_MS || '30000', 10),
      retryEnabled: process.env.ADAPTER_RETRY_ENABLED !== 'false',
    },
  };
}

/**
 * Validate adapter context
 */
export function validateAdapterContext(context: AdapterContext): void {
  if (!context.marketplaceType) {
    throw new Error('Adapter context must have marketplaceType');
  }
  if (!context.companyId) {
    throw new Error('Adapter context must have companyId');
  }
  if (!context.integrationId) {
    throw new Error('Adapter context must have integrationId');
  }
}

