// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Mock Provider
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import { mockApprovals } from '../../lib/mockData';
import type { ApprovalsProvider, ApprovalViewModel } from './approvals.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class ApprovalsMockProvider implements ApprovalsProvider {
  async getApprovals(status?: string): Promise<ApprovalViewModel[]> {
    await delay();
    return status
      ? (mockApprovals as unknown as ApprovalViewModel[]).filter((a: ApiRecord) => a.status === status)
      : (mockApprovals as unknown as ApprovalViewModel[]);
  }

  async approveAction(_id: string): Promise<ApiRecord> {
    await delay(300);
    return { success: true };
  }

  async rejectAction(_id: string): Promise<ApiRecord> {
    await delay(300);
    return { success: true };
  }
}
