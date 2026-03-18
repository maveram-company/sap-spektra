// ══════════════════════════════════════════════════════════════
// SAP Spektra — Systems Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';

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
  getSystems(): Promise<SystemViewModel[]>;
  getSystemById(id: string): Promise<SystemViewModel | null>;
  getSystemMetrics(id: string, hours?: number): Promise<ApiRecord>;
  getSystemBreaches(id: string, limit?: number): Promise<ApiRecord[]>;
  getSystemSla(id: string): Promise<ApiRecord>;
  getServerMetrics(id: string): Promise<ApiRecord | null>;
  getServerDeps(id: string): Promise<ApiRecord[]>;
  getSystemInstances(id: string): Promise<ApiRecord[]>;
  getSystemHosts(id: string): Promise<ApiRecord[]>;
  getSystemMeta(id?: string): Promise<ApiRecord>;
  getSAPMonitoring(id: string): Promise<ApiRecord>;
  getMetricHistory(hostname: string): Promise<ApiRecord[]>;
}
