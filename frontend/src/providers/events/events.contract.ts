// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface EventsProvider {
  getEvents(): Promise<Any[]>;
}
