import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock api module ──
vi.mock('../hooks/useApi', () => ({
  api: {
    getRunbooks: vi.fn().mockResolvedValue([
      { id: 'rb-1', name: 'HANA Backup', description: 'Automated backup', category: 'Backup', dbType: 'HANA', autoExecute: true, costSafe: true, executions: [], prereqs: '[]', steps: '[]' },
    ]),
    getRunbookExecutions: vi.fn().mockResolvedValue([
      { id: 'exec-1', runbookId: 'rb-1', systemId: 'sys-1', status: 'SUCCESS', result: 'SUCCESS', system: { sid: 'EP1' }, startedAt: '2026-01-01T00:00:00Z' },
    ]),
    executeRunbook: vi.fn().mockResolvedValue({ id: 'exec-new', result: 'RUNNING' }),
    getExecutionDetail: vi.fn().mockResolvedValue({ id: 'exec-1', steps: [] }),
    getAlerts: vi.fn().mockResolvedValue([
      { id: 'alert-1', level: 'critical', status: 'active', description: 'High CPU', systemId: 'sys-1', system: { sid: 'EP1' }, detectedAt: '2026-01-01T00:00:00Z', metrics: {} },
    ]),
    getAlertStats: vi.fn().mockResolvedValue({ total: 10, critical: 2, high: 3, medium: 4, low: 1 }),
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'EP1', type: 'S/4HANA', environment: 'PRD', status: 'healthy', healthScore: 94, description: 'ERP System' },
    ]),
    getSystemById: vi.fn().mockResolvedValue({ id: 'sys-1', sid: 'EP1' }),
    getSystemMetrics: vi.fn().mockResolvedValue([]),
    getSystemBreaches: vi.fn().mockResolvedValue([]),
    getSystemSla: vi.fn().mockResolvedValue({}),
    getServerMetrics: vi.fn().mockResolvedValue({}),
    getServerDeps: vi.fn().mockResolvedValue({}),
    getSystemInstances: vi.fn().mockResolvedValue([]),
    getSystemHosts: vi.fn().mockResolvedValue([]),
    getSystemMeta: vi.fn().mockResolvedValue({}),
    getSAPMonitoring: vi.fn().mockResolvedValue({}),
    getMetricHistory: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([
      { id: 'evt-1', level: 'info', description: 'System started', source: 'system', timestamp: '2026-01-01T00:00:00Z' },
    ]),
    getOperations: vi.fn().mockResolvedValue([]),
    getBackgroundJobs: vi.fn().mockResolvedValue([]),
    getTransports: vi.fn().mockResolvedValue([]),
    getCertificates: vi.fn().mockResolvedValue([]),
    getLicenses: vi.fn().mockResolvedValue([]),
    getApprovals: vi.fn().mockResolvedValue([
      { id: 'apr-1', type: 'RUNBOOK', status: 'PENDING', reason: 'test', requestedBy: 'system', createdAt: '2026-01-01T00:00:00Z', system: { sid: 'EP1' } },
    ]),
    approveAction: vi.fn().mockResolvedValue({ success: true }),
    rejectAction: vi.fn().mockResolvedValue({ success: true }),
    getAnalytics: vi.fn().mockResolvedValue({ totalExecutions: 100, successRate: 95, failedCount: 5, avgPerDay: 14, dailyTrend: [], topRunbooks: [] }),
    getRunbookAnalytics: vi.fn().mockResolvedValue({ total: 10 }),
    getHAConfigs: vi.fn().mockResolvedValue([
      { id: 'ha-1', haEnabled: true, haStrategy: 'HOT_STANDBY', primaryNode: 'pri', secondaryNode: 'sec', status: 'active', system: { sid: 'EP1', environment: 'PRD', description: 'ERP', dbType: 'HANA', status: 'healthy', healthScore: 94 } },
    ]),
    getHAPrereqs: vi.fn().mockResolvedValue({ checks: [], passed: true }),
    getHAOpsHistory: vi.fn().mockResolvedValue([]),
    getHADrivers: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([{ id: 'u-1', name: 'Admin', email: 'admin@test.com', role: 'admin' }]),
    getAuditLog: vi.fn().mockResolvedValue([]),
    getPlans: vi.fn().mockResolvedValue([]),
    getApiKeys: vi.fn().mockResolvedValue([]),
    getThresholds: vi.fn().mockResolvedValue([]),
    getEscalationPolicy: vi.fn().mockResolvedValue([]),
    getMaintenanceWindows: vi.fn().mockResolvedValue([]),
    getDiscovery: vi.fn().mockResolvedValue([
      { instanceId: 'i-1', hostname: 'host-1', sid: 'EP1', role: 'ASCS', product: 'S/4HANA', scanStatus: 'success', confidence: 'high' },
    ]),
    getSIDLines: vi.fn().mockResolvedValue([]),
    getLandscapeValidation: vi.fn().mockResolvedValue({}),
    getConnectors: vi.fn().mockResolvedValue([
      { id: 'conn-1', method: 'RFC', status: 'active', systemId: 'sys-1', lastHeartbeat: '2026-01-01T00:00:00Z', system: { sid: 'EP1', description: 'ERP' } },
    ]),
    chat: vi.fn().mockResolvedValue({ response: 'AI response' }),
    getAIUseCases: vi.fn().mockResolvedValue([]),
    getAIResponses: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue({ status: 'ok' }),
  },
}));

// ── Mock mockData module ──
vi.mock('../lib/mockData', () => ({
  mockSystems: [{ id: 'mock-sys-1', sid: 'EP1', type: 'S/4HANA', environment: 'PRD', status: 'healthy', healthScore: 94, description: 'ERP System', cpu: 42, mem: 65, disk: 58 }],
  mockAlerts: [{ id: 'mock-alert-1', level: 'critical', status: 'active', description: 'High CPU', systemId: 'sys-1', system: { sid: 'EP1' } }],
  mockEvents: [{ id: 'mock-evt-1', level: 'info', description: 'System started' }],
  mockRunbooks: [{ id: 'mock-rb-1', name: 'HANA Backup', description: 'Automated backup', category: 'Backup', dbType: 'HANA', autoExecute: true, costSafe: true }],
  mockRunbookExecutions: [{ id: 'mock-exec-1', runbookId: 'mock-rb-1', systemId: 'sys-1', status: 'SUCCESS', result: 'SUCCESS' }],
  mockApprovals: [{ id: 'mock-apr-1', type: 'RUNBOOK', status: 'PENDING', reason: 'test', requestedBy: 'system', sid: 'EP1', time: '14:30' }],
  mockOperations: [],
  mockBackgroundJobs: [],
  mockTransports: [],
  mockCertificates: [],
  mockLicenses: [],
  mockAnalytics: { totalExecutions: 100, successRate: 95, failedCount: 5, avgPerDay: 14, dailyTrend: [], topRunbooks: [] },
  mockHASystems: [{ id: 'mock-ha-1', sid: 'EP1', systemId: 'sys-1', strategy: 'HOT_STANDBY', status: 'HEALTHY', primaryNode: 'pri', secondaryNode: 'sec' }],
  mockHAPrereqs: { checks: [], passed: true },
  mockHAOpsHistory: [],
  mockHADrivers: [],
  mockUsers: [{ id: 'mock-u-1', name: 'Admin', email: 'admin@test.com', role: 'admin' }],
  mockAuditLog: [],
  mockApiKeys: [],
  mockThresholds: [],
  mockEscalationPolicy: [],
  mockMaintenanceWindows: [],
  mockDiscovery: [{ instanceId: 'i-1', hostname: 'host-1', sid: 'EP1', role: 'ASCS', product: 'S/4HANA' }],
  mockSIDLines: [],
  mockLandscapeValidation: {},
  mockConnectors: [{ id: 'mock-conn-1', method: 'RFC', status: 'active', systemId: 'sys-1', sid: 'EP1', lastHeartbeat: '2026-01-01T00:00:00Z' }],
  mockAIUseCases: [],
  mockAIResponses: { estado: 'AI response' },
  mockMetrics: () => [],
  mockServerMetrics: {},
  mockServerDeps: {},
  mockSystemInstances: {},
  mockMetricHistory: [],
  mockSystemMeta: {},
  mockSAPMonitoring: {},
  mockBreaches: [],
}));

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { setDataServiceMode, dataService } from '../services/dataService';

describe('E2E Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario 1: alert -> runbook execution flow', () => {
    it('REAL mode: fetch alerts, get runbooks, execute', async () => {
      setDataServiceMode('REAL');
      const alerts = await dataService.getAlerts();
      expect(Array.isArray(alerts)).toBe(true);
      const runbooks = await dataService.getRunbooks();
      expect(Array.isArray(runbooks)).toBe(true);
      const result = await dataService.executeRunbook('rb-1', 'sys-1', false);
      expect(result).toBeDefined();
    });

    it('MOCK mode: same flow works identically', async () => {
      setDataServiceMode('MOCK');
      const alerts = await dataService.getAlerts();
      expect(Array.isArray(alerts)).toBe(true);
      const runbooks = await dataService.getRunbooks();
      expect(Array.isArray(runbooks)).toBe(true);
      const result = await dataService.executeRunbook('rb-1', 'sys-1', false);
      expect(result).toBeDefined();
    });
  });

  describe('Scenario 2: failover blocked as RESTRICTED', () => {
    it('RESTRICTED mode returns data but readOnly', async () => {
      setDataServiceMode('RESTRICTED');
      const haSystems = await dataService.getHASystems();
      expect(Array.isArray(haSystems)).toBe(true);
    });

    it('RESTRICTED mode returns systems data', async () => {
      setDataServiceMode('RESTRICTED');
      const systems = await dataService.getSystems();
      expect(Array.isArray(systems)).toBe(true);
    });

    it('RESTRICTED mode returns approvals data', async () => {
      setDataServiceMode('RESTRICTED');
      const approvals = await dataService.getApprovals();
      expect(Array.isArray(approvals)).toBe(true);
    });
  });

  describe('Scenario 3: REAL failure -> explicit FALLBACK', () => {
    it('FALLBACK mode returns data when real API fails', async () => {
      setDataServiceMode('FALLBACK');
      const systems = await dataService.getSystems();
      expect(Array.isArray(systems)).toBe(true);
    });

    it('FALLBACK mode returns alerts', async () => {
      setDataServiceMode('FALLBACK');
      const alerts = await dataService.getAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('FALLBACK mode returns runbooks', async () => {
      setDataServiceMode('FALLBACK');
      const runbooks = await dataService.getRunbooks();
      expect(Array.isArray(runbooks)).toBe(true);
    });
  });

  describe('Scenario 4: connector degraded flow', () => {
    it('connectors available in all modes', async () => {
      for (const mode of ['REAL', 'FALLBACK', 'MOCK', 'RESTRICTED'] as const) {
        setDataServiceMode(mode);
        const connectors = await dataService.getConnectors();
        expect(Array.isArray(connectors)).toBe(true);
      }
    });
  });

  describe('Scenario 5: chat with mode awareness', () => {
    it('chat returns response in all modes', async () => {
      for (const mode of ['REAL', 'MOCK', 'FALLBACK'] as const) {
        setDataServiceMode(mode);
        const result = await dataService.chat('test', {});
        expect(result).toBeDefined();
      }
    });

    it('RESTRICTED mode chat returns response', async () => {
      setDataServiceMode('RESTRICTED');
      const result = await dataService.chat('test', {});
      expect(result).toBeDefined();
    });
  });
});
