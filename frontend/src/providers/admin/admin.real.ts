// ══════════════════════════════════════════════════════════════
// SAP Spektra — Admin Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import { createLogger } from '../../lib/logger';
import type { ApiAuditEntry, ApiRecord } from '../../types/api';
import type { AdminProvider } from './admin.contract';
import {
  mockThresholds,
  mockEscalationPolicy,
  mockMaintenanceWindows,
} from '../../lib/mockData';

const log = createLogger('AdminRealProvider');

export function transformAudit(a: ApiAuditEntry) {
  return {
    ...a,
    user: a.userEmail || a.user || '',
    timestamp: a.timestamp || a.createdAt,
  };
}

export class AdminRealProvider implements AdminProvider {
  async getUsers() {
    const users = await api.getUsers() as Record<string, unknown>[];
    return users.map((u: ApiRecord) => ({
      ...u,
      lastLogin: u.lastLoginAt || u.lastLogin,
      mfa: u.mfaEnabled ?? u.mfa ?? false,
      avatar: null,
    }));
  }

  async getAuditLog() {
    const entries = await api.getAuditLog() as ApiAuditEntry[];
    return entries.map(transformAudit);
  }

  async getPlans() {
    return api.getPlans();
  }

  async getApiKeys() {
    return api.getApiKeys();
  }

  async getThresholds() {
    try {
      const settings = await api.getSettings() as ApiRecord;
      return settings?.settings?.thresholds || mockThresholds;
    } catch (err: unknown) {
      log.error('Failed to fetch thresholds', { error: (err as Error).message });
      return mockThresholds;
    }
  }

  async getEscalationPolicy() {
    try {
      const settings = await api.getSettings() as ApiRecord;
      return settings?.settings?.escalation || mockEscalationPolicy;
    } catch (err: unknown) {
      log.error('Failed to fetch escalation policy', { error: (err as Error).message });
      return mockEscalationPolicy;
    }
  }

  async getMaintenanceWindows() {
    try {
      const settings = await api.getSettings() as ApiRecord;
      return settings?.settings?.maintenanceWindows || mockMaintenanceWindows;
    } catch (err: unknown) {
      log.error('Failed to fetch maintenance windows', { error: (err as Error).message });
      return mockMaintenanceWindows;
    }
  }
}
