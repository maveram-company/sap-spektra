// ══════════════════════════════════════════════════════════════
// SAP Spektra — Analytics Provider Contract
// ══════════════════════════════════════════════════════════════

export interface AnalyticsProvider {
  getAnalytics(): Promise<unknown>;
  getRunbookAnalytics(): Promise<unknown>;
}
