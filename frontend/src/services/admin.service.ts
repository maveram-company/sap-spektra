// ══════════════════════════════════════════════════════════════
// SAP Spektra — Admin Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: getUsers, getAuditLog, getPlans, getApiKeys,
//         getThresholds, getEscalationPolicy, getMaintenanceWindows
//   DEMO: returns mock data with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import { createLogger } from '../lib/logger';
import type { ApiAuditEntry, ApiRecord } from '../types/api';
import {
  mockUsers,
  mockAuditLog,
  mockThresholds,
  mockEscalationPolicy,
  mockMaintenanceWindows,
  mockApiKeys,
} from '../lib/mockData';

const log = createLogger('AdminService');
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Transform: API → frontend ViewModel ──

export function transformAudit(a: ApiAuditEntry) {
  return {
    ...a,
    user: a.userEmail || a.user || '',
    timestamp: a.timestamp || a.createdAt,
  };
}

// ── Public API ──

export const getUsers = async () => {
  if (isDemoMode()) { await delay(); return mockUsers; }
  const users = await api.getUsers() as Record<string, unknown>[];
  return users.map((u: ApiRecord) => ({
    ...u,
    lastLogin: u.lastLoginAt || u.lastLogin,
    mfa: u.mfaEnabled ?? u.mfa ?? false,
    avatar: null,
  }));
};

export const getAuditLog = async () => {
  if (isDemoMode()) { await delay(); return mockAuditLog; }
  const entries = await api.getAuditLog() as ApiAuditEntry[];
  return entries.map(transformAudit);
};

export const getPlans = async () => {
  if (isDemoMode()) { await delay(300); return []; }
  return api.getPlans();
};

export const getApiKeys = async () => {
  if (isDemoMode()) { await delay(300); return mockApiKeys; }
  return api.getApiKeys();
};

export const getThresholds = async () => {
  if (isDemoMode()) { await delay(300); return mockThresholds; }
  try {
    const settings = await api.getSettings() as ApiRecord;
    return settings?.settings?.thresholds || mockThresholds;
  } catch (err: unknown) {
    log.error('Failed to fetch thresholds', { error: (err as Error).message });
    return mockThresholds;
  }
};

export const getEscalationPolicy = async () => {
  if (isDemoMode()) { await delay(300); return mockEscalationPolicy; }
  try {
    const settings = await api.getSettings() as ApiRecord;
    return settings?.settings?.escalation || mockEscalationPolicy;
  } catch (err: unknown) {
    log.error('Failed to fetch escalation policy', { error: (err as Error).message });
    return mockEscalationPolicy;
  }
};

export const getMaintenanceWindows = async () => {
  if (isDemoMode()) { await delay(300); return mockMaintenanceWindows; }
  try {
    const settings = await api.getSettings() as ApiRecord;
    return settings?.settings?.maintenanceWindows || mockMaintenanceWindows;
  } catch (err: unknown) {
    log.error('Failed to fetch maintenance windows', { error: (err as Error).message });
    return mockMaintenanceWindows;
  }
};
