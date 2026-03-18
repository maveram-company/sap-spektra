// ══════════════════════════════════════════════════════════════
// SAP Spektra — Analytics Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

export interface AnalyticsProvider {
  getAnalytics(): Promise<ProviderResult<ApiRecord>>;
  getRunbookAnalytics(): Promise<ProviderResult<ApiRecord>>;
}
