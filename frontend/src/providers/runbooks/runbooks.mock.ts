// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockRunbooks, mockRunbookExecutions } from '../../lib/mockData';
import type { RunbooksProvider } from './runbooks.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class RunbooksMockProvider implements RunbooksProvider {
  async getRunbooks() {
    await delay();
    return mockRunbooks;
  }

  async getRunbookExecutions() {
    await delay(300);
    return mockRunbookExecutions;
  }

  async executeRunbook(runbookId: string, systemId: string, dryRun = false) {
    await delay(1500);
    return dryRun
      ? { dryRun: true, runbookId, systemId, wouldCreate: 'AUTO_EXECUTE', estimatedDuration: '~12s', steps: [], prereqs: [] }
      : { id: `exec-${Date.now()}`, runbookId, systemId, result: 'RUNNING', gate: 'SAFE' };
  }

  async getExecutionDetail(_executionId: string) {
    await delay(300);
    return null;
  }
}
