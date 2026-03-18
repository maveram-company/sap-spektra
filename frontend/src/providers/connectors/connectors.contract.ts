// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Provider Contract
// ══════════════════════════════════════════════════════════════

export interface ConnectorsProvider {
  getConnectors(): Promise<unknown[]>;
}
