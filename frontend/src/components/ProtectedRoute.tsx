import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/constants/routes';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('SUPER_ADMIN' | 'ADMIN' | 'STAFF')[];
  requiredPermission?: string;
}

// Permission mapping for routes
const routePermissionMap: Record<string, string> = {
  [ROUTES.DASHBOARD]: 'dashboard',
  [ROUTES.PRODUCTS]: 'products',
  [ROUTES.ORDERS]: 'orders',
  [ROUTES.ORDER_PICKING]: 'orderPicking',
  [ROUTES.PICKING_WAVES]: 'pickingWaves',
  [ROUTES.WAREHOUSES]: 'warehouses',
  [ROUTES.LOCATIONS]: 'locations',
  [ROUTES.INVENTORY_COUNTS]: 'inventoryCounts',
  [ROUTES.TRANSFERS]: 'transfers',
  [ROUTES.STOCK_LOGS]: 'stockLogs',
  [ROUTES.REPORTS]: 'reports',
};

export default function ProtectedRoute({ children, allowedRoles, requiredPermission }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  // Role check
  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  // Permission check for STAFF role
  if (user?.role === 'STAFF') {
    // Get permission from prop or route mapping
    const permission = requiredPermission || routePermissionMap[location.pathname];
    
    if (permission) {
      const hasPermission = user.permissions?.[permission];
      if (!hasPermission) {
        return <Navigate to={ROUTES.DASHBOARD} replace />;
      }
    }
  }

  return <>{children}</>;
}

