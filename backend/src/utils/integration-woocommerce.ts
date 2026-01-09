import axios, { AxiosInstance } from 'axios';
import {
  BaseMarketplaceIntegration,
  MarketplaceConfig,
  MarketplaceCapabilities,
  OrderSyncData,
  ProductSyncData,
  StockUpdateData,
  PriceUpdateData,
} from './integration-base.js';
import { logger } from './logger.js';

export class WooCommerceIntegration extends BaseMarketplaceIntegration {
  private client: AxiosInstance;
  
  readonly capabilities: MarketplaceCapabilities = {
    orders: true,
    stock: true,
    products: true,
  };

  constructor(config: MarketplaceConfig) {
    super('WOOCOMMERCE', config);

    // Normalize API URL - remove trailing slash if present
    let apiUrl = config.apiUrl || '';
    if (apiUrl.endsWith('/')) {
      apiUrl = apiUrl.slice(0, -1);
    }
    
    const baseURL = `${apiUrl}/wp-json/wc/v3`;
    
    logger.info(`[WooCommerce] Integration oluşturuluyor:`, {
      originalApiUrl: config.apiUrl,
      normalizedApiUrl: apiUrl,
      baseURL,
      hasApiKey: !!config.apiKey,
      hasApiSecret: !!config.apiSecret,
    });

    this.client = axios.create({
      baseURL,
      auth: {
        username: config.apiKey || '',
        password: config.apiSecret || '',
      },
      timeout: 60000, // Increased timeout for reliability
      headers: {
        'User-Agent': 'DepoPanel-WooCommerce-Integration/1.0',
      },
    });

    // Add response interceptor for better error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        // Log detailed error information
        if (error.response) {
          logger.error('[WooCommerce] API Error Response:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            url: error.config?.url,
            method: error.config?.method,
          });
        } else if (error.request) {
          logger.error('[WooCommerce] No response received:', {
            message: error.message,
            code: error.code,
            url: error.config?.url,
          });
        }
        return Promise.reject(error);
      }
    );
  }

  async testConnection(): Promise<boolean> {
    const requestId = this.generateRequestId();
    try {
      if (!this.config.apiUrl) {
        this.logOperation({
          marketplace: this.type,
          method: 'testConnection',
          endpoint: '/system_status',
          requestId,
          success: false,
          errorCode: 'MISSING_API_URL',
          errorMessage: 'API URL eksik',
        });
        return false;
      }
      if (!this.config.apiKey || !this.config.apiSecret) {
        this.logOperation({
          marketplace: this.type,
          method: 'testConnection',
          endpoint: '/system_status',
          requestId,
          success: false,
          errorCode: 'MISSING_CREDENTIALS',
          errorMessage: 'API Key veya Secret eksik',
        });
        return false;
      }
      
      const response = await this.client.get('/system_status');
      
      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/system_status',
        requestId,
        success: true,
      });
      
      return response.status === 200;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'testConnection',
        endpoint: '/system_status',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'CONNECTION_ERROR',
        errorMessage: error.response?.data?.message || error.message,
      });
      return false;
    }
  }

  async fetchOrders(startDate?: Date, endDate?: Date): Promise<OrderSyncData[]> {
    const requestId = this.generateRequestId();
    const { retry } = await import('./retry-helper.js');
    
    try {

      // WooCommerce API requires status to be passed as an array or single value
      // Fetch "processing" and "on-hold" status orders
      // - processing: Hazırlanıyor (yeni siparişler)
      // - on-hold: Beklemede (manuel onay bekleniyor, ama hazırlanmaya başlanabilir)
      // ✅ YENİ: Son 1 ayın tüm siparişlerini gerçek durumlarıyla çek
      // Tüm durumları çek (sadece processing ve on-hold değil)
      const statuses = [
        'pending',      // Ödeme bekleniyor
        'processing',   // Hazırlanıyor
        'on-hold',      // Beklemede
        'completed',    // Tamamlandı
        'cancelled',    // İptal
        'refunded',     // İade
        'failed',       // Başarısız
        'shipped',      // Kargoya verildi (plugin)
        'delivered',    // Teslim edildi (plugin)
        // 'trash' - silinmiş siparişleri çekme
      ];
      
      // Only add date filter if startDate is provided
      const baseParams: any = {
        per_page: 100, // WooCommerce max per_page
        orderby: 'date',
        order: 'desc',
      };

      if (startDate) {
        baseParams.after = startDate.toISOString();
        logger.info(`[WooCommerce] Tarih filtresi: ${startDate.toISOString()}'dan sonraki siparişler`);
      } else {
        logger.info(`[WooCommerce] Tarih filtresi yok - tüm siparişler çekiliyor (ilk sync)`);
      }
      
      if (endDate) {
        baseParams.before = endDate.toISOString();
      }

      // Fetch all pages of orders for each status
      const allOrders: OrderSyncData[] = [];
      let totalPages = 1;
      let totalOrders = 0;

      // Try fetching with comma-separated statuses first
      logger.info(`[WooCommerce] Sipariş status'leri deneniyor: ${statuses.join(',')}`);
      
      for (const status of statuses) {
        let page = 1;
        let hasMore = true;
        let statusOrders: OrderSyncData[] = [];

        while (hasMore) {
          const params = { ...baseParams, status, page };
          const fullUrl = `${this.client.defaults.baseURL}/orders`;
          
          logger.info(`[WooCommerce] API çağrısı: ${fullUrl}`, { 
            status,
            page,
            params: JSON.stringify(params),
          });
          
          try {
            const response = await retry(
              () => this.client.get('/orders', { params }),
              {
                maxRetries: 3,
                initialDelay: 2000,
                retryableErrors: [408, 429, 500, 502, 503, 504],
              }
            );
            
            logger.info(`[WooCommerce] API Response:`, {
              status: response.status,
              statusText: response.statusText,
              'x-wp-total': response.headers['x-wp-total'],
              'x-wp-totalpages': response.headers['x-wp-totalpages'],
              dataLength: response.data?.length || 0,
            });
            
            const orders = response.data || [];
            
            // Get total pages from header
            totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);
            totalOrders = parseInt(response.headers['x-wp-total'] || '0', 10);
            
            logger.info(`[WooCommerce] Status "${status}" - Sayfa ${page}/${totalPages}: ${orders.length} sipariş (Toplam: ${totalOrders})`);
            
            if (orders.length === 0 && page === 1) {
              // No orders for this status on first page
              logger.info(`[WooCommerce] Status "${status}" için sipariş yok`);
              hasMore = false;
            } else if (orders.length === 0 && page > 1) {
              // Reached end of pages
              hasMore = false;
            } else {
              // Map orders
              const mappedOrders = orders.map((order: any) => {
                try {
                  return this.mapOrder(order);
                } catch (mapError: any) {
                  logger.error(`[WooCommerce] Sipariş eşleme hatası (ID: ${order?.id}):`, mapError);
                  return null;
                }
              }).filter((order: any) => order !== null);
              
              statusOrders.push(...mappedOrders);
              logger.info(`[WooCommerce] Status "${status}" - Sayfa ${page}: ${mappedOrders.length} sipariş başarıyla eşlendi`);
              
              // Check if there are more pages
              hasMore = page < totalPages;
              page++;
            }
          } catch (pageError: any) {
            logger.error(`[WooCommerce] Status "${status}" - Sayfa ${page} çekme hatası:`, {
              message: pageError.message,
              response: pageError.response?.data,
              status: pageError.response?.status,
              statusText: pageError.response?.statusText,
              config: {
                url: pageError.config?.url,
                baseURL: pageError.config?.baseURL,
                params: pageError.config?.params,
              },
            });
            
            // If it's an auth error or 401, stop trying
            if (pageError.response?.status === 401 || pageError.response?.status === 403) {
              logger.error(`[WooCommerce] Kimlik doğrulama hatası - tüm istekler durduruluyor`);
              throw pageError;
            }
            
            // Continue to next status if this one fails
            hasMore = false;
          }
        }
        
        allOrders.push(...statusOrders);
        logger.info(`[WooCommerce] Status "${status}" tamamlandı: ${statusOrders.length} sipariş`);
      }

      // Remove duplicates based on marketplaceOrderId
      const uniqueOrders = allOrders.reduce((acc: OrderSyncData[], order: OrderSyncData) => {
        if (!acc.find(o => o.marketplaceOrderId === order.marketplaceOrderId)) {
          acc.push(order);
        }
        return acc;
      }, []);

      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/orders',
        requestId,
        success: true,
        itemCount: uniqueOrders.length,
      });
      
      return uniqueOrders;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'fetchOrders',
        endpoint: '/orders',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      
      // Keep detailed error logging for debugging
      logger.error(`[WooCommerce] Sipariş çekme genel hatası:`, {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          params: error.config?.params,
        },
      });
      // DO NOT return empty array - throw error (consistent with other adapters)
      throw error;
    }
  }

  async updateStock(data: StockUpdateData[]): Promise<{ success: number; failed: number }> {
    const requestId = this.generateRequestId();
    const { retry } = await import('./retry-helper.js');
    let success = 0;
    let failed = 0;
    const failedItems: Array<{ sku: string; reason: string }> = [];

    for (const item of data) {
      try {
        let productId: number | undefined = undefined;

        // ✅ FIX: If marketplaceProductId is provided (wooCommerceId), use it directly
        if (item.marketplaceProductId) {
          productId = parseInt(item.marketplaceProductId, 10);
          if (isNaN(productId)) {
            // If not a valid number, fallback to SKU search
            logger.debug(`[WooCommerce] Invalid marketplaceProductId: ${item.marketplaceProductId}, falling back to SKU search for ${item.sku}`);
            productId = undefined;
          } else {
            logger.debug(`[WooCommerce] Using marketplaceProductId directly: ${productId} for SKU: ${item.sku}`);
          }
        }

        // If no productId from marketplaceProductId, search by SKU
        if (!productId) {
          const searchResponse = await retry(
            () => this.client.get('/products', {
              params: { sku: item.sku },
            }),
            {
              maxRetries: 2,
              initialDelay: 1000,
              retryableErrors: [408, 429, 500, 502, 503, 504],
            }
          );

          if (searchResponse.data.length > 0) {
            productId = searchResponse.data[0].id;
            logger.debug(`[WooCommerce] Found product by SKU: ${productId} for SKU: ${item.sku}`);
          } else {
            failed++;
            failedItems.push({ sku: item.sku, reason: 'Product not found by SKU' });
            logger.warn(`[WooCommerce] Product not found by SKU: ${item.sku}`);
            continue;
          }
        }

        // Update stock with retry
        await retry(
          () => this.client.put(`/products/${productId}`, {
            stock_quantity: item.quantity,
            manage_stock: true,
          }),
          {
            maxRetries: 2,
            initialDelay: 1000,
            retryableErrors: [408, 429, 500, 502, 503, 504],
          }
        );

        logger.debug(`[WooCommerce] Stock updated successfully: Product ID ${productId}, SKU: ${item.sku}, Quantity: ${item.quantity}`);
        success++;
      } catch (error: any) {
        failed++;
        const errorMessage = error.message || 'Unknown error';
        failedItems.push({ sku: item.sku, reason: errorMessage });
        logger.error(`[WooCommerce] Stock update failed for SKU: ${item.sku}`, {
          error: errorMessage,
          sku: item.sku,
          marketplaceProductId: item.marketplaceProductId,
        });
      }
    }

    this.logOperation({
      marketplace: this.type,
      method: 'updateStock',
      endpoint: '/products',
      requestId,
      success: failed === 0,
      itemCount: data.length,
      errorCode: failed > 0 ? 'PARTIAL_FAILURE' : undefined,
      errorMessage: failed > 0 ? `${failed} items failed: ${failedItems.map(f => `${f.sku} (${f.reason})`).join(', ')}` : undefined,
    });

    return { success, failed };
  }

  async updatePrice(data: PriceUpdateData[]): Promise<{ success: number; failed: number }> {
    const requestId = this.generateRequestId();
    const { retry } = await import('./retry-helper.js');
    let success = 0;
    let failed = 0;
    const failedItems: Array<{ sku: string; reason: string }> = [];

    for (const item of data) {
      try {
        let productId: number | undefined = undefined;

        // ✅ FIX: If marketplaceProductId is provided (wooCommerceId), use it directly
        if (item.marketplaceProductId) {
          productId = parseInt(item.marketplaceProductId, 10);
          if (isNaN(productId)) {
            // If not a valid number, fallback to SKU search
            logger.debug(`[WooCommerce] Invalid marketplaceProductId: ${item.marketplaceProductId}, falling back to SKU search for ${item.sku}`);
            productId = undefined;
          } else {
            logger.debug(`[WooCommerce] Using marketplaceProductId directly: ${productId} for SKU: ${item.sku}`);
          }
        }

        // If no productId from marketplaceProductId, search by SKU
        if (!productId) {
          const searchResponse = await retry(
            () => this.client.get('/products', {
              params: { sku: item.sku },
            }),
            {
              maxRetries: 2,
              initialDelay: 1000,
              retryableErrors: [408, 429, 500, 502, 503, 504],
            }
          );

          if (searchResponse.data.length > 0) {
            productId = searchResponse.data[0].id;
            logger.debug(`[WooCommerce] Found product by SKU: ${productId} for SKU: ${item.sku}`);
          } else {
            failed++;
            failedItems.push({ sku: item.sku, reason: 'Product not found by SKU' });
            logger.warn(`[WooCommerce] Product not found by SKU: ${item.sku}`);
            continue;
          }
        }

        // Update price with retry
        await retry(
          () => this.client.put(`/products/${productId}`, {
            regular_price: String(item.price),
          }),
          {
            maxRetries: 2,
            initialDelay: 1000,
            retryableErrors: [408, 429, 500, 502, 503, 504],
          }
        );

        logger.debug(`[WooCommerce] Price updated successfully: Product ID ${productId}, SKU: ${item.sku}, Price: ${item.price}`);
        success++;
      } catch (error: any) {
        failed++;
        const errorMessage = error.message || 'Unknown error';
        failedItems.push({ sku: item.sku, reason: errorMessage });
        logger.error(`[WooCommerce] Price update failed for SKU: ${item.sku}`, {
          error: errorMessage,
          sku: item.sku,
          marketplaceProductId: item.marketplaceProductId,
        });
      }
    }

    this.logOperation({
      marketplace: this.type,
      method: 'updatePrice',
      endpoint: '/products',
      requestId,
      success: failed === 0,
      itemCount: data.length,
      errorCode: failed > 0 ? 'PARTIAL_FAILURE' : undefined,
      errorMessage: failed > 0 ? `${failed} items failed: ${failedItems.map(f => `${f.sku} (${f.reason})`).join(', ')}` : undefined,
    });

    return { success, failed };
  }

  async syncProducts(): Promise<ProductSyncData[]> {
    const requestId = this.generateRequestId();
    const { retry } = await import('./retry-helper.js');
    const products: ProductSyncData[] = [];

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await retry(
          () => this.client.get('/products', {
            params: {
              page,
              per_page: 100, // WooCommerce max per_page
              orderby: 'date',
              order: 'desc',
            },
          }),
          {
            maxRetries: 3,
            delay: 1000,
            onRetry: (error, attempt) => {
              logger.warn(`[WooCommerce] Ürün çekme hatası (deneme ${attempt}/3):`, error.message);
            },
          }
        );

        const pageProducts = response.data || [];

        for (const p of pageProducts) {
          // ✅ YENİ: Varyasyonlu ürün kontrolü
          if (p.type === 'variable' && p.variations && p.variations.length > 0) {
            // Ana ürünü ekle (varyasyonlar için parent)
            const imageUrl = p.images && p.images.length > 0 ? p.images[0].src : null;
            
            products.push({
              sku: p.sku || `PARENT-${p.id}`, // Parent SKU
              name: p.name || '',
              price: Number(p.regular_price || p.price || 0),
              stock: 0, // Parent ürünün stoku yok, varyasyonlarda var
              barcode: p.barcode || null,
              gtin: p.gtin || null,
              description: p.description || null,
              imageUrl: imageUrl,
              marketplaceId: String(p.id),
              isVariable: true, // ✅ YENİ: Varyasyonlu ürün işareti
            });

            // ✅ YENİ: Her varyasyonu ayrı ürün olarak ekle
            for (const variationId of p.variations) {
              try {
                const variationResponse = await retry(
                  () => this.client.get(`/products/${p.id}/variations/${variationId}`),
                  {
                    maxRetries: 2,
                    delay: 500,
                  }
                );
                
                const v = variationResponse.data;
                const variantImageUrl = v.image && v.image.src ? v.image.src : imageUrl;
                const variantAttributes = v.attributes ? v.attributes.map((attr: any) => ({
                  name: attr.name || attr.id || '',
                  option: attr.option || '',
                })) : [];

                // ✅ DEBUG: Log variation data from WooCommerce API
                const variationData = {
                  sku: v.sku || `${p.sku || p.id}-VAR-${variationId}`,
                  name: `${p.name} - ${variantAttributes.map((attr: any) => `${attr.name}: ${attr.option}`).join(', ') || 'Varyasyon'}`,
                  price: Number(v.regular_price || v.price || p.regular_price || 0),
                  stock: Number(v.stock_quantity || 0),
                  barcode: v.barcode || null,
                  gtin: v.gtin || null,
                  description: v.description || p.description || null,
                  imageUrl: variantImageUrl,
                  marketplaceId: String(v.id),
                  parentId: String(p.id), // ✅ YENİ: Parent ürün ID
                  attributes: variantAttributes, // ✅ YENİ: Varyasyon özellikleri
                };

                logger.info(`[WooCommerce] 🔍 Varyasyon verisi çekildi: ${variationData.sku}`, {
                  variationId: v.id,
                  parentId: p.id,
                  stock_quantity: v.stock_quantity,
                  regular_price: v.regular_price,
                  price: v.price,
                  barcode: v.barcode,
                  gtin: v.gtin,
                  hasAttributes: variantAttributes.length > 0,
                  finalData: {
                    stock: variationData.stock,
                    price: variationData.price,
                    barcode: variationData.barcode,
                    gtin: variationData.gtin,
                  },
                });

                products.push(variationData);
              } catch (error: any) {
                logger.warn(`[WooCommerce] Varyasyon çekilemedi: ${variationId}`, {
                  error: error.message,
                  productId: p.id,
                });
              }
            }
          } else {
            // Normal ürün (varyasyonsuz)
            const imageUrl = p.images && p.images.length > 0 ? p.images[0].src : null;

            products.push({
              sku: p.sku || '',
              name: p.name || '',
              price: Number(p.regular_price || p.price || 0),
              stock: Number(p.stock_quantity || 0),
              barcode: p.barcode || null,
              gtin: p.gtin || null,
              description: p.description || null,
              imageUrl: imageUrl,
              marketplaceId: String(p.id),
            });
          }
        }

        // Check if there are more pages
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);
        if (page >= totalPages) {
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

      logger.info(`[WooCommerce] ${products.length} ürün çekildi`);
      return products;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'syncProducts',
        endpoint: '/products',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      await this.handleError(error, 'Ürün senkronizasyonu');
      throw error;
    }
  }

  async getProduct(productId: number): Promise<any> {
    try {
      const response = await this.client.get(`/products/${productId}`);
      return response.data;
    } catch (error) {
      await this.handleError(error, 'Ürün getirme');
      throw error;
    }
  }

  async updateProduct(productId: number, data: Partial<{
    name: string;
    regular_price: string;
    stock_quantity: number;
    description: string;
  }>): Promise<any> {
    try {
      const response = await this.client.put(`/products/${productId}`, data);
      return response.data;
    } catch (error) {
      await this.handleError(error, 'Ürün güncelleme');
      throw error;
    }
  }

  async createProduct(data: {
    name: string;
    sku: string;
    regular_price: string;
    description?: string;
    stock_quantity?: number;
    manage_stock?: boolean;
  }): Promise<any> {
    try {
      const response = await this.client.post('/products', {
        ...data,
        manage_stock: true,
        status: 'publish',
      });
      return response.data;
    } catch (error) {
      await this.handleError(error, 'Ürün oluşturma');
      throw error;
    }
  }

  private mapOrder(wcOrder: any): OrderSyncData {
    // Validate required fields
    if (!wcOrder || !wcOrder.id) {
      throw new Error('Sipariş ID eksik veya geçersiz');
    }

    // Handle missing billing/shipping data gracefully
    const billing = wcOrder.billing || {};
    const shipping = wcOrder.shipping || {};
    const lineItems = wcOrder.line_items || [];

    // Ensure customer name is not empty
    const customerName = `${billing.first_name || ''} ${billing.last_name || ''}`.trim();
    
    if (!customerName) {
      logger.warn(`[WooCommerce] Sipariş ${wcOrder.id} için müşteri adı yok, varsayılan kullanılıyor`);
    }

    // Extract Navlungo metadata from order meta_data
    let externalTrackingNumber: string | undefined;
    let externalShipmentId: string | undefined;
    let shippingProvider: string | undefined;
    let shippingBarcode: string | undefined; // Depocunun okutacağı barkod
    let shippingTrackingUrl: string | undefined; // Label / tracking link

    if (wcOrder.meta_data && Array.isArray(wcOrder.meta_data)) {
      // Look for Navlungo tracking number / shipping barcode (depocunun okutacağı barkod)
      const trackingMeta = wcOrder.meta_data.find((meta: any) => {
        if (!meta.key) return false;
        const key = meta.key.toLowerCase();
        return (
          key === 'tracking_number' ||
          key === 'navlungo_tracking_number' ||
          key === '_tracking_number' ||
          key === 'navlungo_barcode' ||
          key === 'shipping_barcode' ||
          key === '_shipping_barcode' ||
          key.includes('tracking') ||
          key.includes('barcode')
        );
      });
      if (trackingMeta?.value) {
        const value = String(trackingMeta.value).trim();
        // If it looks like a barcode (alphanumeric, usually starts with letters), use as shipping barcode
        if (/^[A-Z0-9]+$/i.test(value) && value.length >= 8) {
          shippingBarcode = value;
          externalTrackingNumber = value; // Also set as tracking number for backward compatibility
        } else {
          externalTrackingNumber = value;
        }
      }

      // Look for Navlungo shipment ID
      const shipmentMeta = wcOrder.meta_data.find((meta: any) => {
        if (!meta.key) return false;
        const key = meta.key.toLowerCase();
        return (
          key === 'navlungo_shipment_id' ||
          key === 'shipment_id' ||
          key === '_shipment_id' ||
          key === 'navlungo_shipment' ||
          key.includes('shipment')
        );
      });
      if (shipmentMeta?.value) {
        externalShipmentId = String(shipmentMeta.value).trim();
      }

      // Look for shipping provider
      const providerMeta = wcOrder.meta_data.find((meta: any) => {
        if (!meta.key) return false;
        const key = meta.key.toLowerCase();
        return (
          key === 'shipping_provider' ||
          key === 'cargo_provider' ||
          key === 'navlungo_provider' ||
          key === '_shipping_provider' ||
          key.includes('provider')
        );
      });
      if (providerMeta?.value) {
        shippingProvider = String(providerMeta.value).trim();
      }

      // Look for shipping tracking URL / label URL
      const trackingUrlMeta = wcOrder.meta_data.find((meta: any) => {
        if (!meta.key) return false;
        const key = meta.key.toLowerCase();
        return (
          key === 'tracking_url' ||
          key === 'shipping_label_url' ||
          key === 'navlungo_label_url' ||
          key === 'label_url' ||
          key.includes('label') ||
          key.includes('tracking_url')
        );
      });
      if (trackingUrlMeta?.value) {
        shippingTrackingUrl = String(trackingUrlMeta.value).trim();
      }
    }

    // Also check shipping_lines for tracking number / barcode
    if (!shippingBarcode && !externalTrackingNumber && wcOrder.shipping_lines && Array.isArray(wcOrder.shipping_lines)) {
      for (const shippingLine of wcOrder.shipping_lines) {
        if (shippingLine.meta_data && Array.isArray(shippingLine.meta_data)) {
          const trackingMeta = shippingLine.meta_data.find((meta: any) => {
            if (!meta.key) return false;
            const key = meta.key.toLowerCase();
            return key.includes('tracking') || key.includes('barcode');
          });
          if (trackingMeta?.value) {
            const value = String(trackingMeta.value).trim();
            if (/^[A-Z0-9]+$/i.test(value) && value.length >= 8) {
              shippingBarcode = value;
            }
            externalTrackingNumber = value;
            break;
          }
        }
      }
    }

    return {
      marketplaceOrderId: String(wcOrder.id),
      orderNumber: wcOrder.number || String(wcOrder.id),
      customerName: customerName || 'Müşteri Adı Yok',
      customerEmail: billing.email || undefined,
      customerPhone: billing.phone || undefined,
      shippingAddress: [
        shipping.address_1,
        shipping.address_2,
      ].filter(Boolean).join(', ') || billing.address_1 || 'Adres Yok',
      shippingCity: shipping.city || billing.city,
      shippingDistrict: shipping.state || billing.state,
      shippingPostalCode: shipping.postcode || billing.postcode,
      items: lineItems.map((item: any) => {
        // Try to extract barcode from item meta_data
        // WooCommerce uses _global_unique_id for barcodes
        let barcode: string | undefined;
        if (item.meta_data && Array.isArray(item.meta_data)) {
          const barcodeMeta = item.meta_data.find((meta: any) => 
            meta.key && (
              meta.key.toLowerCase() === '_global_unique_id' || // WooCommerce standard barcode field
              meta.key.toLowerCase() === 'global_unique_id' ||
              meta.key.toLowerCase() === '_barcode' ||
              meta.key.toLowerCase() === 'barcode' ||
              meta.key.toLowerCase().includes('barcode') ||
              meta.key.toLowerCase().includes('global_unique')
            )
          );
          if (barcodeMeta && barcodeMeta.value) {
            barcode = String(barcodeMeta.value).trim();
          }
        }
        
        return {
          sku: item.sku || `WC-${item.product_id}`,
          name: item.name || 'Ürün Adı Yok',
          quantity: parseInt(String(item.quantity || '1'), 10),
          unitPrice: parseFloat(String(item.price || '0')),
          taxRate: 20, // Default tax rate
          barcode: barcode || undefined, // SKU'yu barkod olarak kullanma - sadece gerçek barkod
        };
      }),
      subtotal: parseFloat(String(wcOrder.total || '0')) - parseFloat(String(wcOrder.shipping_total || '0')),
      taxAmount: parseFloat(String(wcOrder.total_tax || '0')),
      shippingCost: parseFloat(String(wcOrder.shipping_total || '0')),
      discount: parseFloat(String(wcOrder.discount_total || '0')),
      total: parseFloat(String(wcOrder.total || '0')),
      customerNote: wcOrder.customer_note || undefined,
      createdAt: wcOrder.date_created ? new Date(wcOrder.date_created) : new Date(),
      // Map WooCommerce status to our status
      status: (() => {
        const mappedStatus = this.mapWooCommerceStatus(wcOrder.status);
        logger.debug(`[WooCommerce] Durum mapping: "${wcOrder.status}" -> "${mappedStatus}" (Order ID: ${wcOrder.id})`);
        return mappedStatus;
      })(),
      // Navlungo metadata (for backward compatibility with Order model)
      externalTrackingNumber: externalTrackingNumber || undefined,
      externalShipmentId: externalShipmentId || undefined,
      shippingProvider: shippingProvider || undefined,
      // OrderSource specific fields (will be stored in OrderSource table)
      shippingBarcode: shippingBarcode || undefined,
      shippingTrackingUrl: shippingTrackingUrl || undefined,
    };
  }

  /**
   * Map WooCommerce order status to our MarketplaceOrderStatus
   */
  private mapWooCommerceStatus(wcStatus: string): 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded' | 'on-hold' | 'failed' | 'trash' {
    if (!wcStatus) {
      logger.warn(`[WooCommerce] Durum boş, fallback: processing`);
      return 'processing';
    }
    
    // ✅ YENİ: WooCommerce durumları bazen "wc-" prefix'i ile gelebilir, temizle
    const normalizedStatus = wcStatus.toLowerCase().replace(/^wc-/, '').trim();
    
    const statusMap: Record<string, any> = {
      'pending': 'pending',
      'processing': 'processing',
      'on-hold': 'on-hold',
      'onhold': 'on-hold', // Alternatif format
      'completed': 'completed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled', // US spelling
      'refunded': 'refunded',
      'failed': 'failed',
      'trash': 'trash', // Çöpe taşınmış siparişler
      // WooCommerce doesn't have shipped/delivered by default, but plugins might add them
      'shipped': 'shipped',
      'delivered': 'delivered',
      'in-transit': 'shipped',
      'intransit': 'shipped', // Alternatif format
      'out-for-delivery': 'shipped',
      'outfordelivery': 'shipped', // Alternatif format
    };
    
    const mappedStatus = statusMap[normalizedStatus] || 'processing';
    
    // ✅ DEBUG: Eğer fallback kullanılıyorsa log'la
    if (!statusMap[normalizedStatus]) {
      logger.warn(`[WooCommerce] Bilinmeyen durum: "${wcStatus}" (normalized: "${normalizedStatus}"), fallback: processing`);
    }
    
    return mappedStatus;
  }

  /**
   * Extract GTIN/EAN/Barcode from WooCommerce meta_data array
   * Supports multiple plugin formats and meta keys
   */
  private extractGtinFromMetaData(metaData: any[]): string | undefined {
    // ✅ 4️⃣ DEBUG: extractGtinFromMetaData input'unu logla
    console.log(`[GTIN EXTRACT INPUT]`, {
      metaData,
      isArray: Array.isArray(metaData),
      length: metaData?.length || 0,
      type: typeof metaData,
    });
    
    if (!metaData || !Array.isArray(metaData) || metaData.length === 0) {
      console.log(`[GTIN EXTRACT] Early return - metaData is empty or invalid`);
      return undefined;
    }

    // Priority order for GTIN meta keys (most common first)
    const gtinKeys = [
      '_global_unique_id',      // WooCommerce core GTIN field
      'global_unique_id',       // Alternative format
      '_wpm_gtin_code',         // WooCommerce Product Manager plugin
      '_wpm_gtin',              // WooCommerce Product Manager (alternative)
      '_gtin',                  // Generic GTIN
      'gtin',                   // Generic GTIN (no prefix)
      '_gtin_code',             // GTIN code variant
      '_ean',                   // European Article Number
      'ean',                    // EAN (no prefix)
      '_ean_code',              // EAN code variant
      '_upc',                   // Universal Product Code
      'upc',                    // UPC (no prefix)
      '_upc_code',              // UPC code variant
      '_isbn',                  // International Standard Book Number
      'isbn',                   // ISBN (no prefix)
      '_wc_gpf_ean',            // WooCommerce Google Product Feed EAN
      '_wc_gpf_gtin',           // WooCommerce Google Product Feed GTIN
      '_alg_ean',               // Alg EAN plugin
      '_alg_gtin',              // Alg GTIN plugin
      'product_gtin',           // Product GTIN (generic)
      '_product_gtin',          // Product GTIN (with prefix)
      'product_ean',            // Product EAN (generic)
      '_product_ean',           // Product EAN (with prefix)
      'product_upc',            // Product UPC (generic)
      '_product_upc',           // Product UPC (with prefix)
    ];

    // Try exact matches first (case-insensitive)
    for (const searchKey of gtinKeys) {
      const meta = metaData.find((m: any) => {
        if (!m.key) return false;
        return m.key.toLowerCase() === searchKey.toLowerCase();
      });

      // ✅ 4️⃣ DEBUG: Her match denemesini logla
      console.log(`[GTIN MATCH TRY]`, {
        searchKey,
        found: !!meta,
        metaKey: meta?.key,
        metaValue: meta?.value,
        metaValueType: typeof meta?.value,
      });

      if (meta && meta.value) {
        const value = String(meta.value).trim();
        if (value.length > 0 && value !== '0' && 
            value.toLowerCase() !== 'null' && 
            value.toLowerCase() !== 'undefined') {
          console.log(`[GTIN MATCH SUCCESS]`, { searchKey, value, metaKey: meta.key });
          logger.info(`[WooCommerce] ✅ GTIN bulundu (exact match): "${value}" (key: ${meta.key})`);
          return value;
        } else {
          console.log(`[GTIN MATCH FAILED]`, { searchKey, value, reason: 'invalid value' });
        }
      }
    }

    // Fallback: Try partial matches (contains gtin/ean/upc)
    for (const meta of metaData) {
      if (!meta.key || !meta.value) continue;
      
      const key = meta.key.toLowerCase();
      const value = String(meta.value).trim();
      
      if (value.length === 0 || value === '0' || 
          value.toLowerCase() === 'null' || 
          value.toLowerCase() === 'undefined') {
        continue;
      }

      // Check if key contains GTIN/EAN/UPC related terms
      if ((key.includes('gtin') || key.includes('ean') || key.includes('upc') || key.includes('isbn')) &&
          !key.includes('productdata') && // Exclude wc_productdata_options
          !key.includes('options')) {
        logger.info(`[WooCommerce] ✅ GTIN bulundu (partial match): "${value}" (key: ${meta.key})`);
        return value;
      }
    }

    // Try wc_productdata_options nested structure
    const productDataOptions = metaData.find((m: any) => m.key === 'wc_productdata_options');
    if (productDataOptions && productDataOptions.value) {
      try {
        const optionsValue = typeof productDataOptions.value === 'string' 
          ? JSON.parse(productDataOptions.value) 
          : productDataOptions.value;
        
        if (optionsValue._global_unique_id) {
          const value = String(optionsValue._global_unique_id).trim();
          if (value.length > 0) {
            logger.info(`[WooCommerce] ✅ GTIN bulundu (wc_productdata_options): "${value}"`);
            return value;
          }
        }
      } catch (e) {
        // JSON parse error, continue
        logger.debug(`[WooCommerce] wc_productdata_options parse error: ${e}`);
      }
    }

    return undefined;
  }

  /**
   * Extract barcode from WooCommerce meta_data array
   * Uses same logic as GTIN extraction
   */
  private extractBarcodeFromMetaData(metaData: any[]): string | undefined {
    if (!metaData || !Array.isArray(metaData) || metaData.length === 0) {
      return undefined;
    }

    // Priority order for barcode meta keys
    const barcodeKeys = [
      '_barcode',               // Generic barcode
      'barcode',               // Barcode (no prefix)
      '_barcode_number',       // Barcode number
      'barcode_number',        // Barcode number (no prefix)
      '_product_barcode',      // Product barcode
      'product_barcode',       // Product barcode (no prefix)
      '_custom_barcode',       // Custom barcode
      '_global_unique_id',     // Also check GTIN field (can be used as barcode)
      'global_unique_id',      // Alternative format
      '_ean',                  // EAN can be used as barcode
      '_gtin',                 // GTIN can be used as barcode
    ];

    // Try exact matches first
    for (const searchKey of barcodeKeys) {
      const meta = metaData.find((m: any) => {
        if (!m.key) return false;
        return m.key.toLowerCase() === searchKey.toLowerCase();
      });

      if (meta && meta.value) {
        const value = String(meta.value).trim();
        if (value.length > 0 && value !== '0' && 
            value.toLowerCase() !== 'null' && 
            value.toLowerCase() !== 'undefined') {
          return value;
        }
      }
    }

    // Fallback: Try partial matches
    for (const meta of metaData) {
      if (!meta.key || !meta.value) continue;
      
      const key = meta.key.toLowerCase();
      const value = String(meta.value).trim();
      
      if (value.length === 0 || value === '0' || 
          value.toLowerCase() === 'null' || 
          value.toLowerCase() === 'undefined') {
        continue;
      }

      if (key.includes('barcode') && 
          !key.includes('productdata') && 
          !key.includes('options')) {
        return value;
      }
    }

    return undefined;
  }

  private mapProduct(wcProduct: any): ProductSyncData {
    // ✅ 1️⃣ DEBUG: Ham WooCommerce product response'unu logla
    console.log(`[WC RAW PRODUCT] Product ID: ${wcProduct.id}`, JSON.stringify(wcProduct, null, 2));
    
    // ✅ 2️⃣ DEBUG: meta_data durumunu kontrol et
    const hasMetaData = !!wcProduct.meta_data;
    const isMetaDataArray = Array.isArray(wcProduct.meta_data);
    const metaDataLength = wcProduct.meta_data?.length || 0;
    
    console.log(`[WC META STATUS] Product ID: ${wcProduct.id}`, {
      hasMetaData,
      isMetaDataArray,
      metaDataLength,
      metaDataType: typeof wcProduct.meta_data,
      metaDataValue: wcProduct.meta_data,
      globalUniqueId: wcProduct.global_unique_id, // ✅ DEBUG: Root level global_unique_id
    });
    
    // ✅ 3️⃣ DEBUG: Tüm meta_data key'lerini normalize ederek logla
    if (wcProduct.meta_data && Array.isArray(wcProduct.meta_data)) {
      const normalizedKeys = wcProduct.meta_data.map((m: any) => ({
        rawKey: m.key,
        normalizedKey: m.key?.toLowerCase().trim(),
        value: m.value,
        valueType: typeof m.value,
        valueString: String(m.value || '').substring(0, 100),
      }));
      
      console.log(`[WC META KEYS NORMALIZED] Product ID: ${wcProduct.id}`, JSON.stringify(normalizedKeys, null, 2));
      
      const metaDataPairs = wcProduct.meta_data.map((m: any) => {
        const key = m.key || '(no key)';
        const value = m.value !== undefined && m.value !== null 
          ? String(m.value).substring(0, 100) // Limit value length for logging
          : '(no value)';
        return `${key}=${value}`;
      }).join(', ');
      
      logger.info(`[WooCommerce] 📋 Product ${wcProduct.id} (SKU: ${wcProduct.sku}) meta_data [${wcProduct.meta_data.length} items]: ${metaDataPairs}`);
    } else {
      console.log(`[WC META MISSING] Product ID: ${wcProduct.id} - meta_data is ${wcProduct.meta_data === undefined ? 'undefined' : wcProduct.meta_data === null ? 'null' : 'not an array'}`);
      logger.warn(`[WooCommerce] ⚠️ Product ${wcProduct.id} (SKU: ${wcProduct.sku}) has no meta_data`);
    }

    // ✅ KRİTİK DÜZELTME: ÖNCE root level global_unique_id kontrolü yap!
    let gtin: string | undefined;
    
    // 1. Root level global_unique_id kontrolü (EN ÖNCELİKLİ)
    if (wcProduct.global_unique_id && String(wcProduct.global_unique_id).trim() !== '') {
      gtin = String(wcProduct.global_unique_id).trim();
      console.log(`[GTIN FOUND ROOT] Product ID: ${wcProduct.id} - global_unique_id: "${gtin}"`);
      logger.info(`[WooCommerce] ✅ GTIN bulundu (root level global_unique_id): "${gtin}" (Product ${wcProduct.id}, SKU: ${wcProduct.sku})`);
    }
    
    // 2. Eğer root'ta yoksa, meta_data içinde ara
    if (!gtin) {
      gtin = this.extractGtinFromMetaData(wcProduct.meta_data || []);
      if (gtin) {
        console.log(`[GTIN FOUND META] Product ID: ${wcProduct.id} - GTIN from meta_data: "${gtin}"`);
      }
    }

    // ✅ YENİ: Önce root level barcode kontrolü
    let rootBarcode: string | undefined;
    if (wcProduct.barcode && String(wcProduct.barcode).trim() !== '') {
      rootBarcode = String(wcProduct.barcode).trim();
      logger.info(`[WooCommerce] ✅ Barcode bulundu (root level): "${rootBarcode}" (Product ${wcProduct.id}, SKU: ${wcProduct.sku})`);
    }

    // Extract barcode from meta_data (separate from GTIN)
    const metaBarcode = this.extractBarcodeFromMetaData(wcProduct.meta_data || []);

    // Priority: root barcode > meta barcode > GTIN
    const finalBarcode = rootBarcode || metaBarcode || gtin;

    // Log extraction results
    if (gtin) {
      logger.info(`[WooCommerce] ✅ GTIN extracted: "${gtin}" (Product ${wcProduct.id}, SKU: ${wcProduct.sku})`);
    } else {
      logger.debug(`[WooCommerce] ⚠️ GTIN not found (Product ${wcProduct.id}, SKU: ${wcProduct.sku})`);
    }

    if (finalBarcode) {
      logger.info(`[WooCommerce] ✅ Barcode extracted: "${finalBarcode}" (Product ${wcProduct.id}, SKU: ${wcProduct.sku})`);
    } else {
      logger.debug(`[WooCommerce] ⚠️ Barcode not found (Product ${wcProduct.id}, SKU: ${wcProduct.sku})`);
    }

    return {
      sku: wcProduct.sku || `WC-${wcProduct.id}`,
      name: wcProduct.name,
      price: parseFloat(wcProduct.regular_price || wcProduct.price || '0'),
      stock: wcProduct.stock_quantity || 0,
      barcode: finalBarcode || undefined,
      gtin: gtin || undefined,
      description: wcProduct.short_description || wcProduct.description,
      imageUrl: wcProduct.images?.[0]?.src,
      marketplaceId: String(wcProduct.id),
    };
  }

  /**
   * Fetch refunds/returns from WooCommerce
   */
  async fetchRefunds(startDate?: Date, endDate?: Date): Promise<any[]> {
    const requestId = this.generateRequestId();
    try {
      const params: any = {
        per_page: 100,
        orderby: 'date',
        order: 'desc',
      };

      if (startDate) {
        params.after = startDate.toISOString();
      }
      
      if (endDate) {
        params.before = endDate.toISOString();
      }
      const response = await this.client.get('/orders', { 
        params: {
          ...params,
          status: 'refunded',
        }
      });
      
      // WooCommerce'de refunded status'ü olan siparişler iade edilmiş siparişlerdir
      // Ayrıca her siparişin refunds array'i de olabilir
      const refundedOrders = response.data || [];
      
      // Get all refunds from orders
      const allRefunds: any[] = [];
      
      for (const order of refundedOrders) {
        // Check if order has refunds
        if (order.refunds && order.refunds.length > 0) {
          for (const refund of order.refunds) {
            allRefunds.push({
              orderId: order.id,
              orderNumber: order.number || String(order.id),
              refundId: refund.id,
              amount: parseFloat(refund.total || '0'),
              reason: refund.reason || 'İade',
              date: refund.date_created || order.date_created,
              items: order.line_items.map((item: any) => ({
                productId: item.product_id,
                sku: item.sku || `WC-${item.product_id}`,
                name: item.name,
                quantity: item.quantity,
                refundedQuantity: item.quantity, // Full refund for refunded orders
              })),
            });
          }
        } else {
          // Order is fully refunded
          allRefunds.push({
            orderId: order.id,
            orderNumber: order.number || String(order.id),
            refundId: `full-${order.id}`,
            amount: parseFloat(order.total || '0'),
            reason: 'Tam iade',
            date: order.date_modified || order.date_created,
            items: order.line_items.map((item: any) => ({
              productId: item.product_id,
              sku: item.sku || `WC-${item.product_id}`,
              name: item.name,
              quantity: item.quantity,
              refundedQuantity: item.quantity,
            })),
          });
        }
      }

      this.logOperation({
        marketplace: this.type,
        method: 'fetchRefunds',
        endpoint: '/orders',
        requestId,
        success: true,
        itemCount: allRefunds.length,
      });
      
      return allRefunds;
    } catch (error: any) {
      this.logOperation({
        marketplace: this.type,
        method: 'fetchRefunds',
        endpoint: '/orders',
        requestId,
        success: false,
        errorCode: error.response?.status?.toString() || 'UNKNOWN',
        errorMessage: error.message,
      });
      throw error;
    }
  }
}


