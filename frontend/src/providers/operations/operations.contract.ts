// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Provider Contract
// ══════════════════════════════════════════════════════════════

export interface OperationsProvider {
  getOperations(): Promise<unknown[]>;
  getBackgroundJobs(): Promise<unknown[]>;
  getTransports(): Promise<unknown[]>;
  getCertificates(): Promise<unknown[]>;
  getLicenses(): Promise<unknown>;
}
