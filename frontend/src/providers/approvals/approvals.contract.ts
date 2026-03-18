// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Provider Contract
// ══════════════════════════════════════════════════════════════

export interface ApprovalsProvider {
  getApprovals(status?: string): Promise<unknown[]>;
  approveAction(id: string): Promise<unknown>;
  rejectAction(id: string): Promise<unknown>;
}
