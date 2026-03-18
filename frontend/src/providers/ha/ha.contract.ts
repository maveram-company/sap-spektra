// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface HAProvider {
  getHASystems(): Promise<Any[]>;
  getHAPrereqs(systemId?: string): Promise<Any>;
  getHAOpsHistory(systemId?: string): Promise<Any>;
  getHADrivers(systemId?: string): Promise<Any>;
}
