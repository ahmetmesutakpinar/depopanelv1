/**
 * Marketplace Middleware Integration
 * 
 * Middleware adapter pattern for third-party integration services
 * (e.g., Sopyo) that act as intermediaries between WMS and marketplaces
 */

import {
  BaseMarketplaceIntegration,
  MarketplaceConfig,
  MarketplaceCapabilities,
  OrderSyncData,
  ProductSyncData,
  StockUpdateData,
  IntegrationLogContext,
} from './integration-base.js';
import { MarketplaceType } from '@prisma/client';
import { logger } from './logger.js';
import axios, { AxiosInstance } from 'axios';

/**
 * Middleware configuration interface
 */
export interface MiddlewareConfig {
  apiUrl: string;
  apiKey?: string;
  apiSecret?: string;
  [key: string]: any;
}

/**
 * Marketplace Middleware interface
 * All middleware implementations must implement this interface
 */
export interface MarketplaceMiddleware {
  name: string;
  testConnection(): Promise<boolean>;
  fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]>;
  syncProducts(): Promise<ProductSyncData[]>;
  updateStock(updates: StockUpdateData[]): Promise<{ success: number; failed: number }>;
}

/**
 * Sopyo Middleware Configuration
 */
export interface SopyoConfig extends MiddlewareConfig {
  apiUrl: string;
  apiKey: string;
  apiSecret?: string;
}

/**
 * Sopyo Middleware Implementation
 * 
 * Example implementation for Sopyo integration service
 * This is a placeholder - actual implementation should be based on Sopyo API documentation
 */
export class SopyoMiddleware implements MarketplaceMiddleware {
  public readonly name = 'Sopyo';
  private client: AxiosInstance;
  private config: SopyoConfig;

  constructor(config: SopyoConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: config.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      timeout: 30000,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      // Placeholder: Replace with actual Sopyo API endpoint
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error: any) {
      logger.error('[Sopyo] Connection test failed:', error.message);
      return false;
    }
  }

  async fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]> {
    try {
      // Placeholder: Replace with actual Sopyo API endpoint
      const params: any = {};
      if (startDate) params.startDate = startDate.toISOString();
      if (endDate) params.endDate = endDate.toISOString();
      
      const response = await this.client.get('/orders', { params });
      
      // Placeholder: Map Sopyo response to OrderSyncData format
      // This should be implemented based on actual Sopyo API response structure
      return (response.data?.orders || []).map((order: any) => ({
        marketplaceOrderId: order.id || '',
        orderNumber: order.orderNumber || order.id || '',
        customerName: order.customer?.name || '',
        customerEmail: order.customer?.email,
        customerPhone: order.customer?.phone,
        shippingAddress: order.shipping?.address || '',
        shippingCity: order.shipping?.city,
        shippingDistrict: order.shipping?.district,
        shippingPostalCode: order.shipping?.postalCode,
        items: (order.items || []).map((item: any) => ({
          sku: item.sku || '',
          name: item.name || '',
          quantity: item.quantity || 0,
          unitPrice: item.price || 0,
          taxRate: item.taxRate,
          barcode: item.barcode,
        })),
        subtotal: order.subtotal || 0,
        taxAmount: order.taxAmount || 0,
        shippingCost: order.shippingCost || 0,
        discount: order.discount || 0,
        total: order.total || 0,
        customerNote: order.note,
        createdAt: new Date(order.createdAt || Date.now()),
        status: order.status,
      }));
    } catch (error: any) {
      logger.error('[Sopyo] Fetch orders failed:', error.message);
      throw new Error(`[Sopyo] Sipariş çekme hatası: ${error.message}`);
    }
  }

  async syncProducts(): Promise<ProductSyncData[]> {
    try {
      // Placeholder: Replace with actual Sopyo API endpoint
      const response = await this.client.get('/products');
      
      // Placeholder: Map Sopyo response to ProductSyncData format
      return (response.data?.products || []).map((product: any) => ({
        sku: product.sku || '',
        name: product.name || '',
        price: product.price || 0,
        stock: product.stock || 0,
        barcode: product.barcode,
        gtin: product.gtin,
        description: product.description,
        imageUrl: product.imageUrl,
        marketplaceId: product.marketplaceId,
      }));
    } catch (error: any) {
      logger.error('[Sopyo] Sync products failed:', error.message);
      throw new Error(`[Sopyo] Ürün senkronizasyonu hatası: ${error.message}`);
    }
  }

  async updateStock(updates: StockUpdateData[]): Promise<{ success: number; failed: number }> {
    try {
      // Placeholder: Replace with actual Sopyo API endpoint
      const payload = updates.map(update => ({
        sku: update.sku,
        quantity: update.quantity,
        marketplaceProductId: update.marketplaceProductId,
        barcode: update.barcode,
      }));

      const response = await this.client.post('/stock/update', { updates: payload });
      
      // Placeholder: Parse response to get success/failed counts
      const result = response.data || {};
      return {
        success: result.success || updates.length,
        failed: result.failed || 0,
      };
    } catch (error: any) {
      logger.error('[Sopyo] Update stock failed:', error.message);
      throw new Error(`[Sopyo] Stok güncelleme hatası: ${error.message}`);
    }
  }
}

/**
 * Middleware Integration Wrapper
 * 
 * Wraps a middleware implementation to work as a BaseMarketplaceIntegration
 */
export class MiddlewareIntegration extends BaseMarketplaceIntegration {
  private middleware: MarketplaceMiddleware;
  
  readonly capabilities: MarketplaceCapabilities = {
    orders: true,
    stock: true,
    products: true,
  };

  constructor(middleware: MarketplaceMiddleware) {
    // Use a placeholder type - middleware doesn't map to a specific marketplace
    super('WOOCOMMERCE' as MarketplaceType, { apiUrl: '' });
    this.middleware = middleware;
  }

  async testConnection(): Promise<boolean> {
    return this.middleware.testConnection();
  }

  async fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]> {
    return this.middleware.fetchOrders(startDate, endDate);
  }

  async syncProducts(): Promise<ProductSyncData[]> {
    return this.middleware.syncProducts();
  }

  async updateStock(data: StockUpdateData[]): Promise<{ success: number; failed: number }> {
    return this.middleware.updateStock(data);
  }
}

/**
 * Create middleware instance based on type
 */
export function createMiddleware(
  type: 'SOPYO' | 'CUSTOM',
  config?: MiddlewareConfig
): MarketplaceMiddleware {
  if (!config) {
    throw new Error('Middleware config is required');
  }

  switch (type) {
    case 'SOPYO':
      if (!config.apiUrl || !config.apiKey) {
        throw new Error('Sopyo middleware requires apiUrl and apiKey');
      }
      return new SopyoMiddleware(config as SopyoConfig);
    
    case 'CUSTOM':
      // Placeholder for custom middleware implementations
      throw new Error('Custom middleware not yet implemented');
    
    default:
      throw new Error(`Unknown middleware type: ${type}`);
  }
}

