// ══════════════════════════════════════════════════════════════
// SAP Spektra — Landscape Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns empty — landscape data unavailable.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { LandscapeProvider } from './landscape.contract';
import type { ApiRecord } from '../../types/api';

export class LandscapeRestrictedProvider implements LandscapeProvider {
  async getDiscovery(): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — discovery data unavailable',
    });
  }

  async getSIDLines(): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — SID lines unavailable',
    });
  }

  async getLandscapeValidation(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({ restricted: true } as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — landscape validation unavailable',
    });
  }
}
