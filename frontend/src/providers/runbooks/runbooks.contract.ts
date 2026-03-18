// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';

export interface RunbookViewModel {
  id: string;
  name: string;
  description?: string;
  category?: string;
  dbType?: string;
  costSafe?: boolean;
  autoExecute?: boolean;
  [key: string]: unknown;
}

export interface ExecutionViewModel {
  id: string;
  runbookId: string;
  systemId: string;
  status: string;
  result?: string;
  [key: string]: unknown;
}

export interface RunbooksProvider {
  getRunbooks(): Promise<RunbookViewModel[]>;
  getRunbookExecutions(): Promise<ExecutionViewModel[]>;
  executeRunbook(runbookId: string, systemId: string, dryRun?: boolean): Promise<ApiRecord>;
  getExecutionDetail(executionId: string): Promise<ApiRecord | null>;
}
