// ==================== USER & AUTH ====================

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  permissions?: Record<string, boolean>;
  companyId: string;
  companyName?: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresIn: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  companyName: string;
  companyEmail: string;
  companyPhone?: string;
  companyAddress?: string;
  taxNumber?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

// ==================== COMPANY ====================

export type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface Company {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  status: CompanyStatus;
  createdAt: string;
}

// ==================== WAREHOUSE ====================

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  isDefault: boolean;
  isActive: boolean;
  companyId: string;
  createdAt: string;
}

export interface CreateWarehouseData {
  name: string;
  code?: string;
  address?: string;
  city?: string;
  isDefault?: boolean;
}

// ==================== CATEGORY ====================

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  companyId: string;
}

// ==================== PRODUCT ====================

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  gtin?: string; // GTIN, UPC, EAN, ISBN
  name: string;
  description?: string;
  brand?: string;
  price: number;
  costPrice?: number;
  taxRate: number;
  weight?: number;
  width?: number;
  height?: number;
  depth?: number;
  imageUrl?: string;
  isActive: boolean;
  categoryId?: string;
  category?: Category;
  companyId: string;
  wooCommerceId?: number;
  stocks: StockInfo[];
  totalStock: number;
  totalReserved: number;
  availableStock: number;
  primaryLocation?: {
    id: string;
    code: string;
    name?: string | null;
    zone?: string | null;
    aisle?: string | null;
    shelf?: string | null;
    bin?: string | null;
    warehouseId?: string;
  } | null;
  // Marketplace matching status
  isMatched?: boolean;
  matchedMarketplaces?: string[]; // MarketplaceType[]: 'WOOCOMMERCE' | 'TRENDYOL' | 'HEPSIBURADA' | 'N11' | 'PAZARAMA' | 'AMAZON' | 'SHOPIFY' | 'IKAS'
  missingMarketplaces?: string[]; // MarketplaceType[]
  marketplaceLinks?: Record<string, string | null>; // Marketplace type -> listingUrl mapping
  createdAt: string;
}

export interface StockInfo {
  id: string;
  quantity: number;
  reservedQty: number;
  warehouse: {
    id: string;
    name: string;
    code: string;
  };
}

export interface CreateProductData {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  brand?: string;
  price: number;
  costPrice?: number;
  taxRate?: number;
  weight?: number;
  width?: number;
  height?: number;
  depth?: number;
  imageUrl?: string;
  categoryId?: string;
  initialStock?: {
    warehouseId: string;
    quantity: number;
  };
}

// ==================== STOCK ====================

export type StockLogType = 'IN' | 'OUT' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER';

export interface Stock {
  id: string;
  quantity: number;
  reservedQty: number;
  minQuantity: number;
  productId: string;
  warehouseId: string;
  product?: {
    id: string;
    name: string;
    sku: string;
    barcode?: string;
    imageUrl?: string;
  };
  variant?: {
    id: string;
    name: string;
    sku: string;
  };
}

export interface StockLog {
  id: string;
  type: StockLogType;
  quantity: number;
  previousQty: number;
  newQty: number;
  note?: string;
  reference?: string;
  productId: string;
  warehouseId: string;
  userId?: string;
  product: {
    id: string;
    name: string;
    sku: string;
  };
  warehouse: {
    id: string;
    name: string;
    code: string;
  };
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export interface AdjustStockData {
  productId: string;
  warehouseId: string;
  quantity: number;
  type: 'IN' | 'OUT' | 'RETURN' | 'ADJUSTMENT';
  note?: string;
}

export interface TransferStockData {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  note?: string;
}

// ==================== ORDER ====================

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';

export interface Order {
  id: string;
  orderNumber: string;
  marketplaceOrderId?: string;
  status: OrderStatus;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCity?: string;
  shippingDistrict?: string;
  shippingPostalCode?: string;
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  discount: number;
  total: number;
  cargoCompany?: string;
  trackingNumber?: string;
  customerNote?: string;
  internalNote?: string;
  shippedAt?: string;
  deliveredAt?: string;
  items: OrderItem[];
  warehouse?: {
    id: string;
    name: string;
    code: string;
  };
  integration?: {
    id: string;
    type: string;
    name: string;
  };
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export interface OrderItem {
  id: string;
  sku: string;
  productId: string | null; // ✅ FIX: productId can be NULL, SKU is primary identity
  variantId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  total: number;
  product?: { // ✅ FIX: product is optional (may be null if productId is null)
    id: string;
    name: string;
    sku: string;
    barcode?: string | null;
    gtin?: string | null;
    imageUrl?: string;
    locationAssignments?: Array<{
      id: string;
      isPrimary: boolean;
      location: {
        id: string;
        code: string;
        name?: string | null;
        zone?: string | null;
        aisle?: string | null;
        shelf?: string | null;
        bin?: string | null;
      };
    }>;
  };
  variant?: {
    id: string;
    sku: string;
    barcode?: string | null;
    locationAssignments?: Array<{
      id: string;
      isPrimary: boolean;
      location: {
        id: string;
        code: string;
        name?: string | null;
        zone?: string | null;
        aisle?: string | null;
        shelf?: string | null;
        bin?: string | null;
      };
    }>;
  } | null;
}

export interface CreateOrderData {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCity?: string;
  shippingDistrict?: string;
  shippingPostalCode?: string;
  warehouseId?: string;
  customerNote?: string;
  items: {
    productId: string;
    quantity: number;
  }[];
}

// ==================== API RESPONSE ====================

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any;
  code?: string; // Error code for programmatic handling
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ==================== STATS ====================

export interface DashboardStats {
  totalProducts: number;
  totalStockValue: number;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
}

// ==================== UPDATE TYPES ====================

export interface UpdateProductData {
  sku?: string;
  barcode?: string;
  gtin?: string;
  name?: string;
  description?: string;
  brand?: string;
  price?: number;
  costPrice?: number;
  taxRate?: number;
  weight?: number;
  width?: number;
  height?: number;
  depth?: number;
  imageUrl?: string;
  categoryId?: string;
  isActive?: boolean;
}

export interface UpdateOrderStatusData {
  status: OrderStatus;
  cargoCompany?: string;
  trackingNumber?: string;
  internalNote?: string;
}

export interface BulkUpdateOrderStatusData {
  orderIds: string[];
  status: OrderStatus;
  cargoCompany?: string;
  trackingNumber?: string;
  internalNote?: string;
}

export interface ScanOrderItemData {
  barcode: string;
  locationId?: string;
}

export interface UpdateWarehouseData {
  name?: string;
  code?: string;
  address?: string;
  city?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
  permissions?: Record<string, boolean>;
}

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: UserRole;
  permissions?: Record<string, boolean>;
  companyId?: string;
}

// ==================== QUERY PARAMS ====================

export interface QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface OrderQueryParams extends QueryParams {
  status?: OrderStatus;
  integrationId?: string;
  warehouseId?: string;
  pickingWaveId?: string;
  startDate?: string;
  endDate?: string;
}

export interface ProductQueryParams extends QueryParams {
  categoryId?: string;
  isActive?: boolean;
}

// ==================== INTEGRATION ====================

export interface IntegrationSettings {
  readOnly?: boolean;
  syncMode?: string;
  skipApiTest?: boolean;
  middlewareType?: string;
  middlewareConfig?: {
    apiUrl?: string;
    apiKey?: string;
    [key: string]: any;
  };
  merchantId?: string;
  username?: string;
  password?: string;
  marketplaceId?: string;
}

export interface Integration {
  id: string;
  type: string;
  name: string;
  status: string;
  config: Record<string, any>;
  companyId: string;
  createdAt: string;
}

export interface CreateIntegrationData {
  type: string;
  name: string;
  config: Record<string, any>;
  status?: string;
}

export interface UpdateIntegrationData {
  name?: string;
  config?: Record<string, any>;
  status?: string;
}

// ==================== LOCATION ====================

export interface Location {
  id: string;
  code: string;
  name?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
  warehouseId: string;
  companyId: string;
  createdAt: string;
}

export interface CreateLocationData {
  code: string;
  name?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
}

export interface UpdateLocationData {
  code?: string;
  name?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
}

// ==================== INVENTORY COUNT ====================

export interface InventoryCount {
  id: string;
  warehouseId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  approvedAt?: string;
  items: InventoryCountItem[];
  createdAt: string;
}

export interface InventoryCountItem {
  id: string;
  productId: string;
  variantId?: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
}

export interface CreateInventoryCountData {
  warehouseId: string;
  locationIds?: string[];
}

export interface AddCountItemData {
  productId: string;
  variantId?: string;
  countedQuantity: number;
}

export interface UpdateCountItemData {
  countedQuantity: number;
}

// ==================== PICKING WAVE ====================

export type WaveType = 'TIME_BASED' | 'SKU_BASED' | 'PRIORITY' | 'MANUAL' | 'MARKETPLACE' | 'SHIPPING' | 'COUNTRY' | 'MIXED';
export type WaveStatus = 'CREATED' | 'PICKING' | 'PACKING' | 'SHIPPED' | 'CLOSED' | 'CANCELLED' | 'EXCEPTION';

export interface PickingWave {
  id: string;
  code?: string; // Backend'den gelen dalga kodu (örn: WAVE-20251224-0005)
  waveNumber: string;
  status: string | WaveStatus;
  type?: WaveType;
  priority: number;
  warehouseId: string;
  assignedToId?: string;
  startedAt?: string;
  completedAt?: string;
  closedAt?: string;
  orders: Order[];
  createdAt: string;
  creationReason?: string;
  totalOrders?: number;
  totalItems?: number;
  hasStockIssue?: boolean;
  stockIssueNote?: string;
  createdBy?: string;
  cutOffTime?: string;
}

export interface CreatePickingWaveData {
  warehouseId: string;
  orderIds?: string[];
  priority?: number;
  assignedToId?: string;
}

export interface AutoCreatePickingWaveData {
  warehouseId: string;
  status?: OrderStatus;
  maxOrders?: number;
  priority?: number;
}

export interface UpdatePickingWaveData {
  status?: string;
  priority?: number;
  assignedToId?: string;
}

export interface AddOrdersToWaveData {
  orderIds: string[];
}

export interface RemoveOrdersFromWaveData {
  orderIds: string[];
}

// New Wave System Types
export interface CreateTimeBasedWaveData {
  warehouseId: string;
  cutOffTime: string; // HH:mm format
  priority?: number;
  maxOrders?: number;
  minOrders?: number;
}

export interface CreateSkuBasedWaveData {
  warehouseId: string;
  priority?: number;
  maxOrders?: number;
  minOrders?: number;
  skuList?: string[];
}

export interface CreatePriorityWaveData {
  warehouseId: string;
  priority?: number;
  maxOrders?: number;
  minOrders?: number;
}

export interface WaveRule {
  orderStatus?: 'READY_TO_PICK' | 'PENDING' | 'PROCESSING';
  requireStockAvailable?: boolean;
  marketplace?: string[];
  shippingMethod?: string[];
  carrier?: string[];
  destinationCountry?: string[];
  singleSkuOnly?: boolean;
  multiSkuOnly?: boolean;
  sameSkuConsolidation?: boolean;
  maxOrdersPerWave?: number;
  minOrdersPerWave?: number;
  cutOffTime?: string; // HH:mm
  timeWindow?: {
    start: string; // HH:mm
    end: string; // HH:mm
  };
  priorityOnly?: boolean;
  slaDriven?: boolean;
  skuList?: string[];
  excludeSkuList?: string[];
  warehouseId?: string;
}

export interface CreateCustomWaveData {
  warehouseId: string;
  type: WaveType;
  rules: WaveRule;
  maxOrdersPerWave?: number;
  minOrdersPerWave?: number;
  priority?: number;
}

export interface WaveCreationResult {
  waveId: string;
  waveCode: string;
  totalOrders: number;
  totalItems: number;
  creationReason: string;
  eligibleOrders: number;
  excludedOrders: number;
  excludedReasons?: Record<string, number>;
}

export interface PickList {
  waveId: string;
  waveCode: string;
  warehouseId: string;
  warehouseName: string;
  status: string;
  createdAt: string;
  totalOrders: number;
  totalItems: number;
  items: PickListItem[];
  sortedByLocation: boolean;
}

export interface PickListItem {
  sku: string;
  productName: string;
  barcode: string | null;
  gtin: string | null;
  location: {
    code: string;
    zone?: string;
    aisle?: string;
    shelf?: string;
    bin?: string;
  } | null;
  totalQuantity: number;
  pickedQuantity: number;
  remainingQuantity: number;
  orders: Array<{
    orderNumber: string;
    customerName: string;
    quantity: number;
  }>;
}

export interface AggregateOrderItemsResponse {
  waveId: string;
  waveCode: string;
  warehouseId: string;
  totalOrders: number;
  aggregatedItems?: Array<{
    productId: string;
    variantId?: string;
    productName: string;
    productSku: string;
    productBarcode?: string;
    variantName?: string;
    totalQuantity: number;
    pickedQuantity: number;
    remainingQuantity: number;
    orders: Array<{
      id: string;
      orderNumber: string;
      customerName: string;
      items: Array<{
        productId: string;
        variantId?: string;
        productName: string;
        productSku: string;
        barcode?: string;
        quantity: number;
      }>;
    }>;
  }>;
  items?: Array<{
    productId: string;
    variantId?: string;
    productName: string;
    productSku: string;
    productBarcode?: string;
    variantName?: string;
    totalQuantity: number;
    pickedQuantity: number;
    remainingQuantity: number;
    orders: Array<{
      id: string;
      orderNumber: string;
      customerName: string;
      items: Array<{
        productId: string;
        variantId?: string;
        productName: string;
        productSku: string;
        barcode?: string;
        quantity: number;
      }>;
    }>;
  }>;
  orders?: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    status: string;
    items: Array<{
      productId: string;
      variantId?: string;
      productName: string;
      productSku: string;
      barcode?: string;
      quantity: number;
    }>;
  }>;
}

// ==================== CAMPAIGN SET ====================

export interface CampaignSet {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  companyId: string;
  products: Product[];
  createdAt: string;
}

export interface CreateCampaignSetData {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  productIds: string[];
}

export interface UpdateCampaignSetData {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  productIds?: string[];
  isActive?: boolean;
}

export interface CreateCampaignStockData {
  warehouseId: string;
  locationId?: string;
  quantity: number;
}

export interface SellCampaignSetData {
  orderId: string;
  quantity: number;
}

// ==================== CARGO COMPANY ====================

export interface CargoCompany {
  id: string;
  name: string;
  code: string;
  apiUrl?: string;
  apiKey?: string;
  isActive: boolean;
  companyId: string;
  createdAt: string;
}

export interface CreateCargoCompanyData {
  name: string;
  code: string;
  apiUrl?: string;
  apiKey?: string;
  isActive?: boolean;
}

export interface UpdateCargoCompanyData {
  name?: string;
  code?: string;
  apiUrl?: string;
  apiKey?: string;
  isActive?: boolean;
}

// ==================== RETURN ====================

export interface Return {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  items: ReturnItem[];
  createdAt: string;
}

export interface ReturnItem {
  id: string;
  orderItemId: string;
  quantity: number;
  reason: string;
}

export interface CreateReturnData {
  orderId: string;
  reason: string;
  items: Array<{
    orderItemId: string;
    quantity: number;
    reason: string;
  }>;
}

export interface ApproveReturnData {
  warehouseId: string;
  locationId?: string;
}

export interface RejectReturnData {
  reason?: string;
}

// ==================== TRANSFER ====================

export interface Transfer {
  id: string;
  transferCode: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: string;
  items: TransferItem[];
  createdAt: string;
}

export interface TransferItem {
  id: string;
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CreateTransferData {
  fromWarehouseId: string;
  toWarehouseId: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    notes?: string;
  }>;
}

// ==================== STOCK ALERT ====================

export interface StockAlert {
  id: string;
  productId: string;
  warehouseId: string;
  currentQuantity: number;
  minQuantity: number;
  status: string;
  createdAt: string;
}

// ==================== ERROR ====================

export interface ApiError {
  code?: string;
  message: string;
  field?: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

