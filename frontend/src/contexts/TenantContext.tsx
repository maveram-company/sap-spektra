import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface TenantContextValue {
  organization: Record<string, any>;
  loading: boolean;
  updateSettings: (newSettings: Record<string, any>) => void;
  isWithinLimits: (resource: string) => boolean;
  getUsagePercent: (resource: string) => number;
}

const TenantContext = createContext<TenantContextValue | null>(null);

const defaultOrg = {
  id: 'org-demo',
  name: 'Demo Organization',
  slug: 'demo-org',
  plan: 'professional',
  logo: null,
  settings: {
    timezone: 'America/Bogota',
    language: 'es',
    notifications: { email: true, slack: false, teams: false },
    security: { mfaRequired: false, sessionTimeout: 480 },
  },
  limits: {
    maxSystems: 25,
    maxUsers: 10,
    maxIntegrations: 3,
    aiCallsPerDay: 100,
    retentionDays: 90,
  },
  usage: {
    systems: 9,
    users: 4,
    integrations: 1,
    aiCallsToday: 12,
  },
  createdAt: '2025-12-01T00:00:00Z',
  owner: 'admin@demo.spektra.com',
};

// Exporting both TenantProvider (component) and useTenant (hook) from the same file
// triggers react-refresh/only-export-components. The disable is necessary because
// the hook must live alongside its context provider for encapsulation.
// eslint-disable-next-line react-refresh/only-export-components
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organization, setOrganization] = useState(() => {
    if (user?.organization) return { ...defaultOrg, ...user.organization };
    return defaultOrg;
  });

  const updateSettings = useCallback((newSettings: Record<string, any>) => {
    setOrganization(prev => ({
      ...prev,
      settings: { ...prev.settings, ...newSettings },
    }));
  }, []);

  const value = useMemo(() => {
    // Mapping de resource usage key → limit key
    const limitKeyMap = {
      systems: 'maxSystems',
      users: 'maxUsers',
      integrations: 'maxIntegrations',
      aiCallsToday: 'aiCallsPerDay',
    };
    const getLimitKey = (resource: string) => (limitKeyMap as Record<string, string>)[resource] || `max${resource.charAt(0).toUpperCase() + resource.slice(1)}`;

    return {
      organization,
      loading: false,
      updateSettings,
      isWithinLimits: (resource: string) => {
        const { limits, usage } = organization as any;
        return ((usage[resource] as number) || 0) < ((limits[getLimitKey(resource)] as number) || Infinity);
      },
      getUsagePercent: (resource: string) => {
        const { limits, usage } = organization as any;
        const max = (limits[getLimitKey(resource)] as number) || 1;
        return Math.round((((usage[resource] as number) || 0) / max) * 100);
      },
    };
  }, [organization, updateSettings]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
