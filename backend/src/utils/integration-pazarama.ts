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

export class PazaramaIntegration extends BaseMarketplaceIntegration {
  private client: AxiosInstance;

  readonly capabilities: MarketplaceCapabilities = {
    orders: true,
    stock: true,
    products: true,
  };

  constructor(config: MarketplaceConfig) {
    super(MarketplaceType.PAZARAMA, config);

    this.client = axios.create({
      baseURL: config.apiUrl || 'https://api.pazarama.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : {}),
      },
    });

    // Global error logger (Cloudflare dahil)
    this.client.interceptors.response.use(
      (r) => r,
      (error) => {
        logger.error('[PAZARAMA] HTTP ERROR', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          data:
            typeof error.response?.data === 'string'
              ? error.response.data.slice(0, 300)
              : error.response?.data,
        });

        return Promise.reject(error);
      }
    );
  }

  /**
   * TEST CONNECTION
   * Not a real "health" endpoint.
   * Just checks if authorization works without crashing app.
   */
  async testConnection(): Promise<boolean> {
    const requestId = this.generateRequestId();

    try {
      // Minimal harmless request
      await this.client.get('/seller/profile');

      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/seller/profile',
        requestId,
        success: true,
      });

      return true;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/seller/profile',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'BLOCKED',
        errorMessage:
          typeof error.response?.data === 'string'
            ? 'Blocked by Cloudflare or IP not whitelisted'
            : error.message,
      });

      // ❗ local çalışırken sistemi kilitlemesin
      return false;
    }
  }

  /* ============================================================
     ORDERS
  ============================================================ */

  async fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]> {
    const requestId = this.generateRequestId();
    const orders: OrderSyncData[] = [];

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get('/orders', {
          params: {
            page,
            size: 100,
          },
        });

        const content = response.data?.content || [];

        for (const order of content) {
          orders.push(this.mapPazaramaOrder(order));
        }

        if (!response.data?.totalPages || page >= response.data.totalPages) {
          hasMore = false;
        } else {
          page++;
        }
      }

      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/orders',
        requestId,
        success: true,
        itemCount: orders.length,
      });

      return orders;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/orders',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'BLOCKED',
        errorMessage: error.message,
      });

      throw error;
    }
  }

  /* ============================================================
     PRODUCTS
  ============================================================ */

  async syncProducts(): Promise<ProductSyncData[]> {
    const requestId = this.generateRequestId();
    const products: ProductSyncData[] = [];

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get('/products', {
          params: {
            page,
            size: 100,
          },
        });

        const content = response.data?.content || [];

        for (const p of content) {
          products.push({
            sku: p.merchantSku || p.sku,
            name: p.title,
            price: Number(p.salePrice || p.price || 0),
            stock: Number(p.quantity || 0),
            barcode: p.barcode,
            gtin: p.gtin,
            description: p.description,
            imageUrl: p.images?.[0],
            marketplaceId: String(p.id),
          });
        }

        if (!response.data?.totalPages || page >= response.data.totalPages) {
          hasMore = false;
        } else {
          page++;
        }
      }

      this.logOperation({
        marketplace: this.type,
        method: 'syncProducts',
        endpoint: '/products',
        requestId,
        success: true,
        itemCount: products.length,
      });

      return products;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'syncProducts',
        endpoint: '/products',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'BLOCKED',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /* ============================================================
     STOCK UPDATE
  ============================================================ */

  async updateStock(data: StockUpdateData[]): Promise<{ success: number; failed: number }> {
    const requestId = this.generateRequestId();

    let success = 0;
    let failed = 0;

    const payload = data
      .filter((i) => i.sku)
      .map((i) => ({
        sku: i.sku,
        quantity: i.quantity,
      }));

    if (payload.length === 0) {
      return { success: 0, failed: data.length };
    }

    try {
      await this.client.post('/stock/bulk-update', {
        items: payload,
      });

      success = payload.length;
    } catch (error: any) {
      failed = payload.length;

      logger.error('[PAZARAMA] Stock update failed', {
        error: error.response?.data || error.message,
      });
    }

    this.logOperation({
      marketplace: this.type,
      method: 'updateStock',
      endpoint: '/stock/bulk-update',
      requestId,
      success: failed === 0,
      itemCount: data.length,
      errorCode: failed ? 'PARTIAL_FAILURE' : undefined,
      errorMessage: failed ? `${failed} items failed` : undefined,
    });

    return { success, failed };
  }

  /* ============================================================
     ORDER STATUS
  ============================================================ */

  async updateOrderStatus(
    orderId: string,
    status: 'approved' | 'shipped' | 'cancelled',
    trackingNumber?: string
  ): Promise<void> {
    const requestId = this.generateRequestId();

    const payload: any = { status };

    if (status === 'shipped' && trackingNumber) {
      payload.trackingNumber = trackingNumber;
      payload.cargoCompany = 'YURTICI';
    }

    try {
      await this.client.put(`/orders/${orderId}/status`, payload);

      this.logOperation({
        marketplace: this.type,
        method: 'updateOrderStatus',
        endpoint: `/orders/${orderId}/status`,
        requestId,
        success: true,
      });
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'updateOrderStatus',
        endpoint: `/orders/${orderId}/status`,
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'BLOCKED',
        errorMessage: error.message,
      });

      throw error;
    }
  }

  /* ============================================================
     MAPPERS
  ============================================================ */

  private mapPazaramaOrder(order: any): OrderSyncData {
    const items = (order.items || []).map((i: any) => ({
      sku: i.merchantSku || i.sku,
      name: i.productName,
      quantity: Number(i.quantity),
      unitPrice: Number(i.price),
      taxRate: Number(i.vatRate || 20),
      barcode: i.barcode,
    }));

    return {
      marketplaceOrderId: String(order.orderNumber || order.id),
      orderNumber: String(order.orderNumber || order.id),
      customerName: `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim(),
      customerEmail: order.customer?.email,
      customerPhone: order.customer?.phone,
      shippingAddress: order.shippingAddress?.addressLine || '',
      shippingCity: order.shippingAddress?.city,
      shippingDistrict: order.shippingAddress?.district,
      shippingPostalCode: order.shippingAddress?.postalCode,
      items,
      subtotal: Number(order.totalPrice || 0),
      taxAmount: Number(order.totalTax || 0),
      shippingCost: Number(order.shippingPrice || 0),
      discount: Number(order.totalDiscount || 0),
      total: Number(order.totalPrice || 0),
      customerNote: order.customerNote,
      createdAt: new Date(order.orderDate || order.createdAt),
      status: this.mapPazaramaStatus(order.status),
    };
  }

  private mapPazaramaStatus(status: string): 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded' | 'on-hold' | 'failed' {
    if (!status) {
      logger.warn(`[Pazarama] Durum boş, fallback: processing`);
      return 'processing';
    }
    
    const normalizedStatus = status.trim();
    
    const map: Record<string, any> = {
      'NEW': 'pending',
      'APPROVED': 'processing',
      'PREPARING': 'processing',
      'SHIPPED': 'shipped',
      'DELIVERED': 'delivered',
      'COMPLETED': 'delivered',     // Tamamlandı
      'CANCELLED': 'cancelled',
      'CANCELED': 'cancelled',      // US spelling
      'RETURNED': 'refunded',
      // Küçük harf alternatifleri
      'new': 'pending',
      'approved': 'processing',
      'preparing': 'processing',
      'shipped': 'shipped',
      'delivered': 'delivered',
      'completed': 'delivered',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'returned': 'refunded',
      // Pazarama API'de kullanılan diğer olası durumlar
      'PENDING': 'pending',
      'PROCESSING': 'processing',
      'IN_TRANSIT': 'shipped',      // Yolda
      'OUT_FOR_DELIVERY': 'shipped', // Teslimata çıktı
      'FAILED': 'failed',           // Başarısız
    };

    const mappedStatus = map[normalizedStatus] || 'processing';
    
    // ✅ DEBUG: Eğer fallback kullanılıyorsa log'la
    if (!map[normalizedStatus]) {
      logger.warn(`[Pazarama] Bilinmeyen durum: "${status}" (normalized: "${normalizedStatus}"), fallback: processing`);
    } else {
      logger.debug(`[Pazarama] Durum mapping: "${status}" -> "${mappedStatus}"`);
    }
    
    return mappedStatus;
  }
}
