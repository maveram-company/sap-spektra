import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);
const STORAGE_KEY = 'sap-spektra-sidebar-collapsed';

// Exporting both SidebarProvider (component) and useSidebar (hook) from the same file
// triggers react-refresh/only-export-components. The disable is necessary because
// the hook must live alongside its context provider for encapsulation.
// eslint-disable-next-line react-refresh/only-export-components
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ collapsed, setCollapsed, toggle }), [collapsed, toggle]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}
