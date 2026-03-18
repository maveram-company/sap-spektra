// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: allowed with cached/mock fallback. WRITE: blocked.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { RunbooksProvider, RunbookViewModel, ExecutionViewModel } from './runbooks.contract';
import type { ApiRecord } from '../../types/api';
import { RunbooksMockProvider } from './runbooks.mock';

const mockFallback = new RunbooksMockProvider();

export class RunbooksRestrictedProvider implements RunbooksProvider {
  // READ: allowed with restrictions
  async getRunbooks(): Promise<ProviderResult<RunbookViewModel[]>> {
    const mock = await mockFallback.getRunbooks();
    return providerResult(mock.data, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — runbook catalog from cache, execution disabled',
    });
  }

  async getRunbookExecutions(): Promise<ProviderResult<ExecutionViewModel[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — execution history unavailable',
    });
  }

  // WRITE: blocked
  async executeRunbook(_runbookId: string, _systemId: string, _dryRun?: boolean): Promise<ProviderResult<ApiRecord>> {
    return providerResult(
      { blocked: true, reason: 'Execution blocked in RESTRICTED mode' },
      'restricted',
      { confidence: 'low', reason: 'Action blocked: RESTRICTED mode does not allow runbook execution' },
    );
  }

  async getExecutionDetail(_executionId: string): Promise<ProviderResult<ApiRecord | null>> {
    return providerResult(null, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — execution details unavailable',
    });
  }
}
