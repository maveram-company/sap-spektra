// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Mock Provider
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import { mockAlerts } from '../../lib/mockData';
import type { AlertsProvider } from './alerts.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class AlertsMockProvider implements AlertsProvider {
  async getAlerts() {
    await delay();
    return mockAlerts;
  }

  async getAlertStats() {
    await delay();
    const total = mockAlerts.length;
    const critical = mockAlerts.filter((a: ApiRecord) => a.level === 'critical').length;
    const warnings = mockAlerts.filter((a: ApiRecord) => a.level === 'warning').length;
    return { total, critical, warnings };
  }
}
