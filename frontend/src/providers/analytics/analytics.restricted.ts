// ══════════════════════════════════════════════════════════════
// SAP Spektra — Analytics Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns restricted marker — analytics unavailable.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { AnalyticsProvider } from './analytics.contract';
import type { ApiRecord } from '../../types/api';

export class AnalyticsRestrictedProvider implements AnalyticsProvider {
  async getAnalytics(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({ restricted: true } as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Analytics unavailable in restricted mode',
    });
  }

  async getRunbookAnalytics(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({ restricted: true } as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Analytics unavailable in restricted mode',
    });
  }
}
