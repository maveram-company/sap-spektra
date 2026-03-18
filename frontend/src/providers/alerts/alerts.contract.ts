// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface AlertsProvider {
  getAlerts(filters?: { status?: string; level?: string; systemId?: string }): Promise<Any[]>;
  getAlertStats(): Promise<Any>;
}
