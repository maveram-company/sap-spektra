// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Provider Contract
// ══════════════════════════════════════════════════════════════

export interface RunbooksProvider {
  getRunbooks(): Promise<unknown[]>;
  getRunbookExecutions(): Promise<unknown[]>;
  executeRunbook(runbookId: string, systemId: string, dryRun?: boolean): Promise<unknown>;
  getExecutionDetail(executionId: string): Promise<unknown>;
}
