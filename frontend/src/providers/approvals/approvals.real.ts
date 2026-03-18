// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiApproval, ApiRecord } from '../../types/api';
import type { ApprovalsProvider, ApprovalViewModel } from './approvals.contract';

export function transformApproval(a: ApiApproval): ApprovalViewModel {
  return {
    ...a,
    sid: a.system?.sid || (a as Record<string, unknown>).sid as string || '',
    time: a.createdAt
      ? new Date(a.createdAt).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })
      : '',
  };
}

export class ApprovalsRealProvider implements ApprovalsProvider {
  async getApprovals(status?: string): Promise<ApprovalViewModel[]> {
    const approvals = await api.getApprovals(status) as ApiApproval[];
    return approvals.map(transformApproval);
  }

  async approveAction(id: string): Promise<ApiRecord> {
    return api.approveAction(id);
  }

  async rejectAction(id: string): Promise<ApiRecord> {
    return api.rejectAction(id);
  }
}
