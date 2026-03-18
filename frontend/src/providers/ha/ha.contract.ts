// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA Provider Contract
// ══════════════════════════════════════════════════════════════

export interface HAProvider {
  getHASystems(): Promise<unknown[]>;
  getHAPrereqs(systemId?: string): Promise<unknown>;
  getHAOpsHistory(systemId?: string): Promise<unknown>;
  getHADrivers(systemId?: string): Promise<unknown>;
}
