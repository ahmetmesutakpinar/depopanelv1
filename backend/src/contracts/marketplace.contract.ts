/**
 * Marketplace Adapter Contract
 * 
 * This interface defines the contract that all marketplace adapters must implement.
 * It provides a consistent API for interacting with different marketplace platforms.
 * 
 * Architecture Note:
 * - This is part of the Contracts layer (Clean Architecture)
 * - Adapters in adapters/marketplaces/ implement this interface
 * - Services use this interface, not concrete implementations (Dependency Inversion)
 */

/**
 * Stock update payload structure
 */
export interface StockUpdatePayload {
  sku: string;
  quantity: number;
  barcode?: string;
  gtin?: string;
}

/**
 * Price update payload structure
 */
export interface PriceUpdatePayload {
  sku: string;
  price: number;
  barcode?: string;
  gtin?: string;
}

/**
 * Product sync result
 */
export interface ProductSyncResult {
  synced: number;
  failed: number;
  errors?: Array<{ sku: string; error: string }>;
}

/**
 * Order sync result
 */
export interface OrderSyncResult {
  synced: number;
  failed: number;
  orders: any[];
  errors?: Array<{ orderId: string; error: string }>;
}

/**
 * Marketplace Adapter Interface
 * 
 * All marketplace integrations must implement this interface.
 * This ensures consistent behavior across different marketplace platforms.
 */
export interface MarketplaceAdapter {
  /**
   * Test the connection to the marketplace API
   * @throws {Error} If connection fails
   */
  testConnection(): Promise<void>;

  /**
   * Sync products from marketplace to local system
   * @param startDate Optional date to fetch products updated after this date
   * @returns Promise resolving to sync result
   */
  syncProducts(startDate?: Date): Promise<ProductSyncResult>;

  /**
   * Sync orders from marketplace to local system
   * @param startDate Optional date to fetch orders created after this date
   * @returns Promise resolving to sync result
   */
  syncOrders(startDate?: Date): Promise<OrderSyncResult>;

  /**
   * Update stock quantity for products in the marketplace
   * @param updates Array of stock updates
   * @returns Promise that resolves when updates are complete
   */
  updateStock(updates: StockUpdatePayload[]): Promise<void>;

  /**
   * Update prices for products in the marketplace
   * @param updates Array of price updates
   * @returns Promise that resolves when updates are complete
   */
  updatePrice(updates: PriceUpdatePayload[]): Promise<void>;

  /**
   * Update order status in the marketplace
   * @param orderId The marketplace order ID
   * @param status The new status
   * @returns Promise that resolves when status is updated
   */
  updateOrderStatus?(orderId: string, status: string): Promise<void>;
}

/**
 * Marketplace Configuration
 * Base configuration that all marketplace adapters require
 */
export interface MarketplaceConfig {
  apiKey?: string;
  apiSecret?: string;
  apiUrl?: string;
  supplierId?: string;
  [key: string]: unknown; // Allow additional marketplace-specific config
}

