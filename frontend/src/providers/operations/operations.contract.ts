// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

export interface OperationViewModel {
  id: string;
  type: string;
  status: string;
  description: string;
  riskLevel: string;
  sid: string;
  time: string;
  [key: string]: unknown;
}

export interface OperationsProvider {
  getOperations(): Promise<ProviderResult<OperationViewModel[]>>;
  getBackgroundJobs(): Promise<ProviderResult<ApiRecord[]>>;
  getTransports(): Promise<ProviderResult<ApiRecord[]>>;
  getCertificates(): Promise<ProviderResult<ApiRecord[]>>;
  getLicenses(): Promise<ProviderResult<ApiRecord>>;
}
