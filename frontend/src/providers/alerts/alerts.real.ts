// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiAlert } from '../../types/api';
import type { AlertsProvider } from './alerts.contract';

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

export class AlertsRealProvider implements AlertsProvider {
  async getAlerts(_filters?: { status?: string; level?: string; systemId?: string }) {
    const alerts = await api.getAlerts(_filters) as ApiAlert[];
    return alerts.map(transformAlert);
  }

  async getAlertStats() {
    return api.getAlertStats();
  }
}
