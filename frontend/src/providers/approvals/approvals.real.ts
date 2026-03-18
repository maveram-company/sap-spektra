// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiApproval } from '../../types/api';
import type { ApprovalsProvider } from './approvals.contract';

export function transformApproval(a: ApiApproval) {
  return {
    ...a,
    sid: a.system?.sid || a.sid || '',
  };
}

export class ApprovalsRealProvider implements ApprovalsProvider {
  async getApprovals(status?: string) {
    const approvals = await api.getApprovals(status) as ApiApproval[];
    return approvals.map(transformApproval);
  }

  async approveAction(id: string) {
    return api.approveAction(id);
  }

  async rejectAction(id: string) {
    return api.rejectAction(id);
  }
}
