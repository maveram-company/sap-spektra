// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiAlert } from '../../types/api';
import type { AlertsProvider, AlertViewModel, AlertStats } from './alerts.contract';
import { providerResult } from '../types';

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
  async getAlerts(_filters?: { status?: string; level?: string; systemId?: string }) {
    const alerts = await api.getAlerts(_filters) as ApiAlert[];
    return providerResult(alerts.map(transformAlert), 'real');
  }

  async getAlertStats() {
    const stats = await api.getAlertStats() as AlertStats;
    return providerResult(stats, 'real');
  }
}
