import { useState, useCallback } from 'react';
import { createLogger } from '../lib/logger';

const log = createLogger('API');

const getApiUrl = () => import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (endpoint: string, options: FetchOptions = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi(endpoint, options);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.warn('Request failed', { error: message });
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { request, loading, error, setError };
}

interface AlertFilters { status?: string; level?: string; systemId?: string }
interface EventFilters { level?: string; source?: string; systemId?: string; limit?: number }
interface OperationFilters { status?: string; type?: string; systemId?: string }
interface AuditFilters { severity?: string; action?: string; limit?: number }

// Pre-built API functions — aligned with NestJS backend routes
export const api = {
  // Auth
  login: (email: string, password: string) => fetchApi('/auth/login', { method: 'POST', body: { email, password } }),
  register: (data: unknown) => fetchApi('/auth/register', { method: 'POST', body: data }),
  me: () => fetchApi('/auth/me'),

  // Health
  healthCheck: () => fetchApi('/health'),

  // Dashboard
  getDashboard: () => fetchApi('/dashboard'),

  // Systems
  getSystems: () => fetchApi('/systems'),
  getSystemById: (id: string) => fetchApi(`/systems/${id}`),
  getSystemHealthSummary: () => fetchApi('/systems/health-summary'),
  createSystem: (data: unknown) => fetchApi('/systems', { method: 'POST', body: data }),
  updateSystem: (id: string, data: unknown) => fetchApi(`/systems/${id}`, { method: 'PATCH', body: data }),
  deleteSystem: (id: string) => fetchApi(`/systems/${id}`, { method: 'DELETE' }),

  // Metrics & Monitoring
  getHostMetrics: (hostId: string, hours?: number) => fetchApi(`/metrics/hosts/${hostId}?hours=${hours || 24}`),
  getSystemHostMetrics: (systemId: string, hours?: number) => fetchApi(`/metrics/systems/${systemId}/hosts?hours=${hours || 24}`),
  getHealthSnapshots: (systemId: string, hours?: number) => fetchApi(`/metrics/systems/${systemId}/health?hours=${hours || 24}`),
  getBreaches: (systemId?: string) => fetchApi(`/metrics/breaches${systemId ? `?systemId=${systemId}` : ''}`),
  getDependencies: (systemId: string) => fetchApi(`/metrics/systems/${systemId}/dependencies`),
  getHosts: (systemId: string) => fetchApi(`/metrics/systems/${systemId}/hosts-detail`),
  getComponents: (systemId: string) => fetchApi(`/metrics/systems/${systemId}/components`),
  getSystemMeta: (systemId?: string) => fetchApi(`/metrics/system-meta${systemId ? `?systemId=${systemId}` : ''}`),

  // Alerts
  getAlerts: (filters?: AlertFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.level) params.set('level', filters.level);
    if (filters?.systemId) params.set('systemId', filters.systemId);
    const qs = params.toString();
    return fetchApi(`/alerts${qs ? `?${qs}` : ''}`);
  },
  getAlertStats: () => fetchApi('/alerts/stats'),
  acknowledgeAlert: (id: string) => fetchApi(`/alerts/${id}/acknowledge`, { method: 'PATCH' }),
  resolveAlert: (id: string, data?: unknown) => fetchApi(`/alerts/${id}/resolve`, { method: 'PATCH', body: data }),

  // Events
  getEvents: (filters?: EventFilters) => {
    const params = new URLSearchParams();
    if (filters?.level) params.set('level', filters.level);
    if (filters?.source) params.set('source', filters.source);
    if (filters?.systemId) params.set('systemId', filters.systemId);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return fetchApi(`/events${qs ? `?${qs}` : ''}`);
  },

  // Approvals
  getApprovals: (status?: string) => fetchApi(`/approvals${status ? `?status=${status}` : ''}`),
  getApprovalById: (id: string) => fetchApi(`/approvals/${id}`),
  createApproval: (data: unknown) => fetchApi('/approvals', { method: 'POST', body: data }),
  approveAction: (id: string) => fetchApi(`/approvals/${id}/approve`, { method: 'PATCH' }),
  rejectAction: (id: string) => fetchApi(`/approvals/${id}/reject`, { method: 'PATCH' }),

  // Runbooks
  getRunbooks: () => fetchApi('/runbooks'),
  getRunbookById: (id: string) => fetchApi(`/runbooks/${id}`),
  getRunbookExecutions: () => fetchApi('/runbooks/executions'),
  getExecutionDetail: (executionId: string) => fetchApi(`/runbooks/executions/${executionId}`),
  executeRunbook: (id: string, systemId: string, dryRun = false) => fetchApi(`/runbooks/${id}/execute`, { method: 'POST', body: { systemId, dryRun } }),

  // Operations
  getOperations: (filters?: OperationFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.systemId) params.set('systemId', filters.systemId);
    const qs = params.toString();
    return fetchApi(`/operations${qs ? `?${qs}` : ''}`);
  },
  createOperation: (data: unknown) => fetchApi('/operations', { method: 'POST', body: data }),
  updateOperationStatus: (id: string, status: string) => fetchApi(`/operations/${id}/status`, { method: 'PATCH', body: { status } }),
  getJobs: (systemId?: string) => fetchApi(`/operations/jobs${systemId ? `?systemId=${systemId}` : ''}`),
  getTransports: (systemId?: string) => fetchApi(`/operations/transports${systemId ? `?systemId=${systemId}` : ''}`),
  getCertificates: (systemId?: string) => fetchApi(`/operations/certificates${systemId ? `?systemId=${systemId}` : ''}`),

  // HA/DR
  getHAConfigs: () => fetchApi('/ha'),
  getHAConfig: (systemId: string) => fetchApi(`/ha/${systemId}`),
  triggerFailover: (systemId: string) => fetchApi(`/ha/${systemId}/failover`, { method: 'PATCH' }),
  getHAPrereqs: (systemId: string) => fetchApi(`/ha/${systemId}/prereqs`),
  getHAOpsHistory: (systemId: string) => fetchApi(`/ha/${systemId}/ops-history`),
  getHADrivers: (systemId: string) => fetchApi(`/ha/${systemId}/drivers`),

  // Landscape
  getLandscapeValidation: () => fetchApi('/landscape/validation'),

  // AI
  getAIUseCases: () => fetchApi('/ai/use-cases'),
  getAIResponses: () => fetchApi('/ai/responses'),

  // Licenses
  getLicenses: () => fetchApi('/licenses'),

  // Connectors
  getConnectors: () => fetchApi('/connectors'),
  getConnectorById: (id: string) => fetchApi(`/connectors/${id}`),

  // Users
  getUsers: () => fetchApi('/users'),
  getUserById: (id: string) => fetchApi(`/users/${id}`),
  createUser: (data: unknown) => fetchApi('/users', { method: 'POST', body: data }),
  updateUser: (id: string, data: unknown) => fetchApi(`/users/${id}`, { method: 'PATCH', body: data }),
  deleteUser: (id: string) => fetchApi(`/users/${id}`, { method: 'DELETE' }),

  // Tenant
  getTenant: () => fetchApi('/tenant'),
  updateTenant: (data: unknown) => fetchApi('/tenant', { method: 'PATCH', body: data }),
  getTenantStats: () => fetchApi('/tenant/stats'),

  // Analytics
  getAnalyticsOverview: () => fetchApi('/analytics/overview'),
  getRunbookAnalytics: () => fetchApi('/analytics/runbooks'),
  getSystemTrends: (systemId: string, days?: number) => fetchApi(`/analytics/systems/${systemId}/trends?days=${days || 7}`),

  // Chat / AI
  chat: (message: string, context?: unknown) => fetchApi('/chat', { method: 'POST', body: { message, context } }),

  // Plans
  getPlans: () => fetchApi('/plans'),
  getPlanByTier: (tier: string) => fetchApi(`/plans/${tier}`),

  // Settings
  getSettings: () => fetchApi('/settings'),
  updateSettings: (data: unknown) => fetchApi('/settings', { method: 'PATCH', body: data }),
  getApiKeys: () => fetchApi('/settings/api-keys'),
  createApiKey: (name: string) => fetchApi('/settings/api-keys', { method: 'POST', body: { name } }),
  revokeApiKey: (id: string) => fetchApi(`/settings/api-keys/${id}/revoke`, { method: 'PATCH' }),

  // Audit
  getAuditLog: (filters?: AuditFilters) => {
    const params = new URLSearchParams();
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.action) params.set('action', filters.action);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return fetchApi(`/audit${qs ? `?${qs}` : ''}`);
  },
};

async function fetchApi(endpoint: string, options: FetchOptions = {}): Promise<unknown> {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;
  const stored = localStorage.getItem('sap-spektra-auth');
  let auth: { token?: string } | null = null;
  if (stored) {
    try { auth = JSON.parse(stored); } catch { localStorage.removeItem('sap-spektra-auth'); }
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    },
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401) {
      log.warn('Session expired, redirecting to login', { endpoint, status: 401 });
      localStorage.removeItem('sap-spektra-auth');
      window.location.href = '/login';
      throw new Error('Sesión expirada');
    }
    const errBody = await res.json().catch(() => ({}));
    const errorMessage = errBody.message || errBody.error || `Error ${res.status}`;
    log.error('API request failed', { endpoint, status: res.status, error: errorMessage });
    throw new Error(errorMessage);
  }

  return res.json();
}
