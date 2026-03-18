// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockRunbooks, mockRunbookExecutions } from '../../lib/mockData';
import type { ApiRecord } from '../../types/api';
import type { RunbooksProvider, RunbookViewModel, ExecutionViewModel } from './runbooks.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class RunbooksMockProvider implements RunbooksProvider {
  async getRunbooks(): Promise<RunbookViewModel[]> {
    await delay();
    return mockRunbooks as unknown as RunbookViewModel[];
  }

  async getRunbookExecutions(): Promise<ExecutionViewModel[]> {
    await delay(300);
    return mockRunbookExecutions as unknown as ExecutionViewModel[];
  }

  async executeRunbook(runbookId: string, systemId: string, dryRun = false): Promise<ApiRecord> {
    await delay(1500);
    return dryRun
      ? { dryRun: true, runbookId, systemId, wouldCreate: 'AUTO_EXECUTE', estimatedDuration: '~12s', steps: [], prereqs: [] }
      : { id: `exec-${Date.now()}`, runbookId, systemId, result: 'RUNNING', gate: 'SAFE' };
  }

  async getExecutionDetail(_executionId: string): Promise<ApiRecord | null> {
    await delay(300);
    return null;
  }
}
