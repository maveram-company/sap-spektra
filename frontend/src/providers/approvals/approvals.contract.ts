// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

export interface ApprovalViewModel {
  id: string;
  type: string;
  status: string;
  reason: string;
  requestedBy: string;
  sid: string;
  time: string;
  [key: string]: unknown;
}

export interface ApprovalsProvider {
  getApprovals(status?: string): Promise<ProviderResult<ApprovalViewModel[]>>;
  approveAction(id: string): Promise<ProviderResult<ApiRecord>>;
  rejectAction(id: string): Promise<ProviderResult<ApiRecord>>;
}
