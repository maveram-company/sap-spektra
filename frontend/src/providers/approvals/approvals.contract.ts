// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';

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
  getApprovals(status?: string): Promise<ApprovalViewModel[]>;
  approveAction(id: string): Promise<ApiRecord>;
  rejectAction(id: string): Promise<ApiRecord>;
}
