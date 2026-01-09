import { NavLink, useLocation } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Warehouse,
  BarChart3,
  Settings,
  LogOut,
  Users,
  RefreshCw,
  ArrowLeftRight,
  ScanLine,
  ShieldCheck,
  MapPin,
  ClipboardCheck,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLayout } from '@/context/LayoutContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/utils';
import { useState, useEffect } from 'react';

interface SidebarProps {}

// Menu item type
interface MenuItem {
  icon: any;
  label: string;
  path: string;
  permission: string;
}

// Menu group type
interface MenuGroup {
  id: string;
  label: string;
  icon: any;
  items: MenuItem[];
}

// Standalone menu items (no group)
const standaloneItems: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: ROUTES.DASHBOARD, permission: 'dashboard' },
  { icon: Package, label: 'Ürünler', path: ROUTES.PRODUCTS, permission: 'products' },
  { icon: ShoppingCart, label: 'Siparişler', path: ROUTES.ORDERS, permission: 'orders' },
  { icon: ScanLine, label: 'Sipariş Hazırlama', path: ROUTES.ORDER_PICKING, permission: 'orderPicking' },
];

// Grouped menu items
const menuGroups: MenuGroup[] = [
  {
    id: 'warehouse',
    label: 'Depo Yönetimi',
    icon: Warehouse,
    items: [
      { icon: Warehouse, label: 'Depolar', path: ROUTES.WAREHOUSES, permission: 'warehouses' },
      { icon: MapPin, label: 'Lokasyonlar', path: ROUTES.LOCATIONS, permission: 'locations' },
      { icon: ClipboardCheck, label: 'Stok Sayım', path: ROUTES.INVENTORY_COUNTS, permission: 'inventoryCounts' },
      { icon: ArrowLeftRight, label: 'Sevkiyat', path: ROUTES.TRANSFERS, permission: 'transfers' },
    ],
  },
];

// Bottom standalone items
const bottomItems: MenuItem[] = [
  { icon: RefreshCw, label: 'Stok Hareketleri', path: ROUTES.STOCK_LOGS, permission: 'stockLogs' },
  { icon: BarChart3, label: 'Raporlar', path: ROUTES.REPORTS, permission: 'reports' },
];

const adminItems = [
  { icon: Users, label: 'Kullanıcılar', path: ROUTES.USERS },
  { icon: Settings, label: 'Ayarlar', path: ROUTES.SETTINGS },
];

const superAdminItems = [
  { icon: ShieldCheck, label: 'Süper Admin', path: ROUTES.ADMIN },
];

export default function Sidebar({}: SidebarProps) {
  const { user, logout } = useAuth();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapsed } = useLayout();
  const { resolvedTheme } = useTheme();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['warehouse']); // Default expanded

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-expand group if current path is in it
  useEffect(() => {
    menuGroups.forEach(group => {
      const isInGroup = group.items.some(item => location.pathname === item.path);
      if (isInGroup && !expandedGroups.includes(group.id)) {
        setExpandedGroups(prev => [...prev, group.id]);
      }
    });
  }, [location.pathname]);

  // Toggle group expansion
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  // Filter menu items based on permissions (for STAFF role)
  const filterItems = (items: MenuItem[]) => {
    if (isAdmin || isSuperAdmin) {
      return items;
    }

    if (user?.role === 'STAFF') {
      if (user?.permissions && typeof user.permissions === 'object') {
        return items.filter(item => {
          const hasPermission = user.permissions?.[item.permission];
          return hasPermission === true;
        });
      }
      return items.filter(item => item.permission === 'dashboard');
    }

    return items;
  };

  const filteredStandaloneItems = filterItems(standaloneItems);
  const filteredBottomItems = filterItems(bottomItems);
  const filteredMenuGroups = menuGroups.map(group => ({
    ...group,
    items: filterItems(group.items),
  })).filter(group => group.items.length > 0);

  // Determine if sidebar should be visible
  const isVisible = isMobile ? sidebarOpen : true;
  const isCollapsed = !isMobile && sidebarCollapsed;

  // Render a single menu item
  const renderMenuItem = (item: MenuItem) => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) =>
        cn(
          'sidebar-link',
          isActive && 'sidebar-link-active',
          isCollapsed && 'lg:justify-center lg:px-3'
        )
      }
      title={item.label}
    >
      <item.icon className="w-5 h-5 flex-shrink-0" />
      {!isCollapsed && <span>{item.label}</span>}
    </NavLink>
  );

  // Render a menu group with accordion
  const renderMenuGroup = (group: MenuGroup) => {
    const isExpanded = expandedGroups.includes(group.id);
    const hasActiveItem = group.items.some(item => location.pathname === item.path);

    // When collapsed, show only icon that expands on hover or just show items
    if (isCollapsed) {
      return (
        <div key={group.id} className="space-y-1">
          {group.items.map(item => renderMenuItem(item))}
        </div>
      );
    }

    return (
      <div key={group.id} className="space-y-1">
        {/* Group header - clickable to expand/collapse */}
        <button
          onClick={() => toggleGroup(group.id)}
          className={cn(
            'w-full flex items-center justify-between px-4 py-2.5 rounded-xl',
            'text-secondary-300 hover:text-white hover:bg-secondary-800/50',
            'transition-all duration-200',
            hasActiveItem && 'text-white bg-secondary-800/30'
          )}
        >
          <div className="flex items-center gap-3">
            <group.icon className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium">{group.label}</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 transition-transform" />
          ) : (
            <ChevronRight className="w-4 h-4 transition-transform" />
          )}
        </button>

        {/* Group items - animated collapse */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-300 ease-in-out',
            isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="pl-4 space-y-1 pt-1">
            {group.items.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'sidebar-link text-sm',
                    isActive && 'sidebar-link-active',
                  )
                }
                title={item.label}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 bottom-0 z-50',
          'bg-secondary-900 dark:bg-secondary-950',
          'border-r border-secondary-800 dark:border-secondary-800',
          'transition-all duration-300 ease-in-out',
          'flex flex-col',
          // Mobile: slide in/out
          isMobile && (sidebarOpen ? 'translate-x-0' : '-translate-x-full'),
          // Desktop: always visible, width changes
          !isMobile && (isCollapsed ? 'w-20' : 'w-64'),
          // Height
          'h-screen'
        )}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between h-16 px-4 border-b border-secondary-800 dark:border-secondary-800">
          {/* Logo */}
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white font-display">
                DepoPanel
              </span>
            </div>
          )}

          {/* Collapsed logo */}
          {isCollapsed && (
            <div className="flex items-center justify-center w-full">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
          )}

          {/* Mobile close button */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-secondary-400 hover:text-white rounded-lg hover:bg-secondary-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Desktop collapse button */}
          {!isMobile && (
            <button
              onClick={toggleSidebarCollapsed}
              className="hidden lg:flex p-2 text-secondary-400 hover:text-white rounded-lg hover:bg-secondary-800"
              title={isCollapsed ? 'Genişlet' : 'Daralt'}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="w-5 h-5" />
              ) : (
                <PanelLeftClose className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {/* Super Admin - Only sees admin panel */}
          {isSuperAdmin ? (
            <>
              {!isCollapsed && (
                <div className="pt-4 pb-2">
                  <span className="px-4 text-xs font-semibold text-secondary-500 uppercase tracking-wider">
                    Sistem Yönetimi
                  </span>
                </div>
              )}
              {superAdminItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'sidebar-link',
                      isActive && 'sidebar-link-active',
                      isCollapsed && 'lg:justify-center lg:px-3'
                    )
                  }
                  title={item.label}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </>
          ) : (
            <>
              {/* Standalone items (top) */}
              {filteredStandaloneItems.map(item => renderMenuItem(item))}

              {/* Separator before groups */}
              {filteredMenuGroups.length > 0 && !isCollapsed && (
                <div className="my-3 border-t border-secondary-800" />
              )}

              {/* Menu groups with accordion */}
              {filteredMenuGroups.map(group => renderMenuGroup(group))}

              {/* Separator after groups */}
              {filteredMenuGroups.length > 0 && !isCollapsed && (
                <div className="my-3 border-t border-secondary-800" />
              )}

              {/* Bottom standalone items */}
              {filteredBottomItems.map(item => renderMenuItem(item))}

              {/* Admin section */}
              {isAdmin && (
                <>
                  {!isCollapsed && (
                    <div className="pt-4 pb-2">
                      <span className="px-4 text-xs font-semibold text-secondary-500 uppercase tracking-wider">
                        Yönetim
                      </span>
                    </div>
                  )}
                  {adminItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          'sidebar-link',
                          isActive && 'sidebar-link-active',
                          isCollapsed && 'lg:justify-center lg:px-3'
                        )
                      }
                      title={item.label}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && <span>{item.label}</span>}
                    </NavLink>
                  ))}
                </>
              )}
            </>
          )}
        </nav>

        {/* User & Logout */}
        <div className="flex-shrink-0 p-3 border-t border-secondary-800 dark:border-secondary-800">
          <div className={cn(
            'flex items-center gap-3 px-3 py-2 mb-2',
            isCollapsed && 'lg:justify-center lg:px-0'
          )}>
            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white font-medium text-sm">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-secondary-400 truncate">
                  {user?.role === 'SUPER_ADMIN' ? 'Süper Admin' : user?.role === 'ADMIN' ? 'Admin' : 'Personel'}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={logout}
            className={cn(
              'sidebar-link text-danger-400 hover:bg-danger-500/10 hover:text-danger-300 w-full',
              isCollapsed && 'lg:justify-center lg:px-3'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Çıkış Yap</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
