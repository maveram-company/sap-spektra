// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Mock Provider
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import { mockAlerts } from '../../lib/mockData';
import type { AlertsProvider, AlertViewModel, AlertStats } from './alerts.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class AlertsMockProvider implements AlertsProvider {
  async getAlerts(filters?: { status?: string; level?: string; systemId?: string }) {
    await delay();
    let result = mockAlerts as unknown as AlertViewModel[];
    if (filters?.status) {
      result = result.filter((a: ApiRecord) => a.status === filters.status);
    }
    if (filters?.level) {
      result = result.filter((a: ApiRecord) => a.level === filters.level);
    }
    if (filters?.systemId) {
      result = result.filter((a: ApiRecord) => a.systemId === filters.systemId);
    }
    return providerResult(result, 'mock');
  }

  async getAlertStats() {
    await delay();
    const total = mockAlerts.length;
    const critical = mockAlerts.filter((a: ApiRecord) => a.level === 'critical').length;
    const warnings = mockAlerts.filter((a: ApiRecord) => a.level === 'warning').length;
    return providerResult({ total, critical, warnings } as AlertStats, 'mock');
  }
}
