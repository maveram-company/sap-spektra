// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Provider Contract
// ══════════════════════════════════════════════════════════════

export interface AlertsProvider {
  getAlerts(filters?: { status?: string; level?: string; systemId?: string }): Promise<unknown[]>;
  getAlertStats(): Promise<unknown>;
}
