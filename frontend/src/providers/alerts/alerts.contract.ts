// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ProviderResult } from '../types';

export interface AlertViewModel {
  id: string;
  title: string;
  message?: string;
  level: string;
  status: string;
  sid: string;
  time: string;
  resolved: boolean;
  [key: string]: unknown;
}

export interface AlertStats {
  total: number;
  critical: number;
  warnings: number;
}

export interface AlertsProvider {
  getAlerts(filters?: { status?: string; level?: string; systemId?: string }): Promise<ProviderResult<AlertViewModel[]>>;
  getAlertStats(): Promise<ProviderResult<AlertStats>>;
}
