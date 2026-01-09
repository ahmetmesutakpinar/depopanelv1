import axios, { AxiosInstance, AxiosError } from 'axios';
import { XMLParser } from 'fast-xml-parser';
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

export class N11Integration extends BaseMarketplaceIntegration {
  private client: AxiosInstance;
  private parser: XMLParser;

  readonly capabilities: MarketplaceCapabilities = {
    orders: true,
    stock: true,
    products: true,
  };

  constructor(config: MarketplaceConfig) {
    super(MarketplaceType.N11, config);

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: true,
    });

    this.client = axios.create({
      baseURL: 'https://api.n11.com/ws',
      timeout: 30000,
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'User-Agent': 'DepoPanel/1.0',
      },
    });
  }

  /* =====================================================
     TEST CONNECTION
  ===================================================== */
  async testConnection(): Promise<boolean> {
    const requestId = this.generateRequestId();

    const xml = this.buildXml(
      'getTopLevelCategoriesRequest',
      ''
    );

    try {
      await this.client.post('/CategoryService.do', xml);

      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/CategoryService.do',
        requestId,
        success: true,
      });

      return true;
    } catch (error: unknown) {
      const errorCode = error instanceof AxiosError
        ? error.response?.status?.toString() || 'ERROR'
        : 'ERROR';
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
        endpoint: '/CategoryService.do',
        requestId,
        success: false,
        errorCode,
        errorMessage,
      });

      throw error;
    }
  }

  /* =====================================================
     FETCH ORDERS
  ===================================================== */
  async fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]> {
    const requestId = this.generateRequestId();

    const searchXml = `
      <searchData>
        <status>1</status>
        ${startDate ? `<startDate>${this.formatDate(startDate)}</startDate>` : ''}
        ${endDate ? `<endDate>${this.formatDate(endDate)}</endDate>` : ''}
      </searchData>
    `;

    const xml = this.buildXml('orderListRequest', searchXml);

    try {
      const res = await this.client.post('/OrderService.do', xml);
      const parsed = this.parser.parse(res.data);

      if (parsed.orderListResponse?.error) {
        throw new Error(parsed.orderListResponse.error.message);
      }

      const rawOrders = parsed.orderListResponse?.orderList?.order || [];
      const orders = (Array.isArray(rawOrders) ? rawOrders : [rawOrders])
        .map((o: any) => this.mapOrder(o));

      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/OrderService.do',
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
        endpoint: '/OrderService.do',
        requestId,
        success: false,
        errorCode,
        errorMessage,
      });
      throw error;
    }
  }

  /* =====================================================
     PRODUCTS
  ===================================================== */
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
    logger.warn('[N11] syncProducts() called but is DISABLED to maintain consistency and avoid Cloudflare blocking. Products should be discovered via orders only.');
    throw new Error(
      'Direct product API calls are disabled. Products must be discovered via orders only. ' +
      'Use matchOrCreateProduct service from order sync instead.'
    );
  }

  /* =====================================================
     UPDATE STOCK
  ===================================================== */
  async updateStock(data: StockUpdateData[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const item of data) {
      const xml = this.buildXml(
        'updateStockByStockSellerCodeRequest',
        `
        <product>
          <productSellerCode>${item.sku}</productSellerCode>
          <quantity>${item.quantity}</quantity>
        </product>
        `
      );

      try {
        const res = await this.client.post('/ProductService.do', xml);
        const parsed = this.parser.parse(res.data);

        if (parsed.updateStockByStockSellerCodeResponse?.error) {
          failed++;
        } else {
          success++;
        }
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

  /* =====================================================
     XML BUILDER
  ===================================================== */
  private buildXml(root: string, body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<${root}>
  <auth>
    <appKey>${this.config.apiKey}</appKey>
    <appSecret>${this.config.apiSecret}</appSecret>
  </auth>
  ${body}
</${root}>`;
  }

  /* =====================================================
     MAPPERS
  ===================================================== */
  private mapOrder(order: any): OrderSyncData {
    const items = (order.orderItemList?.orderItem || []).map((i: any) => ({
      sku: i.productSellerCode,
      name: i.productName,
      quantity: Number(i.quantity),
      unitPrice: Number(i.price),
      taxRate: Number(i.vatRate || 20),
      barcode: i.barcode,
    }));

    return {
      marketplaceOrderId: String(order.id),
      orderNumber: String(order.orderNumber),
      customerName: `${order.buyer?.firstName || ''} ${order.buyer?.lastName || ''}`.trim(),
      customerEmail: order.buyer?.email,
      customerPhone: order.buyer?.gsm,
      shippingAddress: order.shipmentAddress?.address,
      shippingCity: order.shipmentAddress?.city,
      shippingDistrict: order.shipmentAddress?.district,
      shippingPostalCode: order.shipmentAddress?.postalCode,
      items,
      subtotal: Number(order.totalAmount || 0),
      taxAmount: Number(order.totalTaxAmount || 0),
      shippingCost: Number(order.shippingAmount || 0),
      discount: Number(order.discountAmount || 0),
      total: Number(order.totalAmount || 0),
      customerNote: order.customerNote,
      createdAt: new Date(order.orderDate),
      status: this.mapN11Status(order.status || order.orderStatus),
    };
  }

  /**
   * Map N11 order status to our MarketplaceOrderStatus
   */
  private mapN11Status(n11Status: string): 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded' | 'on-hold' | 'failed' {
    if (!n11Status) {
      logger.warn(`[N11] Durum boş, fallback: processing`);
      return 'processing';
    }
    
    const normalizedStatus = n11Status.trim();
    
    const statusMap: Record<string, any> = {
      'NewOrder': 'pending',        // Yeni sipariş
      'Unshipped': 'processing',    // Hazırlanıyor
      'Shipped': 'shipped',         // Kargoya verildi
      'Delivered': 'delivered',     // Teslim edildi
      'Cancelled': 'cancelled',     // İptal edildi
      'Returned': 'refunded',       // İade edildi
      // Alternatif formatlar
      'NEW': 'pending',
      'UNSHIPPED': 'processing',
      'SHIPPED': 'shipped',
      'DELIVERED': 'delivered',
      'CANCELLED': 'cancelled',
      'CANCELED': 'cancelled',      // US spelling
      'RETURNED': 'refunded',
      // N11 API'de kullanılan diğer olası durumlar
      'Approved': 'processing',     // Onaylandı
      'Preparing': 'processing',     // Hazırlanıyor
      'InTransit': 'shipped',       // Yolda
      'OutForDelivery': 'shipped', // Teslimata çıktı
    };
    
    const mappedStatus = statusMap[normalizedStatus] || 'processing';
    
    // ✅ DEBUG: Eğer fallback kullanılıyorsa log'la
    if (!statusMap[normalizedStatus]) {
      logger.warn(`[N11] Bilinmeyen durum: "${n11Status}" (normalized: "${normalizedStatus}"), fallback: processing`);
    } else {
      logger.debug(`[N11] Durum mapping: "${n11Status}" -> "${mappedStatus}"`);
    }
    
    return mappedStatus;
  }

  private mapProduct(p: any): ProductSyncData {
    return {
      sku: p.productSellerCode,
      name: p.productName,
      price: Number(p.salePrice || p.price),
      stock: Number(p.stockItems?.stockItem?.quantity || 0),
      barcode: p.barcode,
      gtin: p.gtin,
      description: p.description,
      imageUrl: p.images?.image?.[0]?.url,
      marketplaceId: String(p.id),
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
