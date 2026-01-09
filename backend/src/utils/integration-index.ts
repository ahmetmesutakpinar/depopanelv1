import { MarketplaceType } from '@prisma/client';
import { BaseMarketplaceIntegration, MarketplaceConfig, SyncMode, IntegrationSettings } from './integration-base.js';
import { WooCommerceIntegration } from './integration-woocommerce.js';
import { TrendyolIntegration } from './integration-trendyol.js';
import { PazaramaIntegration } from './integration-pazarama.js';
import { N11Integration } from './integration-n11.js';
import { HepsiburadaIntegration } from './integration-hepsiburada.js';
import { AmazonIntegration } from './integration-amazon.js';
import { MiddlewareIntegration, createMiddleware } from './integration-middleware.js';

export * from './integration-base.js';
export * from './integration-woocommerce.js';
export * from './integration-trendyol.js';
export * from './integration-pazarama.js';
export * from './integration-n11.js';
export * from './integration-hepsiburada.js';
export * from './integration-amazon.js';
export * from './integration-middleware.js';

/**
 * Marketplace integration factory
 */
export function createMarketplaceIntegration(
  type: MarketplaceType,
  config: MarketplaceConfig
): BaseMarketplaceIntegration {
  const settings = config.settings as IntegrationSettings | undefined;
  
  // Middleware kullanılıyorsa
  if (settings?.syncMode === SyncMode.MIDDLEWARE && settings.middlewareType) {
    const safeConfig = {
      apiUrl: settings.middlewareConfig?.apiUrl ?? '',
      apiKey: settings.middlewareConfig?.apiKey ?? '',
      apiSecret: settings.middlewareConfig?.apiSecret ?? '',
    };
    const middleware = createMiddleware(settings.middlewareType, safeConfig);
    return new MiddlewareIntegration(middleware);
  }
  
  // Normal direct API entegrasyonu
  switch (type) {
    case 'WOOCOMMERCE':
      return new WooCommerceIntegration(config);
    case 'TRENDYOL':
      return new TrendyolIntegration(config);
    case 'HEPSIBURADA':
      return new HepsiburadaIntegration(config);
    case 'N11':
      return new N11Integration(config);
    case 'PAZARAMA':
      return new PazaramaIntegration(config);
    case 'AMAZON':
      return new AmazonIntegration(config);
    case 'SHOPIFY':
      // TODO: Implement ShopifyIntegration
      throw new Error('Shopify entegrasyonu henüz hazır değil');
    case 'IKAS':
      // TODO: Implement IkasIntegration
      throw new Error('Ikas entegrasyonu henüz hazır değil');
    default:
      throw new Error(`Desteklenmeyen marketplace: ${type}`);
  }
}
