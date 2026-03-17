import { useState, useCallback } from 'react';
import { createLogger } from '../lib/logger';

const log = createLogger('API');

const getApiUrl = () => import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi(endpoint, options);
      return result;
    } catch (err) {
      console.warn('[useApi]', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { request, loading, error, setError };
}

// Pre-built API functions — aligned with NestJS backend routes
export const api = {
  // Auth
  login: (email, password) => fetchApi('/auth/login', { method: 'POST', body: { email, password } }),
  register: (data) => fetchApi('/auth/register', { method: 'POST', body: data }),
  me: () => fetchApi('/auth/me'),

  // Health
  healthCheck: () => fetchApi('/health'),

  // Dashboard
  getDashboard: () => fetchApi('/dashboard'),

  // Systems
  getSystems: () => fetchApi('/systems'),
  getSystemById: (id) => fetchApi(`/systems/${id}`),
  getSystemHealthSummary: () => fetchApi('/systems/health-summary'),
  createSystem: (data) => fetchApi('/systems', { method: 'POST', body: data }),
  updateSystem: (id, data) => fetchApi(`/systems/${id}`, { method: 'PATCH', body: data }),
  deleteSystem: (id) => fetchApi(`/systems/${id}`, { method: 'DELETE' }),

  // Metrics & Monitoring
  getHostMetrics: (hostId, hours) => fetchApi(`/metrics/hosts/${hostId}?hours=${hours || 24}`),
  getSystemHostMetrics: (systemId, hours) => fetchApi(`/metrics/systems/${systemId}/hosts?hours=${hours || 24}`),
  getHealthSnapshots: (systemId, hours) => fetchApi(`/metrics/systems/${systemId}/health?hours=${hours || 24}`),
  getBreaches: (systemId) => fetchApi(`/metrics/breaches${systemId ? `?systemId=${systemId}` : ''}`),
  getDependencies: (systemId) => fetchApi(`/metrics/systems/${systemId}/dependencies`),
  getHosts: (systemId) => fetchApi(`/metrics/systems/${systemId}/hosts-detail`),
  getComponents: (systemId) => fetchApi(`/metrics/systems/${systemId}/components`),
  getSystemMeta: (systemId) => fetchApi(`/metrics/system-meta${systemId ? `?systemId=${systemId}` : ''}`),

  // Alerts
  getAlerts: (filters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.level) params.set('level', filters.level);
    if (filters?.systemId) params.set('systemId', filters.systemId);
    const qs = params.toString();
    return fetchApi(`/alerts${qs ? `?${qs}` : ''}`);
  },
  getAlertStats: () => fetchApi('/alerts/stats'),
  acknowledgeAlert: (id) => fetchApi(`/alerts/${id}/acknowledge`, { method: 'PATCH' }),
  resolveAlert: (id, data) => fetchApi(`/alerts/${id}/resolve`, { method: 'PATCH', body: data }),

  // Events
  getEvents: (filters) => {
    const params = new URLSearchParams();
    if (filters?.level) params.set('level', filters.level);
    if (filters?.source) params.set('source', filters.source);
    if (filters?.systemId) params.set('systemId', filters.systemId);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return fetchApi(`/events${qs ? `?${qs}` : ''}`);
  },

  // Approvals
  getApprovals: (status) => fetchApi(`/approvals${status ? `?status=${status}` : ''}`),
  getApprovalById: (id) => fetchApi(`/approvals/${id}`),
  createApproval: (data) => fetchApi('/approvals', { method: 'POST', body: data }),
  approveAction: (id) => fetchApi(`/approvals/${id}/approve`, { method: 'PATCH' }),
  rejectAction: (id) => fetchApi(`/approvals/${id}/reject`, { method: 'PATCH' }),

  // Runbooks
  getRunbooks: () => fetchApi('/runbooks'),
  getRunbookById: (id) => fetchApi(`/runbooks/${id}`),
  getRunbookExecutions: () => fetchApi('/runbooks/executions'),
  getExecutionDetail: (executionId) => fetchApi(`/runbooks/executions/${executionId}`),
  executeRunbook: (id, systemId, dryRun = false) => fetchApi(`/runbooks/${id}/execute`, { method: 'POST', body: { systemId, dryRun } }),

  // Operations
  getOperations: (filters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.systemId) params.set('systemId', filters.systemId);
    const qs = params.toString();
    return fetchApi(`/operations${qs ? `?${qs}` : ''}`);
  },
  createOperation: (data) => fetchApi('/operations', { method: 'POST', body: data }),
  updateOperationStatus: (id, status) => fetchApi(`/operations/${id}/status`, { method: 'PATCH', body: { status } }),
  getJobs: (systemId) => fetchApi(`/operations/jobs${systemId ? `?systemId=${systemId}` : ''}`),
  getTransports: (systemId) => fetchApi(`/operations/transports${systemId ? `?systemId=${systemId}` : ''}`),
  getCertificates: (systemId) => fetchApi(`/operations/certificates${systemId ? `?systemId=${systemId}` : ''}`),

  // HA/DR
  getHAConfigs: () => fetchApi('/ha'),
  getHAConfig: (systemId) => fetchApi(`/ha/${systemId}`),
  triggerFailover: (systemId) => fetchApi(`/ha/${systemId}/failover`, { method: 'PATCH' }),
  getHAPrereqs: (systemId) => fetchApi(`/ha/${systemId}/prereqs`),
  getHAOpsHistory: (systemId) => fetchApi(`/ha/${systemId}/ops-history`),
  getHADrivers: (systemId) => fetchApi(`/ha/${systemId}/drivers`),

  // Landscape
  getLandscapeValidation: () => fetchApi('/landscape/validation'),

  // AI
  getAIUseCases: () => fetchApi('/ai/use-cases'),
  getAIResponses: () => fetchApi('/ai/responses'),

  // Licenses
  getLicenses: () => fetchApi('/licenses'),

  // Connectors
  getConnectors: () => fetchApi('/connectors'),
  getConnectorById: (id) => fetchApi(`/connectors/${id}`),

  // Users
  getUsers: () => fetchApi('/users'),
  getUserById: (id) => fetchApi(`/users/${id}`),
  createUser: (data) => fetchApi('/users', { method: 'POST', body: data }),
  updateUser: (id, data) => fetchApi(`/users/${id}`, { method: 'PATCH', body: data }),
  deleteUser: (id) => fetchApi(`/users/${id}`, { method: 'DELETE' }),

  // Tenant
  getTenant: () => fetchApi('/tenant'),
  updateTenant: (data) => fetchApi('/tenant', { method: 'PATCH', body: data }),
  getTenantStats: () => fetchApi('/tenant/stats'),

  // Analytics
  getAnalyticsOverview: () => fetchApi('/analytics/overview'),
  getRunbookAnalytics: () => fetchApi('/analytics/runbooks'),
  getSystemTrends: (systemId, days) => fetchApi(`/analytics/systems/${systemId}/trends?days=${days || 7}`),

  // Chat / AI
  chat: (message, context) => fetchApi('/chat', { method: 'POST', body: { message, context } }),

  // Plans
  getPlans: () => fetchApi('/plans'),
  getPlanByTier: (tier) => fetchApi(`/plans/${tier}`),

  // Settings
  getSettings: () => fetchApi('/settings'),
  updateSettings: (data) => fetchApi('/settings', { method: 'PATCH', body: data }),
  getApiKeys: () => fetchApi('/settings/api-keys'),
  createApiKey: (name) => fetchApi('/settings/api-keys', { method: 'POST', body: { name } }),
  revokeApiKey: (id) => fetchApi(`/settings/api-keys/${id}/revoke`, { method: 'PATCH' }),

  // Audit
  getAuditLog: (filters) => {
    const params = new URLSearchParams();
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.action) params.set('action', filters.action);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return fetchApi(`/audit${qs ? `?${qs}` : ''}`);
  },
};

async function fetchApi(endpoint, options = {}) {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;
  const stored = localStorage.getItem('sap-spektra-auth');
  let auth = null;
  if (stored) {
    try { auth = JSON.parse(stored); } catch { localStorage.removeItem('sap-spektra-auth'); }
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(options.headers || {}),
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
