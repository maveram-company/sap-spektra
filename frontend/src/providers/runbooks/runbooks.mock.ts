// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockRunbooks, mockRunbookExecutions } from '../../lib/mockData';
import type { ApiRecord } from '../../types/api';
import type { RunbooksProvider, RunbookViewModel, ExecutionViewModel } from './runbooks.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class RunbooksMockProvider implements RunbooksProvider {
  async getRunbooks() {
    await delay();
    return providerResult(mockRunbooks as unknown as RunbookViewModel[], 'mock');
  }

  async getRunbookExecutions() {
    await delay(300);
    return providerResult(mockRunbookExecutions as unknown as ExecutionViewModel[], 'mock');
  }

  async executeRunbook(runbookId: string, systemId: string, dryRun = false) {
    await delay(1500);
    const data = dryRun
      ? { dryRun: true, runbookId, systemId, wouldCreate: 'AUTO_EXECUTE', estimatedDuration: '~12s', steps: [], prereqs: [] }
      : { id: `exec-${Date.now()}`, runbookId, systemId, result: 'RUNNING', gate: 'SAFE' };
    return providerResult(data as ApiRecord, 'mock');
  }

  async getExecutionDetail(_executionId: string) {
    await delay(300);
    return providerResult(null as ApiRecord | null, 'mock');
  }
}
