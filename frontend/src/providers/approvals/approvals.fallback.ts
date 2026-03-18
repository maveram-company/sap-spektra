// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { ApprovalsProvider } from './approvals.contract';
import { ApprovalsRealProvider } from './approvals.real';
import { ApprovalsMockProvider } from './approvals.mock';

export function createApprovalsFallbackProvider(): ApprovalsProvider {
  return createFallbackProvider<ApprovalsProvider>(
    new ApprovalsRealProvider(),
    new ApprovalsMockProvider(),
    'Approvals',
  );
}
