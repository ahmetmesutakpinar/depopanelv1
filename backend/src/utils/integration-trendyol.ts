import axios, { AxiosInstance } from 'axios';
import {
  BaseMarketplaceIntegration,
  MarketplaceConfig,
  MarketplaceCapabilities,
  OrderSyncData,
  ProductSyncData,
  StockUpdateData,
} from './integration-base.js';
import { logger } from './logger.js';

export class TrendyolIntegration extends BaseMarketplaceIntegration {
  private client: AxiosInstance;
  private supplierId: string;

  readonly capabilities: MarketplaceCapabilities = {
    orders: true,
    stock: true,
    products: true,
  };

  constructor(config: MarketplaceConfig) {
    super('TRENDYOL', config);

    if (!config.sellerId) {
      throw new Error('[Trendyol] supplierId is required');
    }

    this.supplierId = config.sellerId;

    this.client = axios.create({
      baseURL: 'https://api.trendyol.com/sapigw',
      timeout: 60000,
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.apiKey}:${config.apiSecret}`
        ).toString('base64')}`,
        'Content-Type': 'application/json',
        'User-Agent': `DepoPanel/${this.supplierId}`,
      },
    });

    this.client.interceptors.response.use(
      (r) => r,
      (error) => {
        logger.error('[Trendyol API Error]', {
          status: error.response?.status,
          url: error.config?.url,
          method: error.config?.method,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TEST CONNECTION                                                            */
  /* -------------------------------------------------------------------------- */

  async testConnection(): Promise<boolean> {
    const requestId = this.generateRequestId();

    try {
      const res = await this.client.get(
        `/suppliers/${this.supplierId}/orders`,
        { params: { page: 0, size: 1 } }
      );

      const status = res.status;
      if (status === 401 || status === 403) {
        const errorMsg = `Authentication failed: ${status} - ${JSON.stringify(res.data)}`;
        logger.error('[Trendyol] Auth error in testConnection', {
          status,
          responseBody: res.data,
        });
        throw new Error(errorMsg);
      }

      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: `/suppliers/${this.supplierId}/orders`,
        requestId,
        success: status === 200,
      });

      return true;
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        const errorMsg = `Authentication failed: ${status} - ${JSON.stringify(error.response?.data)}`;
        logger.error('[Trendyol] Auth error in testConnection', {
          status,
          responseBody: error.response?.data,
        });
        this.logOperation({
          marketplace: this.type,
          method: 'testConnection',
          endpoint: `/suppliers/${this.supplierId}/orders`,
          requestId,
          success: false,
          errorCode: status?.toString() || 'AUTH_ERROR',
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg);
      }

      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: `/suppliers/${this.supplierId}/orders`,
        requestId,
        success: false,
        errorCode: status?.toString() || 'AUTH_ERROR',
        errorMessage: error.response?.data?.message || error.message,
      });

      throw error;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* FETCH ORDERS                                                               */
  /* -------------------------------------------------------------------------- */

  async fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]> {
    const requestId = this.generateRequestId();
    const { retry } = await import('./retry-helper.js');

    // ✅ Tüm olası status'leri ekle (yeni siparişler için UnSupplied ve Repack dahil)
    const statuses = [
      'Created', 
      'Picking', 
      'Invoiced', 
      'Shipped', 
      'Delivered',
      'UnSupplied', // Yeni siparişler için
      'Repack',     // Yeni siparişler için
    ];
    const result: OrderSyncData[] = [];
    const seen = new Set<string>();

    try {
      for (const status of statuses) {
        let page = 0;
        let totalPages = 1;

        while (page < totalPages) {
          const params: any = {
            status,
            page,
            size: 500, // ✅ DÜZELTME: Limit artırıldı (200 → 500) - daha fazla sipariş çekmek için
            orderByField: 'OrderDate', // ✅ DÜZELTME: OrderDate kullan (PackageLastModifiedDate yerine) - eski siparişler için daha güvenilir
            orderByDirection: 'DESC',
          };

          // ❌ Tarih filtresi kaldırıldı - Trendyol API'de yeni siparişler için sorun yaratıyor
          // Test için: Tüm siparişleri çek (tarih filtresi yok)
          // if (startDate) params.startDate = startDate.getTime();
          // if (endDate) params.endDate = endDate.getTime();
          
          logger.debug('[Trendyol] Tarih filtresi kaldırıldı - tüm siparişler çekiliyor', {
            status,
            page,
          });

          const response = await retry(
            () =>
              this.client.get(
                `/suppliers/${this.supplierId}/orders`,
                { params }
              ),
            {
              maxRetries: 3,
              initialDelay: 2000,
              retryableErrors: [408, 429, 500, 502, 503, 504],
            }
          );

          const httpStatus = response.status;
          if (httpStatus === 401 || httpStatus === 403) {
            const errorMsg = `Authentication failed: ${httpStatus} - ${JSON.stringify(response.data)}`;
            logger.error('[Trendyol] Auth error in fetchOrders', {
              status: httpStatus,
              responseBody: response.data,
            });
            throw new Error(errorMsg);
          }

          const { content, totalPages: tp } = response.data;
          totalPages = tp || 1;

          if (Array.isArray(content)) {
            for (const order of content) {
              const mapped = this.mapOrder(order);
              const key = String(order.shipmentPackageId || mapped.marketplaceOrderId);
              if (!seen.has(key)) {
                seen.add(key);
                result.push(mapped);
              }
            }
          }

          page++;
        }
      }

      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: `/suppliers/${this.supplierId}/orders`,
        requestId,
        success: true,
        itemCount: result.length,
      });

      return result;
    } catch (error: any) {
      const statusCode = error.response?.status;
      if (statusCode === 401 || statusCode === 403) {
        const errorMsg = `Authentication failed: ${statusCode} - ${JSON.stringify(error.response?.data)}`;
        logger.error('[Trendyol] Auth error in fetchOrders', {
          status: statusCode,
          responseBody: error.response?.data,
        });
        this.logOperation({
          marketplace: this.type,
          method: 'fetchOrders',
          endpoint: `/suppliers/${this.supplierId}/orders`,
          requestId,
          success: false,
          errorCode: statusCode?.toString() || 'AUTH_ERROR',
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg);
      }

      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: `/suppliers/${this.supplierId}/orders`,
        requestId,
        success: false,
        errorCode: statusCode?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* STOCK UPDATE                                                               */
  /* -------------------------------------------------------------------------- */

  async updateStock(data: StockUpdateData[]): Promise<{ success: number; failed: number }> {
    const requestId = this.generateRequestId();
    const { retry } = await import('./retry-helper.js');

    const validItems: { barcode: string; quantity: number }[] = [];
    const failedBarcodes: string[] = [];

    for (const item of data) {
      if (!item.barcode || item.barcode.trim() === '') {
        logger.warn('[Trendyol] Skipping item without barcode', { sku: item.sku });
        failedBarcodes.push(item.sku || 'unknown');
        continue;
      }

      validItems.push({
        barcode: item.barcode.trim(),
        quantity: item.quantity,
      });
    }

    if (validItems.length === 0) {
      logger.error('[Trendyol] All items missing barcode', { failedBarcodes });
      throw new Error('[Trendyol] All items missing barcode');
    }

    const batchSize = 1000;
    let success = 0;
    let failed = failedBarcodes.length;

    for (let i = 0; i < validItems.length; i += batchSize) {
      const batch = validItems.slice(i, i + batchSize);

      try {
        await retry(
          () =>
            this.client.post(
              `/suppliers/${this.supplierId}/products/price-and-inventory`,
              { items: batch }
            ),
          {
            maxRetries: 3,
            initialDelay: 2000,
            retryableErrors: [408, 429, 500, 502, 503, 504],
          }
        );

        success += batch.length;
      } catch (error: any) {
        const batchFailedBarcodes = batch.map((item) => item.barcode);
        failed += batch.length;
        failedBarcodes.push(...batchFailedBarcodes);

        logger.error('[Trendyol] Stock batch failed', {
          batchSize: batch.length,
          failedBarcodes: batchFailedBarcodes,
          error: error.response?.data || error.message,
        });
      }
    }

    this.logOperation({
      marketplace: this.type,
      method: 'updateStock',
      endpoint: `/suppliers/${this.supplierId}/products/price-and-inventory`,
      requestId,
      success: failed === 0,
      itemCount: data.length,
      errorCode: failed > 0 ? 'PARTIAL_FAILURE' : undefined,
      errorMessage: failed > 0 ? `${failed} item(s) failed` : undefined,
    });

    if (failedBarcodes.length > 0) {
      logger.warn('[Trendyol] Stock update completed with failures', {
        failedBarcodes: failedBarcodes.slice(0, 50),
        totalFailed: failedBarcodes.length,
      });
    }

    return { success, failed };
  }

  /* -------------------------------------------------------------------------- */
  /* PRODUCTS                                                                   */
  /* -------------------------------------------------------------------------- */

  /**
   * ⚠️ DISABLED: Direct product API calls are blocked by Cloudflare.
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
    logger.warn('[Trendyol] syncProducts() called but is DISABLED to avoid Cloudflare blocking. Products should be discovered via orders only.');
    throw new Error(
      'Direct product API calls are disabled. Products must be discovered via orders only. ' +
      'Use matchOrCreateProduct service from order sync instead.'
    );
  }

  /* -------------------------------------------------------------------------- */
  /* UPDATE ORDER STATUS                                                        */
  /* -------------------------------------------------------------------------- */

  async updateOrderStatus(
    shipmentPackageId: string,
    status: 'Picking' | 'Invoiced',
    trackingNumber?: string
  ): Promise<void> {
    const requestId = this.generateRequestId();

    if (status !== 'Picking' && status !== 'Invoiced') {
      throw new Error(`[Trendyol] Invalid status: ${status}. Only 'Picking' and 'Invoiced' are allowed.`);
    }

    try {
      await this.client.put(
        `/suppliers/${this.supplierId}/shipment-packages/${shipmentPackageId}`,
        {
          status,
          ...(trackingNumber && { trackingNumber }),
        }
      );

      this.logOperation({
        marketplace: this.type,
        method: 'updateOrderStatus',
        endpoint: `/suppliers/${this.supplierId}/shipment-packages/${shipmentPackageId}`,
        requestId,
        success: true,
        itemCount: 1,
      });
    } catch (error: any) {
      const statusCode = error.response?.status;
      if (statusCode === 401 || statusCode === 403) {
        const errorMsg = `Authentication failed: ${statusCode} - ${JSON.stringify(error.response?.data)}`;
        logger.error('[Trendyol] Auth error in updateOrderStatus', {
          status: statusCode,
          responseBody: error.response?.data,
        });
        throw new Error(errorMsg);
      }

      this.logOperation({
        marketplace: this.type,
        method: 'updateOrderStatus',
        endpoint: `/suppliers/${this.supplierId}/shipment-packages/${shipmentPackageId}`,
        requestId,
        success: false,
        errorCode: statusCode?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* MAPPERS                                                                    */
  /* -------------------------------------------------------------------------- */

  private mapOrder(ty: any): OrderSyncData {
    const lines = ty.lines || [];

    return {
      marketplaceOrderId: String(ty.shipmentPackageId || ty.id),
      orderNumber: String(ty.orderNumber),
      customerName: `${ty.shipmentAddress?.firstName || ''} ${ty.shipmentAddress?.lastName || ''}`.trim(),
      customerEmail: '',
      customerPhone: ty.shipmentAddress?.phone1,
      shippingAddress: [ty.shipmentAddress?.address1, ty.shipmentAddress?.address2].filter(Boolean).join(', '),
      shippingCity: ty.shipmentAddress?.city,
      shippingDistrict: ty.shipmentAddress?.district,
      shippingPostalCode: ty.shipmentAddress?.postalCode,
      items: lines.map((l: any) => ({
        sku: l.barcode || '',
        name: l.productName,
        quantity: l.quantity,
        unitPrice: l.price,
        taxRate: 20,
        barcode: l.barcode,
      })),
      subtotal: lines.reduce((s: number, l: any) => s + l.price * l.quantity, 0),
      taxAmount: 0,
      shippingCost: 0,
      discount: ty.totalDiscount || 0,
      total: ty.totalPrice,
      customerNote: ty.customerNote || '',
      createdAt: new Date(ty.orderDate),
      status: this.mapTrendyolStatus(ty.status),
    };
  }

  private mapTrendyolStatus(status: string) {
    const map: Record<string, any> = {
      Created: 'pending',
      Picking: 'processing',
      Invoiced: 'shipped', // ✅ DÜZELTME: Invoiced = faturalandı = taşıma durumunda (SHIPPED)
      Shipped: 'shipped',
      Delivered: 'delivered',
      Cancelled: 'cancelled',
      Returned: 'refunded',
      UnDelivered: 'failed',
      Repack: 'processing',
      UnSupplied: 'cancelled',
    };

    return map[status] || 'processing';
  }

  private mapProduct(p: any): ProductSyncData {
    // ✅ DÜZELTME: SKU için stockCode veya merchantSku kullan, barcode değil
    // Trendyol API'de:
    // - stockCode: Satıcının stok kodu (SKU benzeri) - EN ÖNCELİKLİ
    // - merchantSku: Satıcı SKU'su (alternatif)
    // - barcode: GTIN/EAN (ürün barkodu) - SKU olarak kullanılmamalı
    const sku = p.stockCode || p.merchantSku || p.barcode || `TY-${p.id}`;
    
    // Log if we're using barcode as SKU (should be avoided)
    if (!p.stockCode && !p.merchantSku && p.barcode) {
      logger.warn('[Trendyol] Using barcode as SKU (stockCode/merchantSku not found)', {
        productId: p.id,
        barcode: p.barcode,
        title: p.title,
      });
    }
    
    return {
      sku: sku,
      name: p.title,
      price: p.salePrice || p.listPrice || 0,
      stock: p.quantity || 0,
      barcode: p.barcode, // ✅ Barcode ayrı tutuluyor (GTIN/EAN için)
      gtin: p.barcode, // ✅ GTIN olarak da ekleniyor
      description: p.description,
      imageUrl: p.images?.[0]?.url,
      marketplaceId: String(p.id),
    };
  }
}
// 