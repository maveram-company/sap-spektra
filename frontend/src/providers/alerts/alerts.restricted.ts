// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns empty — alert data unavailable.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { AlertsProvider, AlertViewModel, AlertStats } from './alerts.contract';

export class AlertsRestrictedProvider implements AlertsProvider {
  async getAlerts(_filters?: { status?: string; level?: string; systemId?: string }): Promise<ProviderResult<AlertViewModel[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Alert history unavailable in restricted mode',
    });
  }

  async getAlertStats(): Promise<ProviderResult<AlertStats>> {
    return providerResult({ total: 0, critical: 0, warnings: 0 }, 'restricted', {
      confidence: 'low',
      reason: 'Alert stats unavailable in restricted mode',
    });
  }
}
