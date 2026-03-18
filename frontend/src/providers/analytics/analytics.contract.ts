// ══════════════════════════════════════════════════════════════
// SAP Spektra — Analytics Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface AnalyticsProvider {
  getAnalytics(): Promise<Any>;
  getRunbookAnalytics(): Promise<Any>;
}
