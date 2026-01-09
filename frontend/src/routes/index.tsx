import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Layout from '@/components/layout/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ROUTES, ROUTE_META } from '@/constants/routes';

// Public pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';

// Protected pages
import Dashboard from '@/pages/Dashboard';
import Products from '@/pages/Products';
import Orders from '@/pages/Orders';
import OrderPicking from '@/pages/OrderPicking';
import WaveDetail from '@/pages/WaveDetail';
import Warehouses from '@/pages/Warehouses';
import Locations from '@/pages/Locations';
import InventoryCounts from '@/pages/InventoryCounts';
import StockLogs from '@/pages/StockLogs';
import Transfers from '@/pages/Transfers';
import Reports from '@/pages/Reports';
import Users from '@/pages/Users';
import Settings from '@/pages/Settings';
import Profile from '@/pages/Profile';
import Support from '@/pages/Support';
import AdminPanel from '@/pages/AdminPanel';

// Re-export ROUTES for backward compatibility
export { ROUTES, ROUTE_META };

/**
 * Route configuration helper
 * Creates a protected route with role-based access control
 */
type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';

const createProtectedRoute = (
  path: string,
  component: React.ComponentType,
  allowedRoles: Role[]
) => (
  <Route
    key={path}
    path={path}
    element={
      <ProtectedRoute allowedRoles={allowedRoles}>
        {React.createElement(component)}
      </ProtectedRoute>
    }
  />
);

/**
 * Application Routes Configuration
 * 
 * Route Structure:
 * - Public routes: /login, /register
 * - Protected routes: All other routes require authentication
 * - Role-based access: Some routes are restricted to specific roles
 * 
 * All route paths are defined in ROUTES constant above.
 * All page components are imported from @/pages directory.
 */
export function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  // Determine redirect path based on authentication and role
  const getRedirectPath = () => {
    if (!isAuthenticated) return ROUTES.LOGIN;
    if (user?.role === 'SUPER_ADMIN') return ROUTES.ADMIN;
    return ROUTES.DASHBOARD;
  };

  // Define route groups for better organization
  const publicRoutes = [
    { path: ROUTES.LOGIN, component: Login },
    { path: ROUTES.REGISTER, component: Register },
  ];

  const adminStaffRoutes: Array<{ path: string; component: React.ComponentType; roles: Role[] }> = [
    { path: ROUTES.DASHBOARD, component: Dashboard, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.PRODUCTS, component: Products, roles: ['ADMIN', 'STAFF'] },
    // CAMPAIGN_SETS is now a tab in Products page
    { path: ROUTES.CAMPAIGN_SETS, component: Products, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.ORDERS, component: Orders, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.ORDER_PICKING, component: OrderPicking, roles: ['ADMIN', 'STAFF'] },
    // PICKING_WAVES is now a tab in OrderPicking page
    { path: ROUTES.PICKING_WAVES, component: OrderPicking, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.WAVE_DETAIL, component: WaveDetail, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.WAREHOUSES, component: Warehouses, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.LOCATIONS, component: Locations, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.INVENTORY_COUNTS, component: InventoryCounts, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.STOCK_LOGS, component: StockLogs, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.TRANSFERS, component: Transfers, roles: ['ADMIN', 'STAFF'] },
    // RETURNS is now a tab in Orders page
    { path: ROUTES.RETURNS, component: Orders, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.REPORTS, component: Reports, roles: ['ADMIN', 'STAFF'] },
    { path: ROUTES.SETTINGS, component: Settings, roles: ['ADMIN', 'STAFF'] },
  ];

  const adminSuperAdminRoutes: Array<{ path: string; component: React.ComponentType; roles: Role[] }> = [
    { path: ROUTES.USERS, component: Users, roles: ['ADMIN', 'SUPER_ADMIN'] },
  ];

  const allAuthenticatedRoutes: Array<{ path: string; component: React.ComponentType; roles: Role[] }> = [
    { path: ROUTES.PROFILE, component: Profile, roles: ['ADMIN', 'STAFF', 'SUPER_ADMIN'] },
    { path: ROUTES.SUPPORT, component: Support, roles: ['ADMIN', 'STAFF', 'SUPER_ADMIN'] },
  ];

  const superAdminRoutes: Array<{ path: string; component: React.ComponentType; roles: Role[] }> = [
    { path: ROUTES.ADMIN, component: AdminPanel, roles: ['SUPER_ADMIN'] },
  ];

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public Routes */}
        {publicRoutes.map(({ path, component }) => (
          <Route key={path} path={path} element={React.createElement(component)} />
        ))}

        {/* Protected Routes - Wrapped in Layout */}
        <Route element={<Layout />}>
          {/* Super Admin Only Routes */}
          {superAdminRoutes.map(({ path, component, roles }) =>
            createProtectedRoute(path, component, roles)
          )}

          {/* Admin & Staff Routes */}
          {adminStaffRoutes.map(({ path, component, roles }) =>
            createProtectedRoute(path, component, roles)
          )}

          {/* Admin & Super Admin Routes */}
          {adminSuperAdminRoutes.map(({ path, component, roles }) =>
            createProtectedRoute(path, component, roles)
          )}

          {/* All Authenticated Users Routes */}
          {allAuthenticatedRoutes.map(({ path, component, roles }) =>
            createProtectedRoute(path, component, roles)
          )}
        </Route>

        {/* Root and Catch-all Routes */}
        <Route
          path="/"
          element={<Navigate to={getRedirectPath()} replace />}
        />
        <Route
          path="*"
          element={<Navigate to={getRedirectPath()} replace />}
        />
      </Routes>
    </ErrorBoundary>
  );
}

