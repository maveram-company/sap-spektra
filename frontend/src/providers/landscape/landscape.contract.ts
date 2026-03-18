// ══════════════════════════════════════════════════════════════
// SAP Spektra — Landscape Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

export interface LandscapeProvider {
  getDiscovery(): Promise<ProviderResult<ApiRecord[]>>;
  getSIDLines(): Promise<ProviderResult<ApiRecord[]>>;
  getLandscapeValidation(): Promise<ProviderResult<ApiRecord>>;
}
