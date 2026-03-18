// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Provider Contract
// ══════════════════════════════════════════════════════════════

export interface EventsProvider {
  getEvents(): Promise<unknown[]>;
}
