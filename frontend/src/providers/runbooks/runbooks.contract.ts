// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

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
  getRunbooks(): Promise<ProviderResult<RunbookViewModel[]>>;
  getRunbookExecutions(): Promise<ProviderResult<ExecutionViewModel[]>>;
  executeRunbook(runbookId: string, systemId: string, dryRun?: boolean): Promise<ProviderResult<ApiRecord>>;
  getExecutionDetail(executionId: string): Promise<ProviderResult<ApiRecord | null>>;
}
