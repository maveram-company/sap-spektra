// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: getAlerts, getAlertStats
//   DEMO: returns mockAlerts with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import type { ApiAlert, ApiRecord } from '../types/api';
import {
  mockAlerts,
} from '../lib/mockData';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Transform: API → frontend ViewModel ──

export function transformAlert(a: ApiAlert) {
  return {
    ...a,
    sid: a.system?.sid || a.sid || '',
    time: a.createdAt
      ? new Date(a.createdAt).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })
      : '',
    resolved: a.status === 'resolved',
  };
}

// ── Public API ──

export const getAlerts = async (_filters?: { status?: string; level?: string; systemId?: string }) => {
  if (isDemoMode()) { await delay(); return mockAlerts; }
  const alerts = await api.getAlerts(_filters) as ApiAlert[];
  return alerts.map(transformAlert);
};

export const getAlertStats = async () => {
  if (isDemoMode()) {
    await delay();
    const total = mockAlerts.length;
    const critical = mockAlerts.filter((a: ApiRecord) => a.level === 'critical').length;
    const warnings = mockAlerts.filter((a: ApiRecord) => a.level === 'warning').length;
    return { total, critical, warnings };
  }
  return api.getAlertStats();
};
