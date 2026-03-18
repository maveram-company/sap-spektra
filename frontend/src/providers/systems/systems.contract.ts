// ══════════════════════════════════════════════════════════════
// SAP Spektra — Systems Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface SystemsProvider {
  getSystems(): Promise<Any[]>;
  getSystemById(id: string): Promise<Any>;
  getSystemMetrics(id: string, hours?: number): Promise<Any>;
  getSystemBreaches(id: string, limit?: number): Promise<Any[]>;
  getSystemSla(id: string): Promise<Any>;
  getServerMetrics(id: string): Promise<Any>;
  getServerDeps(id: string): Promise<Any[]>;
  getSystemInstances(id: string): Promise<Any[]>;
  getSystemHosts(id: string): Promise<Any[]>;
  getSystemMeta(id?: string): Promise<Any>;
  getSAPMonitoring(id: string): Promise<Any>;
  getMetricHistory(hostname: string): Promise<Any[]>;
}
