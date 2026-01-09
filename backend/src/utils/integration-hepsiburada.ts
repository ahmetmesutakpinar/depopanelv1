/**
 * Hepsiburada Marketplace Integration
 * OFFICIAL + PRODUCTION SAFE VERSION
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
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

export class HepsiburadaIntegration extends BaseMarketplaceIntegration {
  private client: AxiosInstance;

  readonly capabilities: MarketplaceCapabilities = {
    orders: true,
    stock: true,
    products: true,
  };

  constructor(config: MarketplaceConfig) {
    super(MarketplaceType.HEPSIBURADA, config);

    this.client = axios.create({
      baseURL: config.apiUrl || 'https://listing-external.hepsiburada.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'DepoPanel/1.0',
      },
    });

    // AUTH HEADER
    this.client.interceptors.request.use((req) => {
      if (this.config.apiKey && this.config.sellerId) {
        req.headers['Authorization'] = `Basic ${Buffer.from(
          `${this.config.sellerId}:${this.config.apiKey}`
        ).toString('base64')}`;
      }
      return req;
    });
  }

  /* ============================================================
     TEST CONNECTION
  ============================================================ */
  async testConnection(): Promise<boolean> {
    const requestId = this.generateRequestId();

    try {
      await this.client.get('/rest/orders', {
        params: { offset: 0, limit: 1 },
      });

      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/rest/orders',
        requestId,
        success: true,
      });

      return true;
    } catch (error: unknown) {
      const errorCode = error instanceof AxiosError
        ? error.response?.status?.toString() || 'BLOCKED'
        : 'BLOCKED';
      const errorMessage = error instanceof AxiosError
        ? (typeof error.response?.data === 'string'
            ? error.response.data.slice(0, 300)
            : error.message || 'Unknown error')
        : error instanceof Error
        ? error.message
        : 'Unknown error';
      
      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/rest/orders',
        requestId,
        success: false,
        errorCode,
        errorMessage,
      });

      return false;
    }
  }

  /* ============================================================
     FETCH ORDERS
  ============================================================ */
  async fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]> {
    const requestId = this.generateRequestId();
    const orders: OrderSyncData[] = [];

    try {
      let offset = 0;
      const limit = 200;
      let hasMore = true;

      while (hasMore) {
        const params: any = {
          offset,
          limit,
          status: 'Open,Approved',
        };

        if (startDate) params.beginDate = Math.floor(startDate.getTime() / 1000);
        if (endDate) params.endDate = Math.floor(endDate.getTime() / 1000);

        const response = await this.client.get('/rest/orders', { params });

        const list = response.data?.orderList || [];

        for (const order of list) {
          orders.push(this.mapHepsiburadaOrder(order));
        }

        if (list.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }

      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/rest/orders',
        requestId,
        success: true,
        itemCount: orders.length,
      });

      return orders;
    } catch (error: unknown) {
      const errorCode = error instanceof AxiosError
        ? error.response?.status?.toString() || 'ERROR'
        : 'ERROR';
      const errorMessage = error instanceof AxiosError
        ? error.message || 'Unknown error'
        : error instanceof Error
        ? error.message
        : 'Unknown error';
      
      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/rest/orders',
        requestId,
        success: false,
        errorCode,
        errorMessage,
      });
      throw error;
    }
  }

  /* ============================================================
     PRODUCTS
  ============================================================ */
  /**
   * ⚠️ DISABLED: Direct product API calls are blocked by Cloudflare (for some marketplaces).
   * 
   * Products must be discovered ONLY via:
   * - Orders
   * - Order items
   * - Order line SKU / barcode
   * 
   * ❌ Never call this method directly.
   * ✅ Use matchOrCreateProduct service instead (from orders).
   */
  async syncProducts(): Promise<ProductSyncData[]> {
    logger.warn('[Hepsiburada] syncProducts() called but is DISABLED to maintain consistency and avoid Cloudflare blocking. Products should be discovered via orders only.');
    throw new Error(
      'Direct product API calls are disabled. Products must be discovered via orders only. ' +
      'Use matchOrCreateProduct service from order sync instead.'
    );
  }

  /* ============================================================
     UPDATE STOCK
  ============================================================ */
  async updateStock(data: StockUpdateData[]): Promise<{ success: number; failed: number }> {
    const requestId = this.generateRequestId();

    let success = 0;
    let failed = 0;

    const items = data.map((i) => ({
      merchantSku: i.sku,
      availableStock: i.quantity,
    }));

    try {
      await this.client.post('/rest/products/stocks', { items });
      success = items.length;
    } catch (error) {
      failed = items.length;
    }

    this.logOperation({
      marketplace: this.type,
      method: 'updateStock',
      endpoint: '/rest/products/stocks',
      requestId,
      success: failed === 0,
      itemCount: data.length,
      errorCode: failed ? 'PARTIAL_FAILURE' : undefined,
      errorMessage: failed ? `${failed} items failed` : undefined,
    });

    return { success, failed };
  }

  /* ============================================================
     UPDATE ORDER STATUS
  ============================================================ */
  async updateOrderStatus(
    orderId: string,
    packageId: string,
    status: 'acknowledged' | 'shipped',
    trackingNumber?: string,
    cargoCompany?: string
  ): Promise<void> {
    const requestId = this.generateRequestId();

    try {
      if (status === 'acknowledged') {
        await this.client.post('/rest/orders/acknowledge', {
          packages: [{ packageId }],
        });
      } else {
        await this.client.post('/rest/orders/shipments', {
          packages: [
            {
              packageId,
              trackingNumber,
              shippingCompany: cargoCompany || 'YURTICI',
            },
          ],
        });
      }

      this.logOperation({
        marketplace: this.type,
        method: 'updateOrderStatus',
        endpoint: status === 'acknowledged'
          ? '/rest/orders/acknowledge'
          : '/rest/orders/shipments',
        requestId,
        success: true,
      });
    } catch (error: unknown) {
      const errorCode = error instanceof AxiosError
        ? error.response?.status?.toString() || 'ERROR'
        : 'ERROR';
      const errorMessage = error instanceof AxiosError
        ? error.message || 'Unknown error'
        : error instanceof Error
        ? error.message
        : 'Unknown error';
      
      this.logOperation({
        marketplace: this.type,
        method: 'updateOrderStatus',
        endpoint: '/rest/orders',
        requestId,
        success: false,
        errorCode,
        errorMessage,
      });

      throw error;
    }
  }

  /* ============================================================
     MAPPERS
  ============================================================ */
  private mapHepsiburadaOrder(order: any): OrderSyncData {
    const items = (order.items || []).map((i: any) => ({
      sku: i.merchantSku,
      name: i.productName,
      quantity: Number(i.quantity),
      unitPrice: Number(i.price),
      taxRate: Number(i.vatRate || 20),
      barcode: i.barcode,
    }));

    const shipping = order.shippingAddress || {};

    return {
      marketplaceOrderId: order.orderNumber,
      orderNumber: order.orderNumber,
      customerName: `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim(),
      customerEmail: order.customerId,
      customerPhone: shipping.phoneNumber,
      shippingAddress: `${shipping.address || ''} ${shipping.district || ''} ${shipping.city || ''}`.trim(),
      shippingCity: shipping.city,
      shippingDistrict: shipping.district,
      shippingPostalCode: shipping.postalCode,
      items,
      subtotal: Number(order.totalPrice || 0),
      taxAmount: Number(order.totalVat || 0),
      shippingCost: Number(order.shippingPrice || 0),
      discount: 0,
      total: Number(order.totalPrice || 0),
      customerNote: order.customerNote,
      createdAt: new Date(order.orderDate),
      status: this.mapHepsiburadaStatus(order.status),
    };
  }

  private mapHepsiburadaStatus(status: string) {
    const map: Record<string, any> = {
      Open: 'pending',
      Approved: 'processing',
      Picking: 'processing',
      Invoiced: 'processing',
      Shipped: 'shipped',
      Delivered: 'delivered',
      Cancelled: 'cancelled',
      CancelledByMerchant: 'cancelled',
      CancelledByCustomer: 'cancelled',
      Returned: 'refunded',
      UnDeliverable: 'failed',
    };

    return map[status] || 'processing';
  }
}
