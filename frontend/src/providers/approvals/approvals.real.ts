// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiApproval, ApiRecord } from '../../types/api';
import type { ApprovalsProvider, ApprovalViewModel } from './approvals.contract';
import { providerResult } from '../types';

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
  async getApprovals(status?: string) {
    const approvals = await api.getApprovals(status) as ApiApproval[];
    return providerResult(approvals.map(transformApproval), 'real');
  }

  async approveAction(id: string) {
    const data = await api.approveAction(id);
    return providerResult(data, 'real');
  }

  async rejectAction(id: string) {
    const data = await api.rejectAction(id);
    return providerResult(data, 'real');
  }
}
