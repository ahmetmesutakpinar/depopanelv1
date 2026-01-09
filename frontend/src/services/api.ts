/// <reference types="vite/client" />
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import type {
  ApiResponse,
  LoginCredentials,
  RegisterData,
  User,
  AuthResponse,
  Warehouse,
  CreateWarehouseData,
  UpdateWarehouseData,
  Product,
  CreateProductData,
  UpdateProductData,
  ProductQueryParams,
  Stock,
  StockLog,
  AdjustStockData,
  TransferStockData,
  Order,
  CreateOrderData,
  UpdateOrderStatusData,
  BulkUpdateOrderStatusData,
  ScanOrderItemData,
  OrderQueryParams,
  CreateUserData,
  UpdateUserData,
  Integration,
  CreateIntegrationData,
  UpdateIntegrationData,
  Location,
  CreateLocationData,
  UpdateLocationData,
  InventoryCount,
  CreateInventoryCountData,
  AddCountItemData,
  UpdateCountItemData,
  PickingWave,
  CreatePickingWaveData,
  AutoCreatePickingWaveData,
  UpdatePickingWaveData,
  AddOrdersToWaveData,
  RemoveOrdersFromWaveData,
  CreateTimeBasedWaveData,
  CreateSkuBasedWaveData,
  CreatePriorityWaveData,
  CreateCustomWaveData,
  WaveCreationResult,
  PickList,
  AggregateOrderItemsResponse,
  CampaignSet,
  CreateCampaignSetData,
  UpdateCampaignSetData,
  CreateCampaignStockData,
  SellCampaignSetData,
  CargoCompany,
  CreateCargoCompanyData,
  UpdateCargoCompanyData,
  Return,
  CreateReturnData,
  ApproveReturnData,
  RejectReturnData,
  Transfer,
  CreateTransferData,
  QueryParams,
} from '@/utils/types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - Prevent requests without token for protected endpoints
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('token');
        
        // Public endpoints that don't require authentication
        const publicEndpoints = ['/auth/login', '/auth/register', '/health'];
        const isPublicEndpoint = publicEndpoints.some(endpoint => 
          config.url?.includes(endpoint)
        );
        
        // If not a public endpoint and no token, reject the request
        if (!isPublicEndpoint && !token) {
          console.warn('🚫 API request blocked: No authentication token', config.url);
          return Promise.reject(new Error('Authentication required'));
        }
        
        // Add token to headers if available
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - Handle 401 and 429 errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<{ message?: string; errors?: any }>) => {
        const message = error.response?.data?.message || 'Bir hata oluştu';
        const url = error.config?.url || '';

        // Entegrasyon endpoint'i için 404 hatalarını sessizce handle et
        if (error.response?.status === 404 && url.includes('/integrations')) {
          console.debug('Entegrasyon endpoint\'i devre dışı, sessizce handle ediliyor');
          // Boş response döndür
          return Promise.resolve({
            data: {
              success: true,
              message: 'Entegrasyonlar devre dışı',
              data: [],
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config,
          } as any);
        }

        // Handle 401 Unauthorized - Try to refresh token first
        if (error.response?.status === 401) {
          const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
          
          // Skip refresh for login/refresh endpoints to avoid infinite loop
          if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh')) {
            console.warn('🔒 401 on auth endpoint - Clearing auth and redirecting to login');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            if (!window.location.pathname.includes('/login')) {
              toast.error('Oturum süreniz doldu. Lütfen tekrar giriş yapın.');
              window.location.href = '/login';
            }
            return Promise.reject(error);
          }
          
          // Prevent infinite retry loop
          if (originalRequest._retry) {
            console.warn('🔒 Token refresh failed - Clearing auth and redirecting to login');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            if (!window.location.pathname.includes('/login')) {
              toast.error('Oturum süreniz doldu. Lütfen tekrar giriş yapın.');
              window.location.href = '/login';
            }
            return Promise.reject(error);
          }
          
          originalRequest._retry = true;
          const token = localStorage.getItem('token');
          
          if (token) {
            try {
              // Try to refresh the token
              const refreshResponse = await this.client.post('/auth/refresh', {}, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });
              
              if (refreshResponse.data.success && refreshResponse.data.data?.token) {
                const newToken = refreshResponse.data.data.token;
                localStorage.setItem('token', newToken);
                localStorage.setItem('refreshToken', newToken);
                
                // Retry the original request with new token
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return this.client(originalRequest);
              }
            } catch (refreshError) {
              // Refresh failed, clear auth and redirect
              console.warn('🔒 Token refresh failed:', refreshError);
              localStorage.removeItem('token');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
              if (!window.location.pathname.includes('/login')) {
                toast.error('Oturum süreniz doldu. Lütfen tekrar giriş yapın.');
                window.location.href = '/login';
              }
            }
          } else {
            // No token, clear auth and redirect
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            if (!window.location.pathname.includes('/login')) {
              toast.error('Oturum süreniz doldu. Lütfen tekrar giriş yapın.');
              window.location.href = '/login';
            }
          }
          
          return Promise.reject(error);
        }

        // Handle 429 Rate Limit - Show user-friendly message
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const waitTime = retryAfter ? `${retryAfter} saniye` : 'birkaç dakika';
          console.warn('⏱️ 429 Rate Limit - Too many requests');
          toast.error(`Çok fazla istek gönderildi. Lütfen ${waitTime} bekleyip tekrar deneyin.`, {
            duration: 5000,
          });
          return Promise.reject(error);
        }

        // Handle 500 Internal Server Error
        if (error.response?.status === 500) {
          const serverMessage = error.response.data?.message || 'Sunucu hatası oluştu';
          console.error('❌ 500 Internal Server Error:', {
            url: error.config?.url,
            method: error.config?.method,
            message: serverMessage,
            response: error.response.data,
          });
          toast.error(`Sunucu hatası: ${serverMessage}. Lütfen daha sonra tekrar deneyin.`, {
            duration: 5000,
          });
          return Promise.reject(error);
        }

        // Handle network errors (no response)
        if (!error.response) {
          const isNetworkError = error.message === 'Network Error' || error.code === 'ECONNABORTED';
          console.error('❌ Network Error:', {
            url: error.config?.url,
            method: error.config?.method,
            message: error.message,
            code: error.code,
          });
          
          if (isNetworkError) {
            toast.error('Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.', {
              duration: 5000,
            });
          } else {
            toast.error('İstek zaman aşımına uğradı. Lütfen tekrar deneyin.', {
              duration: 5000,
            });
          }
          return Promise.reject(error);
        }

        // Show validation errors with details
        if (error.response?.status === 422) {
          const errors = error.response.data?.errors;
          if (Array.isArray(errors) && errors.length > 0) {
            const errorMessages = errors.map((e: any) => {
              if (typeof e === 'string') return e;
              if (e.message) return e.message;
              if (e.field && e.message) return `${e.field}: ${e.message}`;
              return JSON.stringify(e);
            }).join(', ');
            toast.error(`Doğrulama hatası: ${errorMessages}`);
          } else {
            toast.error(message);
          }
        } else if (error.response?.status === 400) {
          // Show detailed 400 errors
          const errors = error.response.data?.errors;
          if (Array.isArray(errors) && errors.length > 0) {
            const errorMessages = errors.map((e: any) => {
              if (typeof e === 'string') return e;
              if (e.message) return e.message;
              if (e.field && e.message) return `${e.field}: ${e.message}`;
              if (e.path && e.message) return `${e.path.join('.')}: ${e.message}`;
              return JSON.stringify(e);
            }).join(', ');
            toast.error(`Hata: ${error.response.data?.message || 'Geçersiz veri'} - ${errorMessages}`);
          } else {
            toast.error(error.response.data?.message || message);
          }
        } else if (error.response?.status && error.response.status >= 500) {
          // Other 5xx errors
          console.error(`❌ ${error.response.status} Server Error:`, {
            url: error.config?.url,
            method: error.config?.method,
            message: error.response.data?.message || message,
            response: error.response.data,
          });
          toast.error(`Sunucu hatası (${error.response.status}): ${message}`, {
            duration: 5000,
          });
        } else if (error.response?.status !== 422 && error.response?.status !== 401 && error.response?.status !== 429) {
          // Other client errors (4xx except 401, 422, 429)
          toast.error(message);
        }
        
        // Log error details for debugging
        if (error.response?.status === 400) {
          console.error('Bad Request Details:', {
            url: error.config?.url,
            method: error.config?.method,
            requestData: error.config?.data ? JSON.parse(error.config.data) : null,
            responseData: error.response.data,
            errors: error.response.data?.errors,
          });
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    const response = await this.client.post('/auth/login', { email, password });
    const token = response.data.data?.token;
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', token); // Use same token as refresh for now
    }
    return response.data;
  }

  async register(data: RegisterData): Promise<ApiResponse<AuthResponse>> {
    const response = await this.client.post('/auth/register', data);
    return response.data;
  }

  async getProfile(): Promise<ApiResponse<User>> {
    const response = await this.client.get('/auth/profile');
    return response.data;
  }

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    const response = await this.client.put('/auth/profile', data);
    return response.data;
  }

  async updatePassword(data: { currentPassword: string; newPassword: string }) {
    const response = await this.client.put('/auth/password', data);
    return response.data;
  }

  async createSupportTicket(data: any) {
    const response = await this.client.post('/admin/tickets', data);
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await this.client.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  // Warehouses
  async getWarehouses(params?: QueryParams): Promise<ApiResponse<Warehouse[]>> {
    const response = await this.client.get('/warehouses', { params });
    return response.data;
  }

  async getActiveWarehouses(): Promise<ApiResponse<Warehouse[]>> {
    const response = await this.client.get('/warehouses/active');
    return response.data;
  }

  async getWarehouse(id: string): Promise<ApiResponse<Warehouse>> {
    const response = await this.client.get(`/warehouses/${id}`);
    return response.data;
  }

  async createWarehouse(data: CreateWarehouseData): Promise<ApiResponse<Warehouse>> {
    const response = await this.client.post('/warehouses', data);
    return response.data;
  }

  async updateWarehouse(id: string, data: UpdateWarehouseData): Promise<ApiResponse<Warehouse>> {
    const response = await this.client.put(`/warehouses/${id}`, data);
    return response.data;
  }

  async deleteWarehouse(id: string) {
    const response = await this.client.delete(`/warehouses/${id}`);
    return response.data;
  }

  async setDefaultWarehouse(id: string) {
    const response = await this.client.post(`/warehouses/${id}/set-default`);
    return response.data;
  }

  // Depo istatistikleri
  async getWarehouseStats(id: string): Promise<ApiResponse<{
    totalStock: number;
    productCount: number;
    totalLocations: number;
    usedLocations: number;
    locationUsagePercent: number;
    lowStockCount: number;
    pendingOrderCount: number;
  }>> {
    const response = await this.client.get(`/warehouses/${id}/stats`);
    return response.data;
  }

  async getAllWarehouseStats(): Promise<ApiResponse<Record<string, {
    totalStock: number;
    productCount: number;
    totalLocations: number;
    usedLocations: number;
    locationUsagePercent: number;
    lowStockCount: number;
    pendingOrderCount: number;
  }>>> {
    const response = await this.client.get('/warehouses/stats/all');
    return response.data;
  }

  // Products
  async getProducts(params?: ProductQueryParams): Promise<ApiResponse<Product[]>> {
    const response = await this.client.get('/products', { params });
    return response.data;
  }

  async getProduct(id: string): Promise<ApiResponse<Product>> {
    const response = await this.client.get(`/products/${id}`);
    return response.data;
  }

  async getProductBySku(sku: string): Promise<ApiResponse<Product>> {
    const response = await this.client.get(`/products/sku/${sku}`);
    return response.data;
  }

  async getProductByBarcode(barcode: string): Promise<ApiResponse<Product>> {
    const response = await this.client.get(`/products/barcode/${barcode}`);
    return response.data;
  }

  async getProductStats(): Promise<ApiResponse<any>> {
    const response = await this.client.get('/products/stats');
    return response.data;
  }

  async getLowStockProducts(): Promise<ApiResponse<Product[]>> {
    const response = await this.client.get('/products/low-stock');
    return response.data;
  }

  async createProduct(data: CreateProductData): Promise<ApiResponse<Product>> {
    const response = await this.client.post('/products', data);
    return response.data;
  }

  async updateProduct(id: string, data: UpdateProductData): Promise<ApiResponse<Product>> {
    const response = await this.client.put(`/products/${id}`, data);
    return response.data;
  }

  async deleteProduct(id: string) {
    const response = await this.client.delete(`/products/${id}`);
    return response.data;
  }

  // Product-Warehouse Stock Management
  async getProductWarehouses(productId: string): Promise<ApiResponse<Array<{
    warehouse: {
      id: string;
      name: string;
      code: string;
      isDefault: boolean;
    };
    stock: Stock;
    location?: {
      id: string;
      code: string;
      name: string | null;
    } | null;
  }>>> {
    const response = await this.client.get(`/products/${productId}/warehouses`);
    return response.data;
  }

  async getProductWarehouseStock(productId: string, warehouseId: string): Promise<ApiResponse<Stock & {
    warehouse: {
      id: string;
      name: string;
      code: string;
      isDefault: boolean;
    };
    location?: {
      id: string;
      code: string;
      name: string | null;
    } | null;
  }>> {
    const response = await this.client.get(`/products/${productId}/warehouses/${warehouseId}/stock`);
    return response.data;
  }

  async createOrUpdateProductStock(
    productId: string,
    warehouseId: string,
    data: {
      quantity: number;
      minQuantity?: number;
      locationId?: string;
      note?: string;
    }
  ): Promise<ApiResponse<Stock>> {
    const response = await this.client.post(`/products/${productId}/warehouses/${warehouseId}/stock`, data);
    return response.data;
  }

  async deleteProductStock(productId: string, warehouseId: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete(`/products/${productId}/warehouses/${warehouseId}/stock`);
    return response.data;
  }

  // Product Matching
  async getUnmatchedProducts(): Promise<ApiResponse<Array<{
    integrationId: string;
    integrationName: string;
    marketplaceType: string;
    marketplaceProductId: string | null;
    sku: string | null;
    barcode: string | null;
    orderCount: number;
    lastSeen: string | null;
  }>>> {
    const response = await this.client.get('/products/unmatched');
    return response.data;
  }

  async matchProduct(productId: string, data: {
    integrationId: string;
    marketplaceProductId: string;
    sku?: string;
    barcode?: string | null;
    price?: number | null;
    listingUrl?: string | null;
  }): Promise<ApiResponse<{
    id: string;
    productId: string;
    integrationId: string;
    marketplaceProductId: string;
  }>> {
    const response = await this.client.post(`/products/${productId}/match`, data);
    return response.data;
  }

  async unmatchProduct(productId: string, data: {
    integrationId: string;
    marketplaceProductId: string;
  }): Promise<ApiResponse<void>> {
    const response = await this.client.post(`/products/${productId}/unmatch`, data);
    return response.data;
  }

  async mergeProducts(masterProductId: string, duplicateProductId: string): Promise<ApiResponse<{
    product: Product;
    mergedMarketplaces: Array<{
      integrationId: string;
      integrationName: string;
      marketplaceType: string;
      marketplaceProductId: string;
    }>;
    allMarketplaces: Array<{
      integrationId: string;
      integrationName: string;
      marketplaceType: string;
      marketplaceProductId: string;
    }>;
  }>> {
    const response = await this.client.post(`/products/${masterProductId}/merge/${duplicateProductId}`);
    return response.data;
  }

  // Stocks
  async getProductStocks(productId: string): Promise<ApiResponse<Stock[]>> {
    const response = await this.client.get(`/stocks/product/${productId}`);
    return response.data;
  }

  async getWarehouseStocks(warehouseId: string, params?: QueryParams): Promise<ApiResponse<Stock[]>> {
    const response = await this.client.get(`/stocks/warehouse/${warehouseId}`, { params });
    return response.data;
  }

  async getStockLogs(params?: QueryParams): Promise<ApiResponse<StockLog[]>> {
    const response = await this.client.get('/stocks/logs', { params });
    return response.data;
  }

  async adjustStock(data: AdjustStockData): Promise<ApiResponse<Stock>> {
    const response = await this.client.post('/stocks/adjust', data);
    return response.data;
  }

  async transferStock(data: TransferStockData): Promise<ApiResponse<any>> {
    const response = await this.client.post('/stocks/transfer', data);
    return response.data;
  }

  async setMinQuantity(data: { productId: string; warehouseId: string; minQuantity: number }): Promise<ApiResponse<Stock>> {
    const response = await this.client.post('/stocks/min-quantity', data);
    return response.data;
  }

  // Orders
  async getOrders(params?: OrderQueryParams): Promise<ApiResponse<Order[]>> {
    const response = await this.client.get('/orders', { params });
    return response.data;
  }

  async getOrder(id: string): Promise<ApiResponse<Order>> {
    const response = await this.client.get(`/orders/${id}`);
    return response.data;
  }

  async getOrderByBarcode(barcode: string): Promise<ApiResponse<Order>> {
    const response = await this.client.get(`/orders/barcode/${barcode}`);
    return response.data;
  }

  async getOrderByShippingCode(code: string): Promise<ApiResponse<Order>> {
    const response = await this.client.get('/orders/by-shipping-code', { params: { code } });
    return response.data;
  }

  async getOrderStats(params?: { startDate?: string; endDate?: string }): Promise<ApiResponse<any>> {
    const response = await this.client.get('/orders/stats', { params });
    return response.data;
  }

  async getDailyOrderedProducts(date?: string): Promise<ApiResponse<any>> {
    const params = date ? { date } : {};
    const response = await this.client.get('/orders/daily-products', { params });
    return response.data;
  }

  async createOrder(data: CreateOrderData): Promise<ApiResponse<Order>> {
    const response = await this.client.post('/orders', data);
    return response.data;
  }

  async updateOrderStatus(id: string, data: UpdateOrderStatusData): Promise<ApiResponse<Order>> {
    const response = await this.client.put(`/orders/${id}/status`, data);
    return response.data;
  }

  async bulkUpdateOrderStatus(data: BulkUpdateOrderStatusData): Promise<ApiResponse<{ updated: number }>> {
    const response = await this.client.put('/orders/bulk-update', data);
    return response.data;
  }

  async cancelOrder(id: string): Promise<ApiResponse<Order>> {
    const response = await this.client.post(`/orders/${id}/cancel`);
    return response.data;
  }

  async scanOrderItem(orderId: string, data: ScanOrderItemData): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/orders/${orderId}/scan-item`, data);
    return response.data;
  }

  // Returns
  async getReturns(params?: QueryParams): Promise<ApiResponse<Return[]>> {
    const response = await this.client.get('/returns', { params });
    return response.data;
  }

  async getReturn(id: string): Promise<ApiResponse<Return>> {
    const response = await this.client.get(`/returns/${id}`);
    return response.data;
  }

  async createReturn(data: CreateReturnData): Promise<ApiResponse<Return>> {
    const response = await this.client.post('/returns', data);
    return response.data;
  }

  async approveReturn(id: string, data: ApproveReturnData): Promise<ApiResponse<Return>> {
    const response = await this.client.post(`/returns/${id}/approve`, data);
    return response.data;
  }

  async rejectReturn(id: string, data?: RejectReturnData): Promise<ApiResponse<Return>> {
    const response = await this.client.post(`/returns/${id}/reject`, data || {});
    return response.data;
  }

  async completeReturn(id: string): Promise<ApiResponse<Return>> {
    const response = await this.client.post(`/returns/${id}/complete`);
    return response.data;
  }

  // Location Transfers
  async transferLocationStock(data: { fromLocationId: string; toLocationId: string; productId: string; variantId?: string; quantity: number }): Promise<ApiResponse<any>> {
    const response = await this.client.post('/stocks/transfer-location', data);
    return response.data;
  }

  // Health check
  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }

  // Users
  async getUsers(params?: QueryParams & { role?: string; isActive?: boolean }): Promise<ApiResponse<User[]>> {
    const response = await this.client.get('/users', { params });
    return response.data;
  }

  async getUser(id: string): Promise<ApiResponse<User>> {
    const response = await this.client.get(`/users/${id}`);
    return response.data;
  }

  async createUser(data: CreateUserData): Promise<ApiResponse<User>> {
    const response = await this.client.post('/users', data);
    return response.data;
  }

  async updateUser(id: string, data: UpdateUserData): Promise<ApiResponse<User>> {
    const response = await this.client.put(`/users/${id}`, data);
    return response.data;
  }

  async deleteUser(id: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete(`/users/${id}`);
    return response.data;
  }

  // Integrations
  async getIntegrations(): Promise<ApiResponse<Integration[]>> {
    try {
      const response = await this.client.get('/integrations');
      return response.data;
    } catch (error: any) {
      // Entegrasyon endpoint'i devre dışıysa (404) boş array döndür
      if (error.response?.status === 404) {
        return {
          success: true,
          message: 'Entegrasyonlar devre dışı',
          data: [],
        };
      }
      throw error;
    }
  }

  async getIntegration(id: string): Promise<ApiResponse<Integration>> {
    try {
      const response = await this.client.get(`/integrations/${id}`);
      return response.data;
    } catch (error: any) {
      // Entegrasyon endpoint'i devre dışıysa (404) hata fırlatma
      if (error.response?.status === 404) {
        throw new Error('Entegrasyon bulunamadı');
      }
      throw error;
    }
  }

  async createIntegration(data: CreateIntegrationData): Promise<ApiResponse<Integration>> {
    const response = await this.client.post('/integrations', data);
    return response.data;
  }

  async updateIntegration(id: string, data: UpdateIntegrationData): Promise<ApiResponse<Integration>> {
    const response = await this.client.put(`/integrations/${id}`, data);
    return response.data;
  }

  async deleteIntegration(id: string, options?: { hardDelete?: boolean; cleanup?: boolean }) {
    const params = new URLSearchParams();
    if (options?.hardDelete) params.append('hardDelete', 'true');
    if (options?.cleanup) params.append('cleanup', 'true');
    const queryString = params.toString();
    const url = `/integrations/${id}${queryString ? `?${queryString}` : ''}`;
    const response = await this.client.delete(url);
    return response.data;
  }

  async clearActiveIntegrations(password: string) {
    const response = await this.client.post('/integrations/clear-active', { password });
    return response.data;
  }

  async cleanupOrphans() {
    const response = await this.client.post('/integrations/cleanup-orphans');
    return response.data;
  }

  async testIntegration(id: string) {
    const response = await this.client.post(`/integrations/${id}/test`);
    return response.data;
  }

  async syncIntegration(id: string) {
    const response = await this.client.post(`/integrations/${id}/sync`);
    return response.data;
  }

  async manualSyncIntegration(id: string) {
    const response = await this.client.post(`/integrations/${id}/manual-sync`);
    return response.data;
  }

  async getIntegrationLogs(id: string) {
    const response = await this.client.get(`/integrations/${id}/logs`);
    return response.data;
  }

  // Locations
  async getLocations(warehouseId: string, params?: QueryParams): Promise<ApiResponse<Location[]>> {
    const response = await this.client.get(`/locations/warehouse/${warehouseId}`, { params });
    return response.data;
  }

  async getLocation(id: string): Promise<ApiResponse<Location>> {
    const response = await this.client.get(`/locations/${id}`);
    return response.data;
  }

  async getLocationStock(id: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/locations/${id}/stock`);
    return response.data;
  }

  async getLocationStockDetails(id: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/locations/${id}/stock-details`);
    return response.data;
  }

  async getWarehouseLocationStock(warehouseId: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/locations/warehouse/${warehouseId}/stock`);
    return response.data;
  }

  async assignProductToLocation(locationId: string, data: { productId: string; variantId?: string; isPrimary?: boolean }): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/locations/${locationId}/assign-product`, data);
    return response.data;
  }

  async removeProductFromLocation(locationId: string, data: { productId: string; variantId?: string }): Promise<ApiResponse<void>> {
    const response = await this.client.delete(`/locations/${locationId}/product`, { data });
    return response.data;
  }

  async getProductLocations(productId: string, variantId?: string): Promise<ApiResponse<Location[]>> {
    const response = await this.client.get(`/locations/product/${productId}`, {
      params: variantId ? { variantId } : {},
    });
    return response.data;
  }

  async createLocation(warehouseId: string, data: CreateLocationData): Promise<ApiResponse<Location>> {
    const response = await this.client.post(`/locations/warehouse/${warehouseId}`, data);
    return response.data;
  }

  async updateLocation(id: string, data: UpdateLocationData): Promise<ApiResponse<Location>> {
    const response = await this.client.put(`/locations/${id}`, data);
    return response.data;
  }

  async deleteLocation(id: string) {
    const response = await this.client.delete(`/locations/${id}`);
    return response.data;
  }

  // Barkod/SKU ile ürün ara ve lokasyonlarını getir (Ürün Nerede?)
  async searchProductLocations(query: string): Promise<ApiResponse<any>> {
    const response = await this.client.get('/locations/search', { params: { query } });
    return response.data;
  }

  // Depodaki lokasyonsuz (rafa atanmamış) stok miktarını getir
  async getUnassignedStock(productId: string, warehouseId: string, variantId?: string): Promise<ApiResponse<{ quantity: number }>> {
    const response = await this.client.get('/locations/unassigned-stock', {
      params: { productId, warehouseId, variantId },
    });
    return response.data;
  }

  // Lokasyona stok ekle (barkod okutarak yerleştirme)
  async addStockToLocation(data: {
    productId: string;
    variantId?: string;
    warehouseId: string;
    locationId: string;
    quantity: number;
  }): Promise<ApiResponse<any>> {
    const response = await this.client.post('/locations/add-stock', data);
    return response.data;
  }

  // Lokasyonlar arası stok taşı
  async transferStockBetweenLocations(data: {
    productId: string;
    variantId?: string;
    warehouseId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
  }): Promise<ApiResponse<any>> {
    const response = await this.client.post('/locations/transfer-stock', data);
    return response.data;
  }

  // Inventory Counts
  async getInventoryCounts(params?: QueryParams): Promise<ApiResponse<InventoryCount[]>> {
    const response = await this.client.get('/inventory-counts', { params });
    return response.data;
  }

  async getInventoryCount(id: string): Promise<ApiResponse<InventoryCount>> {
    const response = await this.client.get(`/inventory-counts/${id}`);
    return response.data;
  }

  async createInventoryCount(data: CreateInventoryCountData): Promise<ApiResponse<InventoryCount>> {
    const response = await this.client.post('/inventory-counts', data);
    return response.data;
  }

  async startInventoryCount(id: string): Promise<ApiResponse<InventoryCount>> {
    const response = await this.client.post(`/inventory-counts/${id}/start`);
    return response.data;
  }

  async addCountItem(countId: string, data: AddCountItemData): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/inventory-counts/${countId}/items`, data);
    return response.data;
  }

  async updateCountItem(countId: string, itemId: string, data: UpdateCountItemData): Promise<ApiResponse<any>> {
    const response = await this.client.put(`/inventory-counts/${countId}/items/${itemId}`, data);
    return response.data;
  }

  async completeInventoryCount(id: string, data?: { explanation?: string }) {
    const response = await this.client.post(`/inventory-counts/${id}/complete`, data || {});
    return response.data;
  }

  async approveInventoryCount(id: string) {
    const response = await this.client.post(`/inventory-counts/${id}/approve`);
    return response.data;
  }

  async deleteInventoryCount(id: string) {
    const response = await this.client.delete(`/inventory-counts/${id}`);
    return response.data;
  }

  async deleteInventoryCountItem(countId: string, itemId: string) {
    const response = await this.client.delete(`/inventory-counts/${countId}/items/${itemId}`);
    return response.data;
  }

  // Picking Waves
  async getPickingWaves(params?: QueryParams & { status?: string; warehouseId?: string }): Promise<ApiResponse<PickingWave[]>> {
    const response = await this.client.get('/picking-waves', { params });
    return response.data;
  }

  async getPickingWave(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.get(`/picking-waves/${id}`);
    return response.data;
  }

  async createPickingWave(data: CreatePickingWaveData): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.post('/picking-waves', data);
    return response.data;
  }

  async autoCreatePickingWave(data: AutoCreatePickingWaveData): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.post('/picking-waves/auto', data);
    return response.data;
  }

  async updatePickingWave(id: string, data: UpdatePickingWaveData): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.put(`/picking-waves/${id}`, data);
    return response.data;
  }

  async addOrdersToWave(id: string, data: AddOrdersToWaveData): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.post(`/picking-waves/${id}/orders`, data);
    return response.data;
  }

  async removeOrdersFromWave(id: string, data: RemoveOrdersFromWaveData): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.put(`/picking-waves/${id}/orders/remove`, data);
    return response.data;
  }

  async startPickingWave(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.post(`/picking-waves/${id}/start`);
    return response.data;
  }

  async completePickingWave(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.post(`/picking-waves/${id}/complete`);
    return response.data;
  }

  async completePicking(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.put(`/picking-waves/${id}/complete-picking`);
    return response.data;
  }

  async markOrderAsPacked(waveId: string, orderId: string): Promise<ApiResponse<{ wave: PickingWave; order: Order }>> {
    const response = await this.client.put(`/picking-waves/${waveId}/orders/${orderId}/pack`);
    return response.data;
  }

  async markOrderAsShipped(waveId: string, orderId: string, data?: { trackingNumber?: string; cargoCompanyId?: string }): Promise<ApiResponse<{ wave: PickingWave; order: Order; allShipped: boolean }>> {
    const response = await this.client.put(`/picking-waves/${waveId}/orders/${orderId}/ship`, data);
    return response.data;
  }

  // New Wave System Methods
  async createTimeBasedWave(data: CreateTimeBasedWaveData): Promise<ApiResponse<WaveCreationResult>> {
    const response = await this.client.post('/picking-waves/auto/time-based', data);
    return response.data;
  }

  async createSkuBasedWave(data: CreateSkuBasedWaveData): Promise<ApiResponse<WaveCreationResult>> {
    const response = await this.client.post('/picking-waves/auto/sku-based', data);
    return response.data;
  }

  async createPriorityWave(data: CreatePriorityWaveData): Promise<ApiResponse<WaveCreationResult>> {
    const response = await this.client.post('/picking-waves/auto/priority', data);
    return response.data;
  }

  async createCustomWave(data: CreateCustomWaveData): Promise<ApiResponse<WaveCreationResult[]>> {
    const response = await this.client.post('/picking-waves/auto/custom', data);
    return response.data;
  }

  async getPickList(id: string, format: 'print' | 'mobile' = 'mobile'): Promise<ApiResponse<PickList | string>> {
    const response = await this.client.get(`/picking-waves/${id}/pick-list`, {
      params: { format },
    });
    return response.data;
  }

  async transitionToPacking(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.put(`/picking-waves/${id}/packing`);
    return response.data;
  }

  async transitionToShipped(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.put(`/picking-waves/${id}/shipped`);
    return response.data;
  }

  async closeWave(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.put(`/picking-waves/${id}/close`);
    return response.data;
  }

  async deletePickingWave(id: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete(`/picking-waves/${id}`);
    return response.data;
  }

  async aggregatePickingWaveItems(id: string): Promise<ApiResponse<AggregateOrderItemsResponse>> {
    const response = await this.client.get(`/picking-waves/${id}/aggregate`);
    return response.data;
  }

  async markPickingWaveAsPicked(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.post(`/picking-waves/${id}/pick`);
    return response.data;
  }

  async markPickingWaveAsShipped(id: string): Promise<ApiResponse<PickingWave>> {
    const response = await this.client.post(`/picking-waves/${id}/ship`);
    return response.data;
  }

  async scanPickingWaveBarcode(waveId: string, barcode: string): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/picking-waves/${waveId}/scan`, { barcode });
    return response.data;
  }

  // Campaign Sets
  async getCampaignSets(params?: QueryParams): Promise<ApiResponse<CampaignSet[]>> {
    const response = await this.client.get('/campaign-sets', { params });
    return response.data;
  }

  async getCampaignSet(id: string): Promise<ApiResponse<CampaignSet>> {
    const response = await this.client.get(`/campaign-sets/${id}`);
    return response.data;
  }

  async createCampaignSet(data: CreateCampaignSetData): Promise<ApiResponse<CampaignSet>> {
    const response = await this.client.post('/campaign-sets', data);
    return response.data;
  }

  async updateCampaignSet(id: string, data: UpdateCampaignSetData): Promise<ApiResponse<CampaignSet>> {
    const response = await this.client.put(`/campaign-sets/${id}`, data);
    return response.data;
  }

  async deleteCampaignSet(id: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete(`/campaign-sets/${id}`);
    return response.data;
  }

  async createCampaignStock(campaignSetId: string, data: CreateCampaignStockData): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/campaign-sets/${campaignSetId}/stock`, data);
    return response.data;
  }

  async sellCampaignSet(campaignSetId: string, data: SellCampaignSetData): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/campaign-sets/${campaignSetId}/sell`, data);
    return response.data;
  }

  async getCampaignStock(campaignSetId: string, params?: QueryParams): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/campaign-sets/${campaignSetId}/stock`, { params });
    return response.data;
  }

  // Cargo Companies
  async getCargoCompanies(params?: QueryParams): Promise<ApiResponse<CargoCompany[]>> {
    const response = await this.client.get('/cargo-companies', { params });
    return response.data;
  }

  async getCargoCompany(id: string): Promise<ApiResponse<CargoCompany>> {
    const response = await this.client.get(`/cargo-companies/${id}`);
    return response.data;
  }

  async createCargoCompany(data: CreateCargoCompanyData): Promise<ApiResponse<CargoCompany>> {
    const response = await this.client.post('/cargo-companies', data);
    return response.data;
  }

  async updateCargoCompany(id: string, data: UpdateCargoCompanyData): Promise<ApiResponse<CargoCompany>> {
    const response = await this.client.put(`/cargo-companies/${id}`, data);
    return response.data;
  }

  async deleteCargoCompany(id: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete(`/cargo-companies/${id}`);
    return response.data;
  }

  // Generic methods for admin routes
  async get(url: string, config?: any) {
    const response = await this.client.get(url, config);
    return response.data;
  }

  async post(url: string, data?: any) {
    const response = await this.client.post(url, data);
    return response.data;
  }

  async put(url: string, data?: any) {
    const response = await this.client.put(url, data);
    return response.data;
  }

  async delete(url: string) {
    const response = await this.client.delete(url);
    return response.data;
  }
}

export const api = new ApiService();
export default api;

