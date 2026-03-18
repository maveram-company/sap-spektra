// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface ConnectorsProvider {
  getConnectors(): Promise<Any[]>;
}
