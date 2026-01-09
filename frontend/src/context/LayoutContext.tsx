import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface LayoutContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

const SIDEBAR_STORAGE_KEY = 'depopanel-sidebar-collapsed';

export function LayoutProvider({ children }: { children: ReactNode }) {
  // Desktop: collapsed (icon-only) or expanded (full)
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      return saved === 'true';
    }
    return false;
  });

  // Mobile: open or closed
  const [sidebarOpen, setSidebarOpenState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      // Don't restore mobile sidebar state - always start closed
      return false;
    }
    return false;
  });

  // Save sidebar collapsed state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed.toString());
    }
  }, [sidebarCollapsed]);

  const setSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
  };

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsedState(prev => !prev);
  };

  const setSidebarOpen = (open: boolean) => {
    setSidebarOpenState(open);
  };

  const toggleSidebar = () => {
    setSidebarOpenState(prev => !prev);
  };

  // Handle window resize - close mobile sidebar when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpenState(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <LayoutContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebarCollapsed,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}

