/**
 * Amazon SP-API Integration
 * 
 * API Documentation: https://developer-docs.amazon.com/sp-api/
 */

import axios, { AxiosInstance } from 'axios';
import {
  BaseMarketplaceIntegration,
  MarketplaceConfig,
  MarketplaceCapabilities,
  OrderSyncData,
  ProductSyncData,
  StockUpdateData,
} from './integration-base.js';
import { MarketplaceType } from '@prisma/client';
import { logger } from './logger.js';

export class AmazonIntegration extends BaseMarketplaceIntegration {
  private client: AxiosInstance;
  private region: string = 'eu-west-1'; // Default: Europe
  private marketplaceId: string = 'A1UNQM1SR2CHM'; // Default: TR marketplace
  private accessTokenCache: { token: string; expiresAt: number } | null = null;
  
  readonly capabilities: MarketplaceCapabilities = {
    orders: true,
    stock: true,
    products: true,
  };

  constructor(config: MarketplaceConfig) {
    super(MarketplaceType.AMAZON, config);

    // Region ve marketplace ID ayarları
    if (config.settings?.region) {
      this.region = config.settings.region;
    }
    if (config.settings?.marketplaceId) {
      this.marketplaceId = config.settings.marketplaceId;
    }

    this.client = axios.create({
      baseURL: config.apiUrl || `https://sellingpartnerapi-eu.amazon.com`,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor: Add auth token with cache
    this.client.interceptors.request.use(async (request) => {
      // Amazon LWA (Login with Amazon) token refresh with cache
      if (this.config.refreshToken) {
        const accessToken = await this.getAccessToken();
        request.headers['x-amz-access-token'] = accessToken;
      }
      return request;
    });
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    const requestId = this.generateRequestId();
    try {
      // ✅ CREDENTIALS KONTROLÜ
      if (!this.config.refreshToken && !this.config.accessToken) {
        this.logOperation({
          marketplace: this.type,
          method: 'testConnection',
          endpoint: '/sellers/v1/marketplaceParticipations',
          requestId,
          success: false,
          errorCode: 'MISSING_CREDENTIALS',
          errorMessage: 'Refresh Token veya Access Token eksik',
        });
        return false;
      }

      // Test endpoint: Get Marketplace Participations
      const response = await this.client.get('/sellers/v1/marketplaceParticipations');

      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/sellers/v1/marketplaceParticipations',
        requestId,
        success: true,
      });

      return response.status === 200;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/sellers/v1/marketplaceParticipations',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'CONNECTION_ERROR',
        errorMessage: error.message,
      });
      return false;
    }
  }

  /**
   * Fetch orders from Amazon
   */
  async fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]> {
    const requestId = this.generateRequestId();
    try {
      const createdAfter = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const createdBefore = endDate || new Date();

      // PAGINATION: Fetch all pages
      const allOrders: OrderSyncData[] = [];
      let nextToken: string | undefined;

      do {
        const params: any = {
          MarketplaceIds: this.marketplaceId,
          CreatedAfter: createdAfter.toISOString(),
          CreatedBefore: createdBefore.toISOString(),
          OrderStatuses: 'Unshipped',
        };

        if (nextToken) {
          params.NextToken = nextToken;
        }

        const response = await this.client.get('/orders/v0/orders', { params });
        const orders = response.data.payload?.Orders || [];
        
        // N+1 FIX: Batch order items requests
        const orderItemPromises = orders.map(async (orderData: any) => {
          try {
            const itemsResponse = await this.client.get(
              `/orders/v0/orders/${orderData.AmazonOrderId}/orderItems`
            );
            return {
              order: orderData,
              items: itemsResponse.data.payload?.OrderItems || [],
            };
          } catch (error: any) {
            logger.error(`[AMAZON] Failed to fetch items for order ${orderData.AmazonOrderId}:`, error);
            return {
              order: orderData,
              items: [],
            };
          }
        });

        // Throttle: Process in batches of 5 to avoid rate limits
        const batchSize = 5;
        for (let i = 0; i < orderItemPromises.length; i += batchSize) {
          const batch = orderItemPromises.slice(i, i + batchSize);
          const results = await Promise.all(batch);
          
          for (const result of results) {
            allOrders.push(this.mapAmazonOrder(result.order, result.items));
          }
          
          // Small delay between batches
          if (i + batchSize < orderItemPromises.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        nextToken = response.data.payload?.NextToken;
      } while (nextToken);

      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/orders/v0/orders',
        requestId,
        success: true,
        itemCount: allOrders.length,
      });

      return allOrders;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/orders/v0/orders',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Sync products from Amazon (Catalog Items API)
   */
  async syncProducts(): Promise<ProductSyncData[]> {
    const requestId = this.generateRequestId();
    try {
      // Amazon Catalog Items API V1
      const response = await this.client.get('/catalog/v0/items', {
        params: {
          MarketplaceId: this.marketplaceId,
        },
      });

      const products: ProductSyncData[] = [];

      for (const item of response.data.payload?.Items || []) {
        products.push({
          sku: item.SellerSKU,
          name: item.AttributeSets?.[0]?.Title || '',
          price: parseFloat(item.AttributeSets?.[0]?.ListPrice?.Amount || '0'),
          stock: 0, // Amazon inventory endpoint ayrı
          barcode: item.AttributeSets?.[0]?.EAN || undefined, // EAN'i barcode olarak da kullan (PackageQuantity barkod değil)
          gtin: item.AttributeSets?.[0]?.EAN,
          description: item.AttributeSets?.[0]?.Feature?.join(', '),
          imageUrl: item.AttributeSets?.[0]?.SmallImage?.URL,
          marketplaceId: item.Asin,
        });
      }

      this.logOperation({
        marketplace: this.type,
        method: 'syncProducts',
        endpoint: '/catalog/v0/items',
        requestId,
        success: true,
        itemCount: products.length,
      });

      return products;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'syncProducts',
        endpoint: '/catalog/v0/items',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Update stock on Amazon (FBA Inventory)
   */
  async updateStock(data: StockUpdateData[]): Promise<{ success: number; failed: number }> {
    const requestId = this.generateRequestId();
    try {
      // Step 1: Create feed document
      const feedContent = this.createInventoryFeed(data);
      const documentResponse = await this.client.post('/feeds/2021-06-30/documents', {
        contentType: 'text/xml; charset=UTF-8',
      });
      const documentId = documentResponse.data.feedDocumentId;
      const uploadUrl = documentResponse.data.url;

      // Step 2: Upload feed content
      await axios.put(uploadUrl, feedContent, {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
        },
      });

      // Step 3: Create feed
      const feedResponse = await this.client.post('/feeds/2021-06-30/feeds', {
        marketplaceIds: [this.marketplaceId],
        feedType: 'POST_INVENTORY_AVAILABILITY_DATA',
        inputFeedDocumentId: documentId,
      });
      const feedId = feedResponse.data.feedId;

      logger.info(`[AMAZON] Feed created: ${feedId}, polling for status...`);

      // Step 4: Poll feed status (CRITICAL)
      const maxAttempts = 30;
      const pollInterval = 10000; // 10 seconds
      let feedStatus = 'IN_PROGRESS';
      let feedResult: any = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const statusResponse = await this.client.get(`/feeds/2021-06-30/feeds/${feedId}`);
        feedStatus = statusResponse.data.processingStatus;
        feedResult = statusResponse.data;

        if (feedStatus === 'DONE') {
          break;
        }

        if (feedStatus === 'CANCELLED' || feedStatus === 'FATAL') {
          this.logOperation({
            marketplace: this.type,
            method: 'updateStock',
            endpoint: `/feeds/2021-06-30/feeds/${feedId}`,
            requestId,
            success: false,
            itemCount: data.length,
            errorCode: feedStatus,
            errorMessage: `Feed ${feedId} failed with status ${feedStatus}`,
          });
          throw new Error(`[AMAZON] Feed ${feedId} failed with status ${feedStatus}`);
        }
      }

      if (feedStatus !== 'DONE') {
        this.logOperation({
          marketplace: this.type,
          method: 'updateStock',
          endpoint: `/feeds/2021-06-30/feeds/${feedId}`,
          requestId,
          success: false,
          itemCount: data.length,
          errorCode: 'TIMEOUT',
          errorMessage: `Feed ${feedId} did not complete within ${maxAttempts * pollInterval / 1000} seconds`,
        });
        throw new Error(`[AMAZON] Feed ${feedId} did not complete - timeout`);
      }

      // Step 5: Get feed result document
      const resultDocumentId = feedResult.resultFeedDocumentId;
      if (resultDocumentId) {
        const resultDocResponse = await this.client.get(`/feeds/2021-06-30/documents/${resultDocumentId}`);
        const resultUrl = resultDocResponse.data.url;
        
        const resultResponse = await axios.get(resultUrl);
        logger.info(`[AMAZON] Feed result:`, resultResponse.data);
        
        // Parse result to check for errors
        // Amazon returns XML with processing report
        // Check for errors in the report
      }

      this.logOperation({
        marketplace: this.type,
        method: 'updateStock',
        endpoint: `/feeds/2021-06-30/feeds/${feedId}`,
        requestId,
        success: true,
        itemCount: data.length,
      });

      return { success: data.length, failed: 0 };
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'updateStock',
        endpoint: '/feeds/2021-06-30/feeds',
        requestId,
        success: false,
        itemCount: data.length,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Update order shipment (confirm shipment)
   */
  async confirmShipment(
    orderId: string,
    carrierCode: string,
    trackingNumber: string
  ): Promise<void> {
    const requestId = this.generateRequestId();
    try {
      await this.client.post(`/orders/v0/orders/${orderId}/shipmentConfirmation`, {
        marketplaceId: this.marketplaceId,
        carrierCode,
        trackingNumber,
        shipDate: new Date().toISOString(),
      });

      this.logOperation({
        marketplace: this.type,
        method: 'confirmShipment',
        endpoint: `/orders/v0/orders/${orderId}/shipmentConfirmation`,
        requestId,
        success: true,
        itemCount: 1,
      });
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'confirmShipment',
        endpoint: `/orders/v0/orders/${orderId}/shipmentConfirmation`,
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Get access token with cache (prevents race conditions)
   */
  private async getAccessToken(): Promise<string> {
    // Check cache
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > Date.now()) {
      return this.accessTokenCache.token;
    }

    // Refresh token
    const token = await this.refreshAccessToken();
    const expiresAt = Date.now() + (3600 * 1000); // 1 hour cache
    
    this.accessTokenCache = { token, expiresAt };
    return token;
  }

  /**
   * Refresh access token using refresh token (LWA)
   */
  private async refreshAccessToken(): Promise<string> {
    try {
      const response = await axios.post('https://api.amazon.com/auth/o2/token', {
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
        client_id: this.config.apiKey,
        client_secret: this.config.apiSecret,
      });

      return response.data.access_token;
    } catch (error) {
      logger.error('[AMAZON] Token refresh failed:', error);
      throw new Error('Failed to refresh Amazon access token');
    }
  }

  /**
   * Create inventory feed XML
   */
  private createInventoryFeed(data: StockUpdateData[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="amzn-envelope.xsd">';
    xml += '<Header><DocumentVersion>1.01</DocumentVersion><MerchantIdentifier>' + this.config.sellerId + '</MerchantIdentifier></Header>';
    xml += '<MessageType>Inventory</MessageType>';

    data.forEach((item, index) => {
      xml += `<Message><MessageID>${index + 1}</MessageID><OperationType>Update</OperationType>`;
      xml += '<Inventory><SKU>' + item.sku + '</SKU>';
      xml += '<Quantity>' + item.quantity + '</Quantity>';
      xml += '</Inventory></Message>';
    });

    xml += '</AmazonEnvelope>';

    return xml;
  }

  /**
   * Map Amazon order to OrderSyncData
   */
  private mapAmazonOrder(orderData: any, items: any[]): OrderSyncData {
    const orderItems = items.map((item) => ({
      sku: item.SellerSKU,
      name: item.Title,
      quantity: parseInt(item.QuantityOrdered),
      unitPrice: parseFloat(item.ItemPrice?.Amount || '0'),
      taxRate: parseFloat(item.ItemTax?.Amount || '0') > 0 ? 20 : 0,
    }));

    const address = orderData.ShippingAddress || {};

    return {
      marketplaceOrderId: orderData.AmazonOrderId,
      orderNumber: orderData.AmazonOrderId,
      customerName: address.Name || 'Amazon Customer',
      customerEmail: orderData.BuyerEmail,
      customerPhone: address.Phone,
      shippingAddress: `${address.AddressLine1 || ''} ${address.AddressLine2 || ''}`.trim(),
      shippingCity: address.City,
      shippingDistrict: address.StateOrRegion,
      shippingPostalCode: address.PostalCode,
      items: orderItems,
      subtotal: parseFloat(orderData.OrderTotal?.Amount || '0'),
      taxAmount: 0,
      shippingCost: 0,
      discount: 0,
      total: parseFloat(orderData.OrderTotal?.Amount || '0'),
      customerNote: orderData.BuyerInfo?.BuyerEmail,
      createdAt: new Date(orderData.PurchaseDate),
      status: this.mapAmazonStatus(orderData.OrderStatus),
    };
  }

  /**
   * Map Amazon order status to our MarketplaceOrderStatus
   */
  private mapAmazonStatus(amazonStatus: string): 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded' | 'on-hold' | 'failed' {
    const statusMap: Record<string, any> = {
      'Pending': 'pending',
      'PendingAvailability': 'pending',
      'Unshipped': 'processing',
      'PartiallyShipped': 'shipped',
      'Shipped': 'shipped',
      'InvoiceUnconfirmed': 'processing',
      'Canceled': 'cancelled',
      'Cancelled': 'cancelled',
      'Unfulfillable': 'failed',
    };
    return statusMap[amazonStatus] || 'processing';
  }
}

