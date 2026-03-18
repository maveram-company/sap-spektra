// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface RunbooksProvider {
  getRunbooks(): Promise<Any[]>;
  getRunbookExecutions(): Promise<Any[]>;
  executeRunbook(runbookId: string, systemId: string, dryRun?: boolean): Promise<Any>;
  getExecutionDetail(executionId: string): Promise<Any>;
}
