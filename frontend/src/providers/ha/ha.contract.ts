// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

export interface HAConfigViewModel {
  id: string;
  systemId: string;
  strategy: string;
  status: string;
  primaryNode: string;
  secondaryNode: string;
  [key: string]: unknown;
}

export interface HAProvider {
  getHASystems(): Promise<ProviderResult<HAConfigViewModel[]>>;
  getHAPrereqs(systemId?: string): Promise<ProviderResult<ApiRecord>>;
  getHAOpsHistory(systemId?: string): Promise<ProviderResult<ApiRecord>>;
  getHADrivers(systemId?: string): Promise<ProviderResult<ApiRecord>>;
}
