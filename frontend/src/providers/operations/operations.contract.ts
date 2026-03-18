// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface OperationsProvider {
  getOperations(): Promise<Any[]>;
  getBackgroundJobs(): Promise<Any[]>;
  getTransports(): Promise<Any[]>;
  getCertificates(): Promise<Any[]>;
  getLicenses(): Promise<Any>;
}
