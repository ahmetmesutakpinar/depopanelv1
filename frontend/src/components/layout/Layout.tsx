import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLayout } from '@/context/LayoutContext';
import { useTheme } from '@/context/ThemeContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { cn } from '@/utils';
import { ROUTES } from '@/constants/routes';
import { useEffect, useState } from 'react';

export default function Layout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { sidebarOpen, sidebarCollapsed } = useLayout();
  const { resolvedTheme } = useTheme();
  const location = useLocation();
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

  // Persist scroll position on route change (optional enhancement)
  useEffect(() => {
    // Restore scroll position if needed
    const scrollKey = `scroll-${location.pathname}`;
    const savedScroll = sessionStorage.getItem(scrollKey);
    if (savedScroll) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScroll, 10));
      }, 0);
    }
  }, [location.pathname]);

  // Save scroll position before route change
  useEffect(() => {
    const handleScroll = () => {
      const scrollKey = `scroll-${location.pathname}`;
      sessionStorage.setItem(scrollKey, window.scrollY.toString());
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950 transition-colors">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-200 dark:border-primary-800 border-t-primary-600 dark:border-t-primary-500 rounded-full animate-spin" />
          <p className="text-secondary-600 dark:text-secondary-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }


  return (
    <div className={cn(
      'min-h-screen bg-secondary-50 dark:bg-secondary-950 transition-colors duration-200',
      resolvedTheme
    )}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div
        className={cn(
          'min-h-screen transition-all duration-300 ease-in-out',
          // Desktop: Use margin-left based on sidebar state
          !isMobile && sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64',
          // Mobile: No margin when sidebar is closed
          isMobile && !sidebarOpen && 'pl-0'
        )}
        style={{
          // Smooth transition for sidebar width changes
          transitionProperty: 'padding-left',
        }}
      >
        {/* Header/Topbar */}
        <Header />

        {/* Page content */}
        <main
          className={cn(
            'p-4 lg:p-6',
            'min-h-[calc(100vh-4rem)]', // Full height minus header
            'animate-fade-in'
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
