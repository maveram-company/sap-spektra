import { useState, useCallback } from 'react';

const getApiUrl = () => import.meta.env.VITE_API_URL || '';

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
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { request, loading, error, setError };
}

// Pre-built API functions
export const api = {
  getSystems: () => fetchApi('/systems'),
  getSystemMetrics: (id, hours = 2) => fetchApi(`/systems/${id}/metrics?hours=${hours}`),
  getSystemBreaches: (id, limit = 50) => fetchApi(`/systems/${id}/breaches?limit=${limit}`),
  getSystemSla: (id) => fetchApi(`/systems/${id}/sla`),
  getApprovals: (status) => fetchApi(`/approvals${status ? `?status=${status}` : ''}`),
  approveAction: (id, token) => fetchApi(`/approvals/${id}/approve?token=${token}`),
  rejectAction: (id, token) => fetchApi(`/approvals/${id}/reject?token=${token}`),
  getOperations: () => fetchApi('/scheduled-operations'),
  getAnalytics: (systemId) => fetchApi(`/analytics/runbooks${systemId ? `?systemId=${systemId}` : ''}`),
  chat: (message, context) => fetchApi('/chat', { method: 'POST', body: { message, context } }),
  registerSystem: (data) => fetchApi('/admin/systems', { method: 'POST', body: data }),
  getTrialStatus: () => fetchApi('/trial/status'),
  getAdvisorResults: (systemId) => fetchApi(`/advisor-results${systemId ? `?systemId=${systemId}` : ''}`),
  healthCheck: () => fetchApi('/health'),
  // SaaS endpoints (mock)
  getOrganization: () => fetchApi('/organization'),
  getUsers: () => fetchApi('/organization/users'),
  getAuditLog: () => fetchApi('/organization/audit-log'),
  getPlans: () => fetchApi('/plans'),
};

async function fetchApi(endpoint, options = {}) {
  const baseUrl = getApiUrl();
  const url = baseUrl ? `${baseUrl}${endpoint}` : endpoint;
  const stored = localStorage.getItem('sap-maveram-auth');
  let auth = null;
  if (stored) {
    try { auth = JSON.parse(stored); } catch { localStorage.removeItem('sap-maveram-auth'); }
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
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || errBody.error || `Error ${res.status}`);
  }

  return res.json();
}
