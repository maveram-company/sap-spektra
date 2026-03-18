// ══════════════════════════════════════════════════════════════
// SAP Spektra — Systems Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

export interface SystemViewModel {
  id: string;
  sid: string;
  type: string;
  dbType: string;
  environment: string;
  healthScore: number;
  status: string;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  isRiseRestricted: boolean;
  description: string;
  mttr: number;
  mtbf: number;
  availability: number;
  breaches: number;
  lastCheck: string;
  [key: string]: unknown;
}

export interface SystemsProvider {
  getSystems(): Promise<ProviderResult<SystemViewModel[]>>;
  getSystemById(id: string): Promise<ProviderResult<SystemViewModel | null>>;
  getSystemMetrics(id: string, hours?: number): Promise<ProviderResult<ApiRecord>>;
  getSystemBreaches(id: string, limit?: number): Promise<ProviderResult<ApiRecord[]>>;
  getSystemSla(id: string): Promise<ProviderResult<ApiRecord>>;
  getServerMetrics(id: string): Promise<ProviderResult<ApiRecord | null>>;
  getServerDeps(id: string): Promise<ProviderResult<ApiRecord[]>>;
  getSystemInstances(id: string): Promise<ProviderResult<ApiRecord[]>>;
  getSystemHosts(id: string): Promise<ProviderResult<ApiRecord[]>>;
  getSystemMeta(id?: string): Promise<ProviderResult<ApiRecord>>;
  getSAPMonitoring(id: string): Promise<ProviderResult<ApiRecord>>;
  getMetricHistory(hostname: string): Promise<ProviderResult<ApiRecord[]>>;
}
