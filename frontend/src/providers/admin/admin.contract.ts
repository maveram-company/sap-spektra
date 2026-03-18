// ══════════════════════════════════════════════════════════════
// SAP Spektra — Admin Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface AdminProvider {
  getUsers(): Promise<Any[]>;
  getAuditLog(): Promise<Any[]>;
  getPlans(): Promise<Any>;
  getApiKeys(): Promise<Any>;
  getThresholds(): Promise<Any>;
  getEscalationPolicy(): Promise<Any>;
  getMaintenanceWindows(): Promise<Any>;
}
