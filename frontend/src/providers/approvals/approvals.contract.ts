// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface ApprovalsProvider {
  getApprovals(status?: string): Promise<Any[]>;
  approveAction(id: string): Promise<Any>;
  rejectAction(id: string): Promise<Any>;
}
