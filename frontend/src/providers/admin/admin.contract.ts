// ══════════════════════════════════════════════════════════════
// SAP Spektra — Admin Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

export interface UserViewModel {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  [key: string]: unknown;
}

export interface AuditEntryViewModel {
  id: string;
  action: string;
  resource: string;
  severity: string;
  userEmail: string;
  time: string;
  [key: string]: unknown;
}

export interface AdminProvider {
  getUsers(): Promise<ProviderResult<UserViewModel[]>>;
  getAuditLog(): Promise<ProviderResult<AuditEntryViewModel[]>>;
  getPlans(): Promise<ProviderResult<ApiRecord>>;
  getApiKeys(): Promise<ProviderResult<ApiRecord>>;
  getThresholds(): Promise<ProviderResult<ApiRecord>>;
  getEscalationPolicy(): Promise<ProviderResult<ApiRecord>>;
  getMaintenanceWindows(): Promise<ProviderResult<ApiRecord>>;
}
