// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: cached HA systems. Prereqs/ops/drivers: blocked or empty.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { HAProvider, HAConfigViewModel } from './ha.contract';
import type { ApiRecord } from '../../types/api';
import { HAMockProvider } from './ha.mock';

const mockFallback = new HAMockProvider();

export class HARestrictedProvider implements HAProvider {
  // READ: allowed with cached mock data
  async getHASystems(): Promise<ProviderResult<HAConfigViewModel[]>> {
    const mock = await mockFallback.getHASystems();
    return providerResult(mock.data, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — HA read-only from cache',
    });
  }

  // Blocked: prerequisites check unavailable
  async getHAPrereqs(_systemId?: string): Promise<ProviderResult<ApiRecord>> {
    return providerResult(
      { blocked: true, reason: 'HA prerequisites check unavailable in RESTRICTED mode' },
      'restricted',
      { confidence: 'low', reason: 'Restricted mode — HA prerequisites check unavailable' },
    );
  }

  // Empty: ops history unavailable
  async getHAOpsHistory(_systemId?: string): Promise<ProviderResult<ApiRecord>> {
    return providerResult(
      { operations: [] },
      'restricted',
      { confidence: 'low', reason: 'Restricted mode — HA operations history unavailable' },
    );
  }

  // Empty: drivers unavailable
  async getHADrivers(_systemId?: string): Promise<ProviderResult<ApiRecord>> {
    return providerResult(
      { drivers: [] },
      'restricted',
      { confidence: 'low', reason: 'Restricted mode — HA drivers unavailable' },
    );
  }
}
