import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTenant } from '../contexts/TenantContext';

interface PlanContextValue {
  currentPlan: Record<string, any>;
  hasFeature: (feature: string) => boolean;
  canUpgrade: boolean;
  getPlan: (planId: string) => Record<string, any> | undefined;
  getAllPlans: () => Record<string, any>[];
  PLANS: Record<string, any>;
}

const PlanContext = createContext<PlanContextValue | null>(null);

const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 0,
    interval: 'month',
    features: ['monitoring', 'dashboard', 'alerts_basic'],
    limits: { maxSystems: 3, maxUsers: 2, maxIntegrations: 0, aiCallsPerDay: 5, retentionDays: 7 },
    description: 'Para equipos que inician con monitoreo SAP',
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    price: 299,
    interval: 'month',
    features: ['monitoring', 'dashboard', 'alerts_basic', 'alerts_advanced', 'runbooks', 'ai_analysis', 'approvals', 'scheduling', 'integrations_basic', 'analytics', 'comparison', 'chat'],
    limits: { maxSystems: 25, maxUsers: 10, maxIntegrations: 3, aiCallsPerDay: 100, retentionDays: 90 },
    description: 'Para operaciones SAP con automatización completa',
    popular: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    interval: 'month',
    features: ['monitoring', 'dashboard', 'alerts_basic', 'alerts_advanced', 'runbooks', 'ai_analysis', 'approvals', 'scheduling', 'integrations_basic', 'integrations_advanced', 'analytics', 'comparison', 'chat', 'ha_orchestration', 'compliance', 'audit', 'custom_runbooks', 'sso', 'api_access', 'dedicated_support', 'multi_cloud', 'sap_rise'],
    limits: { maxSystems: Infinity, maxUsers: Infinity, maxIntegrations: Infinity, aiCallsPerDay: 1000, retentionDays: 365 },
    description: 'Para organizaciones con requerimientos avanzados de compliance y HA',
  },
};

export function PlanProvider({ children }: { children: ReactNode }) {
  const { organization } = useTenant();
  const currentPlan = (PLANS as Record<string, any>)[organization?.plan] || PLANS.starter;

  const value = useMemo((): PlanContextValue => ({
    currentPlan,
    hasFeature: (feature: string) => currentPlan.features.includes(feature),
    canUpgrade: currentPlan.id !== 'enterprise',
    getPlan: (planId: string) => (PLANS as Record<string, any>)[planId],
    getAllPlans: () => Object.values(PLANS),
    PLANS,
  }), [currentPlan]);

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
}

// Exporting both PlanProvider (component) and usePlan (hook) from the same file
// triggers react-refresh/only-export-components. The disable is necessary because
// the hook must live alongside its context provider for encapsulation.
// eslint-disable-next-line react-refresh/only-export-components
export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
