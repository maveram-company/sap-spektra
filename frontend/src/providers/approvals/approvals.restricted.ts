// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns empty (history unavailable). WRITE: blocked.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { ApprovalsProvider, ApprovalViewModel } from './approvals.contract';
import type { ApiRecord } from '../../types/api';

export class ApprovalsRestrictedProvider implements ApprovalsProvider {
  // READ: returns empty — approval history unavailable in restricted mode
  async getApprovals(_status?: string): Promise<ProviderResult<ApprovalViewModel[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — approval history unavailable',
    });
  }

  // WRITE: blocked
  async approveAction(_id: string): Promise<ProviderResult<ApiRecord>> {
    return providerResult(
      { blocked: true, reason: 'Approval actions blocked in RESTRICTED mode' },
      'restricted',
      { confidence: 'low', reason: 'Action blocked: RESTRICTED mode does not allow approval actions' },
    );
  }

  async rejectAction(_id: string): Promise<ProviderResult<ApiRecord>> {
    return providerResult(
      { blocked: true, reason: 'Approval actions blocked in RESTRICTED mode' },
      'restricted',
      { confidence: 'low', reason: 'Action blocked: RESTRICTED mode does not allow rejection actions' },
    );
  }
}
