// ══════════════════════════════════════════════════════════════
// SAP Spektra — Admin Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import { createLogger } from '../../lib/logger';
import type { ApiAuditEntry, ApiRecord } from '../../types/api';
import type { AdminProvider, AuditEntryViewModel, UserViewModel } from './admin.contract';
import {
  mockThresholds,
  mockEscalationPolicy,
  mockMaintenanceWindows,
} from '../../lib/mockData';
import { providerResult } from '../types';

const log = createLogger('AdminRealProvider');

export function transformAudit(a: ApiAuditEntry): AuditEntryViewModel {
  return {
    ...a,
    userEmail: a.userEmail || (a as ApiRecord).user || '',
    time: (a as ApiRecord).timestamp || a.createdAt || '',
    user: a.userEmail || (a as ApiRecord).user || '',
    timestamp: (a as ApiRecord).timestamp || a.createdAt,
  };
}

export class AdminRealProvider implements AdminProvider {
  async getUsers() {
    const users = await api.getUsers() as Record<string, unknown>[];
    return providerResult(users.map((u: ApiRecord) => ({
      ...u,
      id: u.id || '',
      email: u.email || '',
      name: u.name || '',
      role: u.role || '',
      status: u.status || '',
      lastLogin: u.lastLoginAt || u.lastLogin,
      mfa: u.mfaEnabled ?? u.mfa ?? false,
      avatar: null,
    } as UserViewModel)), 'real');
  }

  async getAuditLog() {
    const entries = await api.getAuditLog() as ApiAuditEntry[];
    return providerResult(entries.map(transformAudit), 'real');
  }

  async getPlans() {
    const data = await api.getPlans();
    return providerResult(data as ApiRecord, 'real');
  }

  async getApiKeys() {
    const data = await api.getApiKeys();
    return providerResult(data as ApiRecord, 'real');
  }

  async getThresholds() {
    try {
      const settings = await api.getSettings() as ApiRecord;
      return providerResult((settings?.settings?.thresholds || mockThresholds) as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch thresholds', { error: (err as Error).message });
      return providerResult(mockThresholds as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }

  async getEscalationPolicy() {
    try {
      const settings = await api.getSettings() as ApiRecord;
      return providerResult((settings?.settings?.escalation || mockEscalationPolicy) as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch escalation policy', { error: (err as Error).message });
      return providerResult(mockEscalationPolicy as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }

  async getMaintenanceWindows() {
    try {
      const settings = await api.getSettings() as ApiRecord;
      return providerResult((settings?.settings?.maintenanceWindows || mockMaintenanceWindows) as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch maintenance windows', { error: (err as Error).message });
      return providerResult(mockMaintenanceWindows as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }
}
