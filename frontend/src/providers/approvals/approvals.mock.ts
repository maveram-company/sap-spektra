// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Mock Provider
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import { mockApprovals } from '../../lib/mockData';
import type { ApprovalsProvider } from './approvals.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class ApprovalsMockProvider implements ApprovalsProvider {
  async getApprovals(status?: string) {
    await delay();
    return status ? mockApprovals.filter((a: ApiRecord) => a.status === status) : mockApprovals;
  }

  async approveAction(_id: string) {
    await delay(300);
    return { success: true };
  }

  async rejectAction(_id: string) {
    await delay(300);
    return { success: true };
  }
}
