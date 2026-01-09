import { MarketplaceType } from '@prisma/client';
import { createMarketplaceIntegration } from './integration-index.js';
import { decrypt } from './encryption.js';

/**
 * Get decrypted integration config for marketplace usage
 */
export function getDecryptedIntegrationConfig(integration: any) {
  return {
    apiUrl: integration.apiUrl || '',
    apiKey: integration.apiKey ? decrypt(integration.apiKey) : undefined,
    apiSecret: integration.apiSecret ? decrypt(integration.apiSecret) : undefined,
    sellerId: integration.sellerId || undefined,
    accessToken: integration.accessToken ? decrypt(integration.accessToken) : undefined,
    refreshToken: integration.refreshToken ? decrypt(integration.refreshToken) : undefined,
    settings: integration.settings as Record<string, any> | undefined,
  };
}

/**
 * Create marketplace integration with decrypted credentials
 */
export function createMarketplaceIntegrationWithDecryption(
  type: MarketplaceType,
  integration: any
) {
  const config = getDecryptedIntegrationConfig(integration);
  return createMarketplaceIntegration(type, config);
}

