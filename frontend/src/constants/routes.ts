/**
 * Route path constants for consistent usage across the application
 * Use these constants instead of hardcoding paths
 * 
 * This file is separate from routes/index.tsx to avoid circular dependencies
 */
export const ROUTES = {
  // Public
  LOGIN: '/login',
  REGISTER: '/register',
  
  // Super Admin
  ADMIN: '/admin',
  
  // Main
  DASHBOARD: '/dashboard',
  PRODUCTS: '/products',
  CAMPAIGN_SETS: '/campaign-sets',
  ORDERS: '/orders',
  ORDER_PICKING: '/order-picking',
  PICKING_WAVES: '/picking-waves',
  WAVE_DETAIL: '/picking-waves/:id',
  
  // Warehouse Management
  WAREHOUSES: '/warehouses',
  LOCATIONS: '/locations',
  INVENTORY_COUNTS: '/inventory-counts',
  
  // Stock Management
  STOCK_LOGS: '/stock-logs',
  TRANSFERS: '/transfers',
  RETURNS: '/returns',
  
  // Reports & Management
  REPORTS: '/reports',
  USERS: '/users',
  SETTINGS: '/settings',
  PROFILE: '/profile',
  SUPPORT: '/support',
} as const;

/**
 * Route metadata for navigation and breadcrumbs
 */
export const ROUTE_META = {
  [ROUTES.LOGIN]: { title: 'Giriş', requiresAuth: false },
  [ROUTES.REGISTER]: { title: 'Kayıt', requiresAuth: false },
  [ROUTES.ADMIN]: { title: 'Süper Admin', requiresAuth: true, roles: ['SUPER_ADMIN'] },
  [ROUTES.DASHBOARD]: { title: 'Dashboard', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.PRODUCTS]: { title: 'Ürünler', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.CAMPAIGN_SETS]: { title: 'Kampanyalı Setler', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.ORDERS]: { title: 'Siparişler', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.ORDER_PICKING]: { title: 'Sipariş Hazırlama', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.PICKING_WAVES]: { title: 'Toplama Dalgaları', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.WAREHOUSES]: { title: 'Depolar', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.LOCATIONS]: { title: 'Lokasyonlar', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.INVENTORY_COUNTS]: { title: 'Stok Sayım', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.STOCK_LOGS]: { title: 'Stok Hareketleri', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.TRANSFERS]: { title: 'Sevkiyat', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.RETURNS]: { title: 'İadeler', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.REPORTS]: { title: 'Raporlar', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.USERS]: { title: 'Kullanıcılar', requiresAuth: true, roles: ['ADMIN', 'SUPER_ADMIN'] },
  [ROUTES.SETTINGS]: { title: 'Ayarlar', requiresAuth: true, roles: ['ADMIN', 'STAFF'] },
  [ROUTES.PROFILE]: { title: 'Profil', requiresAuth: true, roles: ['ADMIN', 'STAFF', 'SUPER_ADMIN'] },
  [ROUTES.SUPPORT]: { title: 'Destek', requiresAuth: true, roles: ['ADMIN', 'STAFF', 'SUPER_ADMIN'] },
} as const;

