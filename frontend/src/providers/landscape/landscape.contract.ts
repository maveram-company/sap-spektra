// ══════════════════════════════════════════════════════════════
// SAP Spektra — Landscape Provider Contract
// ══════════════════════════════════════════════════════════════

export interface LandscapeProvider {
  getDiscovery(): Promise<unknown[]>;
  getSIDLines(): Promise<unknown[]>;
  getLandscapeValidation(): Promise<unknown>;
}
