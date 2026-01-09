import { useState, useEffect, useRef } from 'react';
import { Search, Menu, User, Settings, LogOut, HelpCircle, ChevronDown, Moon, Sun, Monitor } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLayout } from '@/context/LayoutContext';
import { useTheme } from '@/context/ThemeContext';
import NotificationCenter, { Notification } from '@/components/NotificationCenter';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils';

interface HeaderProps {}

export default function Header({}: HeaderProps) {
  const { user, logout } = useAuth();
  const { sidebarOpen, toggleSidebar, sidebarCollapsed, toggleSidebarCollapsed } = useLayout();
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load notifications from localStorage or API
  useEffect(() => {
    const saved = localStorage.getItem('notifications');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNotifications(
          parsed.map((n: any) => ({
            ...n,
            timestamp: new Date(n.timestamp),
          }))
        );
      } catch {
        // Invalid data
      }
    }
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };

    if (userMenuOpen || themeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen, themeMenuOpen]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      action: () => {
        setSearchOpen(true);
        setTimeout(() => {
          const searchInput = document.querySelector('input[placeholder*="ara"]') as HTMLInputElement;
          searchInput?.focus();
        }, 100);
      },
    },
    {
      key: 'b',
      ctrl: true,
      action: () => {
        if (!isMobile) {
          toggleSidebarCollapsed();
        } else {
          toggleSidebar();
        }
      },
    },
  ]);

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    const updated = notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    localStorage.setItem('notifications', JSON.stringify(updated));
  };

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const updated = notifications.map((n) => ({ ...n, read: true }));
    localStorage.setItem('notifications', JSON.stringify(updated));
  };

  const handleClear = () => {
    setNotifications([]);
    localStorage.removeItem('notifications');
  };

  const handleMenuClick = () => {
    if (isMobile) {
      toggleSidebar();
    } else {
      toggleSidebarCollapsed();
    }
  };

  const themeOptions: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Açık', icon: Sun },
    { value: 'dark', label: 'Koyu', icon: Moon },
    { value: 'system', label: 'Sistem', icon: Monitor },
  ];

  return (
    <header className="sticky top-0 z-20 bg-white/80 dark:bg-secondary-900/80 backdrop-blur-lg border-b border-secondary-100 dark:border-secondary-800 transition-colors">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left side */}
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <button
            onClick={handleMenuClick}
            className="p-2 text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-100 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800 lg:hidden transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Desktop sidebar toggle */}
          {!isMobile && (
            <button
              onClick={handleMenuClick}
              className="hidden lg:flex p-2 text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-100 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors"
              title={sidebarCollapsed ? 'Genişlet' : 'Daralt'}
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Search */}
          <div className="hidden sm:flex items-center gap-2 bg-secondary-50 dark:bg-secondary-800 rounded-xl px-4 py-2 w-64 lg:w-80 transition-colors">
            <Search className="w-5 h-5 text-secondary-400 dark:text-secondary-500" />
            <input
              type="text"
              placeholder="Ürün, sipariş ara..."
              className="flex-1 bg-transparent text-sm text-secondary-700 dark:text-secondary-300 placeholder:text-secondary-400 dark:placeholder:text-secondary-500 outline-none"
            />
            <kbd className="hidden lg:block px-2 py-0.5 text-xs text-secondary-400 dark:text-secondary-500 bg-white dark:bg-secondary-700 rounded border border-secondary-200 dark:border-secondary-700">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              className="p-2 text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-100 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors"
              title="Tema"
            >
              {resolvedTheme === 'dark' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>

            {/* Theme dropdown */}
            {themeMenuOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-secondary-800 rounded-xl shadow-lg border border-secondary-100 dark:border-secondary-700 py-2 z-50">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setTheme(option.value);
                      setThemeMenuOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                      theme === option.value
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                        : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-700'
                    )}
                  >
                    <option.icon className="w-4 h-4" />
                    <span>{option.label}</span>
                    {theme === option.value && (
                      <span className="ml-auto text-primary-600 dark:text-primary-400">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <NotificationCenter
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onClear={handleClear}
          />

          {/* Company badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 rounded-lg transition-colors">
            <div className="w-2 h-2 bg-primary-500 rounded-full" />
            <span className="text-sm font-medium text-primary-700 dark:text-primary-400">
              {user?.companyName || 'Şirket'}
            </span>
          </div>

          {/* User avatar with dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 hover:bg-secondary-100 dark:hover:bg-secondary-800 rounded-lg px-2 py-1.5 transition-colors"
            >
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-secondary-500 dark:text-secondary-400">
                  {user?.email}
                </p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-medium text-sm">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </span>
              </div>
              <ChevronDown className={cn(
                'w-4 h-4 text-secondary-400 dark:text-secondary-500 hidden sm:block transition-transform',
                userMenuOpen && 'rotate-180'
              )} />
            </button>

            {/* Dropdown menu */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-secondary-800 rounded-xl shadow-lg border border-secondary-100 dark:border-secondary-700 py-2 z-50">
                <div className="px-4 py-3 border-b border-secondary-100 dark:border-secondary-700">
                  <p className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-0.5">
                    {user?.email}
                  </p>
                  {user?.role && (
                    <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                      {user.role === 'SUPER_ADMIN' ? 'Süper Admin' :
                       user.role === 'ADMIN' ? 'Admin' : 'Personel'}
                    </p>
                  )}
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      navigate(ROUTES.PROFILE);
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    <span>Profilim</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate(ROUTES.SETTINGS);
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Ayarlar</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate(ROUTES.SUPPORT);
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>Teknik Destek</span>
                  </button>
                </div>

                <div className="border-t border-secondary-100 dark:border-secondary-700 py-1">
                  <button
                    onClick={() => {
                      logout();
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Çıkış Yap</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
