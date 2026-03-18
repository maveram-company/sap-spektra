// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Mock Provider
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import { mockApprovals } from '../../lib/mockData';
import type { ApprovalsProvider, ApprovalViewModel } from './approvals.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class ApprovalsMockProvider implements ApprovalsProvider {
  async getApprovals(status?: string) {
    await delay();
    const data = status
      ? (mockApprovals as unknown as ApprovalViewModel[]).filter((a: ApiRecord) => a.status === status)
      : (mockApprovals as unknown as ApprovalViewModel[]);
    return providerResult(data, 'mock');
  }

  async approveAction(_id: string) {
    await delay(300);
    return providerResult({ success: true } as ApiRecord, 'mock');
  }

  async rejectAction(_id: string) {
    await delay(300);
    return providerResult({ success: true } as ApiRecord, 'mock');
  }
}
