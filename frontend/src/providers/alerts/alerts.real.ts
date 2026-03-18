// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiAlert } from '../../types/api';
import type { AlertsProvider, AlertViewModel, AlertStats } from './alerts.contract';

export function transformAlert(a: ApiAlert): AlertViewModel {
  return {
    ...a,
    sid: a.system?.sid || (a as Record<string, unknown>).sid as string || '',
    time: a.createdAt
      ? new Date(a.createdAt).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })
      : '',
    resolved: a.status === 'resolved',
  };
}

export class AlertsRealProvider implements AlertsProvider {
  async getAlerts(_filters?: { status?: string; level?: string; systemId?: string }): Promise<AlertViewModel[]> {
    const alerts = await api.getAlerts(_filters) as ApiAlert[];
    return alerts.map(transformAlert);
  }

  async getAlertStats(): Promise<AlertStats> {
    return api.getAlertStats() as Promise<AlertStats>;
  }
}
