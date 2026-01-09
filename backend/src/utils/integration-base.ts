import { MarketplaceType } from '@prisma/client';

/**
 * Sync mode enum for integration synchronization strategies
 */
export enum SyncMode {
  AUTO = 'AUTO',           // Otomatik API sync (mevcut davranış)
  MANUAL = 'MANUAL',       // Manuel sync (API testi yok)
  WEBHOOK = 'WEBHOOK',     // Webhook tabanlı sync
  MIDDLEWARE = 'MIDDLEWARE' // Middleware üzerinden (Sopyo vb.)
}

/**
 * Integration settings interface
 */
export interface IntegrationSettings {
  readOnly?: boolean;
  syncMode?: SyncMode | string;
  skipApiTest?: boolean;
  middlewareType?: 'SOPYO' | 'CUSTOM';
  middlewareConfig?: {
    apiUrl?: string;
    apiKey?: string;
    apiSecret?: string;
    [key: string]: any;
  };
  // Mevcut alanlar
  merchantId?: string;
  username?: string;
  password?: string;
  marketplaceId?: string;
  // Master marketplace: Stoklar bu pazaryerden çekilir ve diğerlerine sync edilir
  isMaster?: boolean;
}

export interface MarketplaceConfig {
  apiUrl: string;
  apiKey?: string;
  apiSecret?: string;
  sellerId?: string;
  accessToken?: string;
  refreshToken?: string;
  settings?: Record<string, any>;
}

export interface ProductSyncData {
  sku: string;
  name: string;
  price: number;
  stock: number;
  barcode?: string;
  gtin?: string; // GTIN, UPC, EAN, ISBN
  description?: string;
  imageUrl?: string;
  marketplaceId?: string;
  // ✅ YENİ: Varyasyonlu ürün desteği
  isVariable?: boolean; // Ana ürün varyasyonlu mu?
  parentId?: string; // Varyasyon ise parent ürün ID
  attributes?: Array<{ name: string; option: string }>; // Varyasyon özellikleri
}

// Marketplace order status mapping
export type MarketplaceOrderStatus = 
  | 'pending'      // Beklemede (ödeme bekleniyor)
  | 'processing'   // İşleniyor/Hazırlanıyor
  | 'shipped'      // Kargoya verildi
  | 'delivered'    // Teslim edildi
  | 'completed'    // Tamamlandı
  | 'cancelled'    // İptal edildi
  | 'refunded'     // İade edildi
  | 'on-hold'      // Beklemede (manuel onay)
  | 'failed'       // Başarısız (ödeme hatası)
  | 'trash';       // Çöpe taşınmış (WooCommerce - silinecek)

export interface OrderSyncData {
  marketplaceOrderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCity?: string;
  shippingDistrict?: string;
  shippingPostalCode?: string;
  items: {
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
    barcode?: string; // Barkod bilgisi
  }[];
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  discount: number;
  total: number;
  customerNote?: string;
  createdAt: Date;
  // Order status from marketplace
  status?: MarketplaceOrderStatus;
  // Navlungo / External shipping metadata (read-only from WooCommerce)
  externalTrackingNumber?: string; // Navlungo → Hepsijet barkodu (e.g., "JT123456789TR")
  externalShipmentId?: string; // Navlungo shipment ID (e.g., "NL-124812487")
  shippingProvider?: string; // Shipping provider (e.g., "Hepsijet", "Yurtiçi", "Aras")
  // OrderSource specific fields
  shippingBarcode?: string; // Depocunun okutacağı barkod (Navlungo etiketi)
  shippingTrackingUrl?: string; // Label / tracking link
}

export interface StockUpdateData {
  sku: string;
  quantity: number;
  marketplaceProductId?: string;
  barcode?: string; // Product barcode/GTIN - pazaryeri API'leri için gerekli (örn: Trendyol)
}

export interface PriceUpdateData {
  sku: string;
  price: number;
  marketplaceProductId?: string;
  barcode?: string; // Product barcode/GTIN - pazaryeri API'leri için gerekli
}

export interface MarketplaceCapabilities {
  orders: boolean;
  stock: boolean;
  products: boolean;
}

export interface IntegrationLogContext {
  marketplace: MarketplaceType;
  method: string;
  endpoint: string;
  requestId: string;
  success: boolean;
  itemCount?: number;
  errorCode?: string;
  errorMessage?: string;
}

export abstract class BaseMarketplaceIntegration {
  protected config: MarketplaceConfig;
  protected type: MarketplaceType;
  
  // Production safety: Capabilities declaration
  abstract readonly capabilities: MarketplaceCapabilities;

  constructor(type: MarketplaceType, config: MarketplaceConfig) {
    this.type = type;
    this.config = config;
  }

  abstract testConnection(): Promise<boolean>;

  abstract fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]>;

  abstract updateStock(data: StockUpdateData[]): Promise<{ success: number; failed: number }>;

  abstract updatePrice(data: PriceUpdateData[]): Promise<{ success: number; failed: number }>;

  abstract syncProducts(): Promise<ProductSyncData[]>;

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Standardized logging for all adapters
   * Also records metrics for observability
   */
  protected logOperation(context: IntegrationLogContext, duration?: number): void {
    const { logger } = require('./logger.js');
    const { metricsService } = require('../services/metrics.service.js');
    
    const logData = {
      marketplace: context.marketplace,
      method: context.method,
      endpoint: context.endpoint,
      requestId: context.requestId,
      success: context.success,
      itemCount: context.itemCount,
      errorCode: context.errorCode,
      errorMessage: context.errorMessage,
      timestamp: new Date().toISOString(),
      duration: duration ? `${duration}ms` : undefined,
    };

    if (context.success) {
      logger.info(`[${context.marketplace}] ${context.method}`, logData);
    } else {
      logger.error(`[${context.marketplace}] ${context.method} FAILED`, logData);
    }

    // Record metrics
    if (duration !== undefined) {
      metricsService.recordIntegrationOperation(
        context.marketplace,
        context.method,
        context.success,
        duration,
        context.errorCode
      );
    }
  }

  /**
   * Generate unique request ID for tracing
   */
  protected generateRequestId(): string {
    return `${this.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate that operation produced actual data
   * Throws if empty array returned when data expected
   */
  protected validateDataProduced<T>(
    data: T[],
    operation: string,
    allowEmpty: boolean = false
  ): void {
    if (!allowEmpty && data.length === 0) {
      const requestId = this.generateRequestId();
      this.logOperation({
        marketplace: this.type,
        method: operation,
        endpoint: 'N/A',
        requestId,
        success: false,
        itemCount: 0,
        errorCode: 'NO_DATA_PRODUCED',
        errorMessage: `${operation} returned empty array - no data produced`,
      });
      throw new Error(`[${this.type}] ${operation} produced no data - hard fail`);
    }
  }

  protected async handleError(error: any, operation: string): Promise<never> {
    const requestId = this.generateRequestId();
    const message = error.response?.data?.message || error.message || 'Bilinmeyen hata';
    const errorCode = error.response?.status?.toString() || error.code || 'UNKNOWN';
    
    this.logOperation({
      marketplace: this.type,
      method: operation,
      endpoint: error.config?.url || 'N/A',
      requestId,
      success: false,
      errorCode,
      errorMessage: message,
    });

    throw new Error(`[${this.type}] ${operation} hatası: ${message}`);
  }
}

