import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface OrgLimits {
  maxSystems: number;
  maxUsers: number;
  maxIntegrations: number;
  aiCallsPerDay: number;
  retentionDays: number;
  [key: string]: number;
}

interface OrgUsage {
  systems: number;
  users: number;
  integrations: number;
  aiCallsToday: number;
  [key: string]: number;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logo: string | null;
  settings: Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any
  limits: OrgLimits;
  usage: OrgUsage;
  createdAt: string;
  owner: string;
  [key: string]: unknown;
}

interface TenantContextValue {
  organization: Organization;
  loading: boolean;
  updateSettings: (newSettings: Record<string, unknown>) => void;
  isWithinLimits: (resource: string) => boolean;
  getUsagePercent: (resource: string) => number;
}

const TenantContext = createContext<TenantContextValue | null>(null);

const defaultOrg: Organization = {
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
  const [organization, setOrganization] = useState<Organization>(() => {
    if (user?.organization) return { ...defaultOrg, ...user.organization } as Organization;
    return defaultOrg;
  });

  const updateSettings = useCallback((newSettings: Record<string, unknown>) => {
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
        const { limits, usage } = organization;
        return (usage[resource] || 0) < (limits[getLimitKey(resource)] || Infinity);
      },
      getUsagePercent: (resource: string) => {
        const { limits, usage } = organization;
        const max = limits[getLimitKey(resource)] || 1;
        return Math.round(((usage[resource] || 0) / max) * 100);
      },
    };
  }, [organization, updateSettings]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
