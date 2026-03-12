import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock the api module before importing dataService ──
vi.mock('../../hooks/useApi', () => ({
  api: {
    getSystems: vi.fn(),
    getSystemById: vi.fn(),
    getSystemHostMetrics: vi.fn(),
    getBreaches: vi.fn(),
    getHealthSnapshots: vi.fn(),
    getHosts: vi.fn(),
    getComponents: vi.fn(),
    getDependencies: vi.fn(),
    getSystemMeta: vi.fn(),
    getUsers: vi.fn(),
    getApprovals: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
    getOperations: vi.fn(),
    getAuditLog: vi.fn(),
    getAlerts: vi.fn(),
    getEvents: vi.fn(),
    getRunbooks: vi.fn(),
    getRunbookExecutions: vi.fn(),
    executeRunbook: vi.fn(),
    getConnectors: vi.fn(),
    getHAConfigs: vi.fn(),
    getHAPrereqs: vi.fn(),
    getHAOpsHistory: vi.fn(),
    getHADrivers: vi.fn(),
    getAnalyticsOverview: vi.fn(),
    getRunbookAnalytics: vi.fn(),
    getJobs: vi.fn(),
    getTransports: vi.fn(),
    getCertificates: vi.fn(),
    getLicenses: vi.fn(),
    getLandscapeValidation: vi.fn(),
    getAIUseCases: vi.fn(),
    getAIResponses: vi.fn(),
    chat: vi.fn(),
    getPlans: vi.fn(),
    getSettings: vi.fn(),
    getApiKeys: vi.fn(),
  },
}));

// ── Mock config so we can toggle demoMode ──
vi.mock('../../config', () => ({
  default: {
    features: { demoMode: false },
  },
}));

import { dataService } from '../dataService';
import { api } from '../../hooks/useApi';
import config from '../../config';
import {
  mockSystems,
  mockUsers,
  mockApprovals,
  mockOperations,
  mockAuditLog,
  mockAlerts,
  mockRunbooks,
  mockRunbookExecutions,
  mockEvents,
  mockDiscovery,
  mockConnectors,
  mockHASystems,
  mockHAPrereqs,
  mockHAOpsHistory,
  mockHADrivers,
  mockAnalytics,
  mockServerMetrics,
  mockServerDeps,
  mockSystemInstances,
  mockMetricHistory,
  mockSystemMeta,
  mockSIDLines,
  mockSAPMonitoring,
  mockBackgroundJobs,
  mockTransports,
  mockCertificates,
  mockLicenses,
  mockLandscapeValidation,
  mockAIUseCases,
  mockAIResponses,
  mockThresholds,
  mockEscalationPolicy,
  mockMaintenanceWindows,
  mockApiKeys,
} from '../../lib/mockData';

const mockedApi = api as Record<string, ReturnType<typeof vi.fn>>;

function setDemoMode(value: boolean) {
  (config as any).features.demoMode = value;
}

describe('dataService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDemoMode(false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ════════════════════════════════════════════════════════════
  // 1. Demo mode toggle
  // ════════════════════════════════════════════════════════════
  describe('isDemoMode / setDemoMode toggle', () => {
    it('defaults to false (API mode)', async () => {
      mockedApi.getSystems.mockResolvedValue([]);
      const result = await dataService.getSystems();
      expect(mockedApi.getSystems).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('when demoMode=true, returns mock data without calling api', async () => {
      setDemoMode(true);
      const promise = dataService.getSystems();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(mockedApi.getSystems).not.toHaveBeenCalled();
      expect(result).toBe(mockSystems);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 2. Transformation functions
  // ════════════════════════════════════════════════════════════
  describe('transformSystem', () => {
    it('synthesizes cpu, mem, disk from healthScore and seed', async () => {
      const apiSystem = {
        id: 'SYS-001',
        sid: 'EP1',
        healthScore: 94,
        status: 'healthy',
        sapProduct: 'S/4HANA',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      mockedApi.getSystems.mockResolvedValue([apiSystem]);
      const result = await dataService.getSystems();
      expect(result).toHaveLength(1);
      const sys = result[0];
      expect(sys.cpu).toBeTypeOf('number');
      expect(sys.mem).toBeTypeOf('number');
      expect(sys.disk).toBeTypeOf('number');
      expect(sys.cpu).toBeGreaterThanOrEqual(0);
      expect(sys.cpu).toBeLessThanOrEqual(95);
      expect(sys.mem).toBeLessThanOrEqual(95);
      expect(sys.disk).toBeLessThanOrEqual(90);
    });

    it('produces deterministic values for the same system id', async () => {
      const apiSystem = { id: 'SYS-X', sid: 'X01', healthScore: 80, status: 'warning' };
      mockedApi.getSystems.mockResolvedValue([apiSystem]);
      const r1 = await dataService.getSystems();
      mockedApi.getSystems.mockResolvedValue([apiSystem]);
      const r2 = await dataService.getSystems();
      expect(r1[0].cpu).toBe(r2[0].cpu);
      expect(r1[0].mem).toBe(r2[0].mem);
      expect(r1[0].disk).toBe(r2[0].disk);
      expect(r1[0].mttr).toBe(r2[0].mttr);
      expect(r1[0].mtbf).toBe(r2[0].mtbf);
    });

    it('sets type from sapProduct', async () => {
      const apiSystem = { id: 'SYS-T', sid: 'T01', healthScore: 80, status: 'healthy', sapProduct: 'BW/4HANA' };
      mockedApi.getSystems.mockResolvedValue([apiSystem]);
      const [sys] = await dataService.getSystems();
      expect(sys.type).toBe('BW/4HANA');
    });

    it('computes mttr/mtbf based on status', async () => {
      const critical = { id: 'C1', sid: 'C1', healthScore: 40, status: 'critical' };
      const healthy = { id: 'H1', sid: 'H1', healthScore: 95, status: 'healthy' };
      mockedApi.getSystems.mockResolvedValue([critical, healthy]);
      const [c, h] = await dataService.getSystems();
      // Critical has higher mttr base (40) vs healthy (20)
      expect(c.mttr).toBeGreaterThanOrEqual(40);
      expect(h.mttr).toBeGreaterThanOrEqual(20);
      expect(h.mttr).toBeLessThan(40);
      // Critical has lower mtbf base (240) vs healthy (1440)
      expect(c.mtbf).toBeLessThan(h.mtbf);
    });

    it('computes availability from healthBias and seed', async () => {
      const apiSystem = { id: 'A1', sid: 'A1', healthScore: 90, status: 'healthy' };
      mockedApi.getSystems.mockResolvedValue([apiSystem]);
      const [sys] = await dataService.getSystems();
      expect(sys.availability).toBeGreaterThanOrEqual(99);
      expect(sys.availability).toBeLessThanOrEqual(100);
    });

    it('reads breaches from _count or direct field', async () => {
      const withCount = { id: 'B1', sid: 'B1', healthScore: 80, status: 'healthy', _count: { breaches: 5 } };
      const withDirect = { id: 'B2', sid: 'B2', healthScore: 80, status: 'healthy', breaches: 3 };
      const withNeither = { id: 'B3', sid: 'B3', healthScore: 80, status: 'healthy' };
      mockedApi.getSystems.mockResolvedValue([withCount, withDirect, withNeither]);
      const [b1, b2, b3] = await dataService.getSystems();
      expect(b1.breaches).toBe(5);
      expect(b2.breaches).toBe(3);
      expect(b3.breaches).toBe(0);
    });

    it('uses lastCheckAt or updatedAt for lastCheck', async () => {
      const withLastCheck = { id: 'L1', sid: 'L1', healthScore: 80, status: 'healthy', lastCheckAt: '2026-01-15T00:00:00Z' };
      const withUpdated = { id: 'L2', sid: 'L2', healthScore: 80, status: 'healthy', updatedAt: '2026-02-15T00:00:00Z' };
      mockedApi.getSystems.mockResolvedValue([withLastCheck, withUpdated]);
      const [l1, l2] = await dataService.getSystems();
      expect(l1.lastCheck).toBe('2026-01-15T00:00:00Z');
      expect(l2.lastCheck).toBe('2026-02-15T00:00:00Z');
    });
  });

  // ════════════════════════════════════════════════════════════
  // 3. RISE_RESTRICTED — null metrics
  // ════════════════════════════════════════════════════════════
  describe('RISE_RESTRICTED systems', () => {
    it('returns null cpu/mem/disk when monitoringCapabilityProfile is RISE_RESTRICTED', async () => {
      const riseSystem = {
        id: 'RISE-1',
        sid: 'R01',
        healthScore: 85,
        status: 'healthy',
        monitoringCapabilityProfile: 'RISE_RESTRICTED',
      };
      mockedApi.getSystems.mockResolvedValue([riseSystem]);
      const [sys] = await dataService.getSystems();
      expect(sys.cpu).toBeNull();
      expect(sys.mem).toBeNull();
      expect(sys.disk).toBeNull();
      expect(sys.isRiseRestricted).toBe(true);
    });

    it('returns null cpu/mem/disk when supportsOsMetrics is false', async () => {
      const riseSystem = {
        id: 'RISE-2',
        sid: 'R02',
        healthScore: 90,
        status: 'healthy',
        supportsOsMetrics: false,
      };
      mockedApi.getSystems.mockResolvedValue([riseSystem]);
      const [sys] = await dataService.getSystems();
      expect(sys.cpu).toBeNull();
      expect(sys.mem).toBeNull();
      expect(sys.disk).toBeNull();
      expect(sys.isRiseRestricted).toBe(true);
    });

    it('returns numeric metrics when not RISE_RESTRICTED', async () => {
      const normalSystem = {
        id: 'NORMAL-1',
        sid: 'N01',
        healthScore: 85,
        status: 'healthy',
      };
      mockedApi.getSystems.mockResolvedValue([normalSystem]);
      const [sys] = await dataService.getSystems();
      expect(sys.cpu).toBeTypeOf('number');
      expect(sys.mem).toBeTypeOf('number');
      expect(sys.disk).toBeTypeOf('number');
      expect(sys.isRiseRestricted).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 4. transformAlert
  // ════════════════════════════════════════════════════════════
  describe('transformAlert (via getAlerts)', () => {
    it('extracts sid from nested system object', async () => {
      mockedApi.getAlerts.mockResolvedValue([
        { id: 1, system: { sid: 'EP1' }, createdAt: '2026-03-10T14:32:00Z', status: 'active' },
      ]);
      const [alert] = await dataService.getAlerts();
      expect(alert.sid).toBe('EP1');
      expect(alert.resolved).toBe(false);
    });

    it('falls back to direct sid when system object is missing', async () => {
      mockedApi.getAlerts.mockResolvedValue([
        { id: 2, sid: 'EQ1', status: 'resolved' },
      ]);
      const [alert] = await dataService.getAlerts();
      expect(alert.sid).toBe('EQ1');
      expect(alert.resolved).toBe(true);
    });

    it('formats time from createdAt', async () => {
      mockedApi.getAlerts.mockResolvedValue([
        { id: 3, createdAt: '2026-03-10T14:32:00Z', status: 'active' },
      ]);
      const [alert] = await dataService.getAlerts();
      expect(alert.time).toBeTruthy();
      // Time string should contain hour:minute
      expect(alert.time).toMatch(/\d{2}:\d{2}/);
    });

    it('returns empty time when createdAt is missing', async () => {
      mockedApi.getAlerts.mockResolvedValue([
        { id: 4, status: 'active' },
      ]);
      const [alert] = await dataService.getAlerts();
      expect(alert.time).toBe('');
    });
  });

  // ════════════════════════════════════════════════════════════
  // 5. transformOperation
  // ════════════════════════════════════════════════════════════
  describe('transformOperation (via getOperations)', () => {
    it('computes sched, next, last for scheduled operation', async () => {
      mockedApi.getOperations.mockResolvedValue([
        {
          id: 'OP-1',
          system: { sid: 'EP1' },
          schedule: 'Diario 22:00',
          status: 'SCHEDULED',
          scheduledTime: '2026-03-10T22:00:00Z',
          completedAt: null,
        },
      ]);
      const [op] = await dataService.getOperations();
      expect(op.sid).toBe('EP1');
      expect(op.sched).toBe('Diario 22:00');
      expect(op.next).toBe('2026-03-10T22:00:00Z');
      expect(op.last).toBeNull();
    });

    it('formats last with checkmark for completed operations', async () => {
      mockedApi.getOperations.mockResolvedValue([
        {
          id: 'OP-2',
          system: { sid: 'BP1' },
          status: 'COMPLETED',
          completedAt: '2026-03-10T03:12:00Z',
        },
      ]);
      const [op] = await dataService.getOperations();
      expect(op.last).toContain('\u2713');
      expect(op.last).toContain('2026-03-10');
    });

    it('formats last with X for failed operations', async () => {
      mockedApi.getOperations.mockResolvedValue([
        {
          id: 'OP-3',
          system: { sid: 'EQ1' },
          status: 'FAILED',
          completedAt: '2026-03-09T20:35:00Z',
          error: 'Timeout en aplicacion',
        },
      ]);
      const [op] = await dataService.getOperations();
      expect(op.last).toContain('\u2717');
      expect(op.last).toContain('Timeout en aplicacion');
    });

    it('defaults schedule to Manual when missing', async () => {
      mockedApi.getOperations.mockResolvedValue([
        { id: 'OP-4', status: 'COMPLETED', completedAt: '2026-01-01T00:00:00Z' },
      ]);
      const [op] = await dataService.getOperations();
      expect(op.sched).toBe('Manual');
    });
  });

  // ════════════════════════════════════════════════════════════
  // 6. transformRunbook
  // ════════════════════════════════════════════════════════════
  describe('transformRunbook (via getRunbooks)', () => {
    it('computes stats from executions array', async () => {
      mockedApi.getRunbooks.mockResolvedValue([
        {
          id: 'RB-1',
          name: 'Test Runbook',
          costSafe: true,
          autoExecute: true,
          executions: [
            { result: 'SUCCESS', duration: '12s' },
            { result: 'SUCCESS', duration: '10s' },
            { result: 'FAILED', duration: '5s' },
          ],
        },
      ]);
      const [rb] = await dataService.getRunbooks();
      expect(rb.totalRuns).toBe(3);
      expect(rb.successRate).toBe(67); // 2/3 = 66.67 rounded to 67
      expect(rb.avgDuration).toBe('12s');
      expect(rb.auto).toBe(true);
      expect(rb.gate).toBe('SAFE');
    });

    it('returns 0% success rate for runbook with no executions', async () => {
      mockedApi.getRunbooks.mockResolvedValue([
        { id: 'RB-2', name: 'Empty', costSafe: false, executions: [] },
      ]);
      const [rb] = await dataService.getRunbooks();
      expect(rb.totalRuns).toBe(0);
      expect(rb.successRate).toBe(0);
      expect(rb.avgDuration).toBe('—');
      expect(rb.gate).toBe('HUMAN');
    });

    it('parses JSON prereqs and steps', async () => {
      mockedApi.getRunbooks.mockResolvedValue([
        {
          id: 'RB-3',
          prereqs: '["cond1","cond2"]',
          steps: '[{"name":"step1"}]',
          executions: [],
        },
      ]);
      const [rb] = await dataService.getRunbooks();
      expect(rb.prereqs).toEqual(['cond1', 'cond2']);
      expect(rb.steps).toEqual([{ name: 'step1' }]);
    });

    it('handles malformed JSON prereqs gracefully', async () => {
      mockedApi.getRunbooks.mockResolvedValue([
        {
          id: 'RB-4',
          prereqs: 'not-json',
          steps: 'also-not-json',
          executions: [],
        },
      ]);
      const [rb] = await dataService.getRunbooks();
      expect(rb.prereqs).toBeNull();
      expect(rb.steps).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 7. transformAudit
  // ════════════════════════════════════════════════════════════
  describe('transformAudit (via getAuditLog)', () => {
    it('maps userEmail to user field', async () => {
      mockedApi.getAuditLog.mockResolvedValue([
        { id: 'A1', userEmail: 'carlos@test.com', timestamp: '2026-03-10T09:00:00Z' },
      ]);
      const [entry] = await dataService.getAuditLog();
      expect(entry.user).toBe('carlos@test.com');
    });

    it('falls back to direct user field', async () => {
      mockedApi.getAuditLog.mockResolvedValue([
        { id: 'A2', user: 'system', createdAt: '2026-03-10T08:00:00Z' },
      ]);
      const [entry] = await dataService.getAuditLog();
      expect(entry.user).toBe('system');
      expect(entry.timestamp).toBe('2026-03-10T08:00:00Z');
    });
  });

  // ════════════════════════════════════════════════════════════
  // 8. transformJob
  // ════════════════════════════════════════════════════════════
  describe('transformJob (via getBackgroundJobs)', () => {
    it('extracts error from JSON details', async () => {
      mockedApi.getJobs.mockResolvedValue([
        {
          id: 'J1',
          jobName: 'ZREP_DAILY',
          jobClass: 'A',
          system: { sid: 'EP1' },
          details: '{"error":"OOM killed"}',
          status: 'failed',
        },
      ]);
      const [job] = await dataService.getBackgroundJobs();
      expect(job.name).toBe('ZREP_DAILY');
      expect(job.class).toBe('A');
      expect(job.sid).toBe('EP1');
      expect(job.error).toBe('OOM killed');
    });

    it('handles non-JSON details gracefully', async () => {
      mockedApi.getJobs.mockResolvedValue([
        {
          id: 'J2',
          jobName: 'CLEANUP',
          details: 'not json',
          status: 'finished',
        },
      ]);
      const [job] = await dataService.getBackgroundJobs();
      expect(job.error).toBeNull();
      expect(job.currentStep).toBe(1); // finished => 1
    });

    it('computes currentStep based on status', async () => {
      mockedApi.getJobs.mockResolvedValue([
        { id: 'J3', status: 'running' },
        { id: 'J4', status: 'scheduled' },
      ]);
      const [running, scheduled] = await dataService.getBackgroundJobs();
      expect(running.currentStep).toBe(1);
      expect(scheduled.currentStep).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 9. Demo mode: mock data returned with delay
  // ════════════════════════════════════════════════════════════
  describe('demo mode — returns mock data with simulated delay', () => {
    beforeEach(() => setDemoMode(true));

    it('getSystems returns mockSystems after delay', async () => {
      const promise = dataService.getSystems();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockSystems);
    });

    it('getSystemById returns system by id from mockSystems', async () => {
      const promise = dataService.getSystemById('SAP-ERP-P01');
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBeDefined();
      expect(result.sid).toBe('EP1');
    });

    it('getSystemById returns null for unknown id', async () => {
      const promise = dataService.getSystemById('NONEXISTENT');
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBeNull();
    });

    it('getUsers returns mockUsers', async () => {
      const promise = dataService.getUsers();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockUsers);
    });

    it('getApprovals returns all mockApprovals when no status filter', async () => {
      const promise = dataService.getApprovals();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockApprovals);
    });

    it('getApprovals filters by status in demo mode', async () => {
      const promise = dataService.getApprovals('PENDING');
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result.every(a => a.status === 'PENDING')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('approveAction returns success object in demo mode', async () => {
      const promise = dataService.approveAction('APR-001');
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toEqual({ success: true });
    });

    it('rejectAction returns success object in demo mode', async () => {
      const promise = dataService.rejectAction('APR-001');
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toEqual({ success: true });
    });

    it('getOperations returns mockOperations', async () => {
      const promise = dataService.getOperations();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockOperations);
    });

    it('getAlerts returns mockAlerts', async () => {
      const promise = dataService.getAlerts();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockAlerts);
    });

    it('getEvents returns mockEvents', async () => {
      const promise = dataService.getEvents();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockEvents);
    });

    it('getRunbooks returns mockRunbooks', async () => {
      const promise = dataService.getRunbooks();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockRunbooks);
    });

    it('getRunbookExecutions returns mockRunbookExecutions', async () => {
      const promise = dataService.getRunbookExecutions();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockRunbookExecutions);
    });

    it('executeRunbook returns simulated result in demo mode', async () => {
      const promise = dataService.executeRunbook('RB-1', 'SYS-1', false);
      vi.advanceTimersByTime(2000);
      const result = await promise;
      expect(result.result).toBe('SUCCESS');
      expect(result.runbookId).toBe('RB-1');
      expect(result.systemId).toBe('SYS-1');
    });

    it('executeRunbook returns dry-run result in demo mode', async () => {
      const promise = dataService.executeRunbook('RB-1', 'SYS-1', true);
      vi.advanceTimersByTime(2000);
      const result = await promise;
      expect(result.dryRun).toBe(true);
      expect(result.runbookId).toBe('RB-1');
    });

    it('getDiscovery returns mockDiscovery', async () => {
      const promise = dataService.getDiscovery();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockDiscovery);
    });

    it('getConnectors returns mockConnectors', async () => {
      const promise = dataService.getConnectors();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockConnectors);
    });

    it('getHASystems returns mockHASystems', async () => {
      const promise = dataService.getHASystems();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockHASystems);
    });

    it('getAnalytics returns mockAnalytics', async () => {
      const promise = dataService.getAnalytics();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockAnalytics);
    });

    it('getBackgroundJobs returns mockBackgroundJobs', async () => {
      const promise = dataService.getBackgroundJobs();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockBackgroundJobs);
    });

    it('getTransports returns mockTransports', async () => {
      const promise = dataService.getTransports();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockTransports);
    });

    it('getCertificates returns mockCertificates', async () => {
      const promise = dataService.getCertificates();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockCertificates);
    });

    it('getThresholds returns mockThresholds', async () => {
      const promise = dataService.getThresholds();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockThresholds);
    });

    it('getApiKeys returns mockApiKeys', async () => {
      const promise = dataService.getApiKeys();
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockApiKeys);
    });

    it('chat returns mockAIResponses.estado in demo mode', async () => {
      const promise = dataService.chat('hello', {});
      vi.advanceTimersByTime(1000);
      const result = await promise;
      expect(result).toBe(mockAIResponses.estado);
    });

    it('getSystemBreaches filters by systemId in demo mode', async () => {
      const promise = dataService.getSystemBreaches('SAP-SOL-P01', 50);
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result.every(b => b.systemId === 'SAP-SOL-P01')).toBe(true);
    });

    it('getSystemBreaches returns all breaches when no systemId', async () => {
      const promise = dataService.getSystemBreaches(undefined, 3);
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('getServerMetrics returns mock data for known id', async () => {
      const knownId = Object.keys(mockServerMetrics)[0];
      if (!knownId) return; // skip if no mock data
      const promise = dataService.getServerMetrics(knownId);
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockServerMetrics[knownId]);
    });

    it('getServerMetrics returns null for unknown id', async () => {
      const promise = dataService.getServerMetrics('UNKNOWN-ID');
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBeNull();
    });

    it('getSystemMeta with id returns specific meta', async () => {
      const knownId = Object.keys(mockSystemMeta)[0];
      if (!knownId) return;
      const promise = dataService.getSystemMeta(knownId);
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockSystemMeta[knownId]);
    });

    it('getSystemMeta without id returns full meta map', async () => {
      const promise = dataService.getSystemMeta(undefined);
      vi.advanceTimersByTime(500);
      const result = await promise;
      expect(result).toBe(mockSystemMeta);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 10. API mode: correct API calls
  // ════════════════════════════════════════════════════════════
  describe('API mode — calls api with correct params', () => {
    it('getSystems calls api.getSystems and transforms results', async () => {
      mockedApi.getSystems.mockResolvedValue([
        { id: 'S1', sid: 'X1', healthScore: 80, status: 'healthy' },
      ]);
      const result = await dataService.getSystems();
      expect(mockedApi.getSystems).toHaveBeenCalledOnce();
      expect(result[0].id).toBe('S1');
      expect(result[0].availability).toBeDefined();
    });

    it('getSystemById calls api.getSystemById and transforms', async () => {
      mockedApi.getSystemById.mockResolvedValue({
        id: 'S1', sid: 'X1', healthScore: 80, status: 'healthy',
      });
      const result = await dataService.getSystemById('S1');
      expect(mockedApi.getSystemById).toHaveBeenCalledWith('S1');
      expect(result.mttr).toBeDefined();
    });

    it('getSystemMetrics calls api.getSystemHostMetrics with hours param', async () => {
      mockedApi.getSystemHostMetrics.mockResolvedValue([{ cpu: 50 }]);
      const result = await dataService.getSystemMetrics('SYS1', 4);
      expect(mockedApi.getSystemHostMetrics).toHaveBeenCalledWith('SYS1', 4);
      expect(result).toEqual([{ cpu: 50 }]);
    });

    it('getSystemMetrics defaults to 2 hours', async () => {
      mockedApi.getSystemHostMetrics.mockResolvedValue([]);
      await dataService.getSystemMetrics('SYS1');
      expect(mockedApi.getSystemHostMetrics).toHaveBeenCalledWith('SYS1', 2);
    });

    it('getApprovals passes status filter to api', async () => {
      mockedApi.getApprovals.mockResolvedValue([
        { id: 'A1', system: { sid: 'EP1' }, status: 'PENDING' },
      ]);
      const result = await dataService.getApprovals('PENDING');
      expect(mockedApi.getApprovals).toHaveBeenCalledWith('PENDING');
      expect(result[0].sid).toBe('EP1');
    });

    it('approveAction delegates to api.approveAction', async () => {
      mockedApi.approveAction.mockResolvedValue({ success: true });
      await dataService.approveAction('APR-001');
      expect(mockedApi.approveAction).toHaveBeenCalledWith('APR-001');
    });

    it('rejectAction delegates to api.rejectAction', async () => {
      mockedApi.rejectAction.mockResolvedValue({ success: true });
      await dataService.rejectAction('APR-002');
      expect(mockedApi.rejectAction).toHaveBeenCalledWith('APR-002');
    });

    it('getUsers transforms lastLoginAt to lastLogin and mfaEnabled to mfa', async () => {
      mockedApi.getUsers.mockResolvedValue([
        { id: 'U1', name: 'Test', lastLoginAt: '2026-03-10T00:00:00Z', mfaEnabled: true },
      ]);
      const [user] = await dataService.getUsers();
      expect(user.lastLogin).toBe('2026-03-10T00:00:00Z');
      expect(user.mfa).toBe(true);
      expect(user.avatar).toBeNull();
    });

    it('getSystemBreaches calls api.getBreaches and transforms', async () => {
      mockedApi.getBreaches.mockResolvedValue([
        { id: 'B1', system: { sid: 'EP1' }, metric: 'cpu' },
      ]);
      const result = await dataService.getSystemBreaches('SYS1');
      expect(mockedApi.getBreaches).toHaveBeenCalledWith('SYS1');
      expect(result[0].sid).toBe('EP1');
    });

    it('getSystemSla calls api.getHealthSnapshots', async () => {
      mockedApi.getHealthSnapshots.mockResolvedValue({ mttr: 20 });
      const result = await dataService.getSystemSla('SYS1');
      expect(mockedApi.getHealthSnapshots).toHaveBeenCalledWith('SYS1', 720);
      expect(result).toEqual({ mttr: 20 });
    });

    it('executeRunbook passes dryRun to api', async () => {
      mockedApi.executeRunbook.mockResolvedValue({ id: 'exec-1' });
      await dataService.executeRunbook('RB-1', 'SYS-1', true);
      expect(mockedApi.executeRunbook).toHaveBeenCalledWith('RB-1', 'SYS-1', true);
    });

    it('getDiscovery transforms systems into discovery instances', async () => {
      mockedApi.getSystems.mockResolvedValue([
        {
          sid: 'EP1',
          sapProduct: 'S/4HANA',
          environment: 'PRD',
          dbType: 'HANA',
          instances: [
            { instanceNr: '00', role: 'PAS', hostId: 'H1' },
          ],
          hosts: [
            { id: 'H1', hostname: 'sap-ep1-pas', os: 'SUSE Linux' },
          ],
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);
      const result = await dataService.getDiscovery();
      expect(result).toHaveLength(1);
      expect(result[0].instanceId).toBe('EP1_00');
      expect(result[0].hostname).toBe('sap-ep1-pas');
      expect(result[0].product).toBe('S/4HANA');
    });

    it('getDiscovery creates fallback instance when no instances array', async () => {
      mockedApi.getSystems.mockResolvedValue([
        {
          sid: 'BP1',
          sapProduct: 'BW/4HANA',
          environment: 'PRD',
          hosts: [{ id: 'H2', hostname: 'sap-bp1-pas', os: 'SUSE' }],
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);
      const result = await dataService.getDiscovery();
      expect(result).toHaveLength(1);
      expect(result[0].instanceId).toBe('BP1_00');
      expect(result[0].scanStatus).toBe('success');
    });

    it('getDiscovery marks scanStatus fail and confidence low when no hosts', async () => {
      mockedApi.getSystems.mockResolvedValue([
        { sid: 'XX1', environment: 'DEV' },
      ]);
      const result = await dataService.getDiscovery();
      expect(result[0].scanStatus).toBe('fail');
      expect(result[0].confidence).toBe('low');
    });

    it('getHASystems calls api.getHAConfigs and transforms', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        {
          id: 'HA1',
          systemId: 'SYS1',
          haEnabled: true,
          haStrategy: 'HOT_STANDBY',
          primaryNode: 'pri-host',
          secondaryNode: 'sec-host',
          system: { sid: 'EP1', environment: 'PRD', dbType: 'HANA' },
        },
      ]);
      const result = await dataService.getHASystems();
      expect(result).toHaveLength(1);
      expect(result[0].sid).toBe('EP1');
      expect(result[0].haStatus).toBe('HEALTHY');
      expect(result[0].replicationMode).toBe('SYNC');
      expect(result[0].primary).toBeDefined();
      expect(result[0].secondary).toBeDefined();
      expect(result[0].vip).toBeTruthy();
    });

    it('getConnectors transforms with nested system.sid', async () => {
      mockedApi.getConnectors.mockResolvedValue([
        { id: 'C1', system: { sid: 'EP1', description: 'ERP' } },
      ]);
      const [c] = await dataService.getConnectors();
      expect(c.sid).toBe('EP1');
      expect(c.systemName).toBe('ERP');
    });

    it('getTransports transforms with nested system.sid', async () => {
      mockedApi.getTransports.mockResolvedValue([
        { id: 'T1', system: { sid: 'EP1' }, target: 'QAS' },
      ]);
      const [t] = await dataService.getTransports();
      expect(t.sid).toBe('EP1');
      expect(t.targetSystem).toBe('QAS');
    });

    it('getCertificates transforms with nested system.sid', async () => {
      mockedApi.getCertificates.mockResolvedValue([
        { id: 'CERT1', system: { sid: 'EP1' } },
      ]);
      const [cert] = await dataService.getCertificates();
      expect(cert.sid).toBe('EP1');
    });

    it('chat delegates to api.chat', async () => {
      mockedApi.chat.mockResolvedValue({ text: 'answer' });
      const result = await dataService.chat('hello', { systemId: 'S1' });
      expect(mockedApi.chat).toHaveBeenCalledWith('hello', { systemId: 'S1' });
      expect(result).toEqual({ text: 'answer' });
    });

    it('getPlans delegates to api.getPlans', async () => {
      mockedApi.getPlans.mockResolvedValue([{ tier: 'pro' }]);
      const result = await dataService.getPlans();
      expect(result).toEqual([{ tier: 'pro' }]);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 11. Error handling — graceful fallback
  // ════════════════════════════════════════════════════════════
  describe('error handling — graceful fallback', () => {
    it('getServerMetrics returns null on API error', async () => {
      mockedApi.getHosts.mockRejectedValue(new Error('Network error'));
      mockedApi.getSystemById.mockRejectedValue(new Error('Network error'));
      const result = await dataService.getServerMetrics('SYS1');
      expect(result).toBeNull();
    });

    it('getServerDeps returns empty array on API error', async () => {
      mockedApi.getDependencies.mockRejectedValue(new Error('fail'));
      const result = await dataService.getServerDeps('SYS1');
      expect(result).toEqual([]);
    });

    it('getSystemInstances returns empty array on API error', async () => {
      mockedApi.getComponents.mockRejectedValue(new Error('fail'));
      mockedApi.getHosts.mockRejectedValue(new Error('fail'));
      mockedApi.getSystemById.mockRejectedValue(new Error('fail'));
      const result = await dataService.getSystemInstances('SYS1');
      expect(result).toEqual([]);
    });

    it('getSystemHosts returns empty array on API error', async () => {
      mockedApi.getHosts.mockRejectedValue(new Error('fail'));
      mockedApi.getSystemById.mockRejectedValue(new Error('fail'));
      const result = await dataService.getSystemHosts('SYS1');
      expect(result).toEqual([]);
    });

    it('getSystemMeta returns empty object on API error when no id', async () => {
      mockedApi.getSystemMeta.mockRejectedValue(new Error('fail'));
      const result = await dataService.getSystemMeta(undefined);
      expect(result).toEqual({});
    });

    it('getSAPMonitoring returns null on API error', async () => {
      mockedApi.getSystemById.mockRejectedValue(new Error('fail'));
      const result = await dataService.getSAPMonitoring('SYS1');
      expect(result).toBeNull();
    });

    it('getSIDLines falls back to mockSIDLines on API error', async () => {
      mockedApi.getSystems.mockRejectedValue(new Error('fail'));
      const result = await dataService.getSIDLines();
      expect(result).toBe(mockSIDLines);
    });

    it('getLandscapeValidation falls back to mock on API error', async () => {
      mockedApi.getLandscapeValidation.mockRejectedValue(new Error('fail'));
      const result = await dataService.getLandscapeValidation();
      expect(result).toBe(mockLandscapeValidation);
    });

    it('getAIUseCases falls back to mock on API error', async () => {
      mockedApi.getAIUseCases.mockRejectedValue(new Error('fail'));
      const result = await dataService.getAIUseCases();
      expect(result).toBe(mockAIUseCases);
    });

    it('getAIResponses falls back to mock on API error', async () => {
      mockedApi.getAIResponses.mockRejectedValue(new Error('fail'));
      const result = await dataService.getAIResponses();
      expect(result).toBe(mockAIResponses);
    });

    it('getHAPrereqs falls back to mock on API error', async () => {
      mockedApi.getHAPrereqs.mockRejectedValue(new Error('fail'));
      const result = await dataService.getHAPrereqs('SYS1');
      expect(result).toBe(mockHAPrereqs);
    });

    it('getHAOpsHistory falls back to mock on API error', async () => {
      mockedApi.getHAOpsHistory.mockRejectedValue(new Error('fail'));
      const result = await dataService.getHAOpsHistory('SYS1');
      expect(result).toBe(mockHAOpsHistory);
    });

    it('getHADrivers falls back to mock on API error', async () => {
      mockedApi.getHADrivers.mockRejectedValue(new Error('fail'));
      const result = await dataService.getHADrivers('SYS1');
      expect(result).toBe(mockHADrivers);
    });

    it('getLicenses falls back to mock on API error', async () => {
      mockedApi.getLicenses.mockRejectedValue(new Error('fail'));
      const result = await dataService.getLicenses();
      expect(result).toBe(mockLicenses);
    });

    it('getAnalytics falls back to mockAnalytics on API error', async () => {
      mockedApi.getAnalyticsOverview.mockRejectedValue(new Error('fail'));
      mockedApi.getRunbookAnalytics.mockRejectedValue(new Error('fail'));
      const result = await dataService.getAnalytics();
      expect(result).toBe(mockAnalytics);
    });

    it('getThresholds falls back to mockThresholds on API error', async () => {
      mockedApi.getSettings.mockRejectedValue(new Error('fail'));
      const result = await dataService.getThresholds();
      expect(result).toBe(mockThresholds);
    });

    it('getEscalationPolicy falls back to mockEscalationPolicy on API error', async () => {
      mockedApi.getSettings.mockRejectedValue(new Error('fail'));
      const result = await dataService.getEscalationPolicy();
      expect(result).toBe(mockEscalationPolicy);
    });

    it('getMaintenanceWindows falls back to mockMaintenanceWindows on API error', async () => {
      mockedApi.getSettings.mockRejectedValue(new Error('fail'));
      const result = await dataService.getMaintenanceWindows();
      expect(result).toBe(mockMaintenanceWindows);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 12. Synthetic metrics generation
  // ════════════════════════════════════════════════════════════
  describe('synthetic metrics — deterministic hash seeding', () => {
    it('getMetricHistory generates 72 deterministic points in API mode', async () => {
      const result = await dataService.getMetricHistory('sap-ep1-pas');
      expect(result).toHaveLength(72);
      // Verify deterministic — calling again yields same results
      const result2 = await dataService.getMetricHistory('sap-ep1-pas');
      expect(result).toEqual(result2);
      // Verify bounds
      for (const p of result) {
        expect(p.cpu).toBeLessThanOrEqual(95);
        expect(p.mem).toBeLessThanOrEqual(95);
        expect(p.disk).toBeLessThanOrEqual(90);
        expect(p.cpu).toBeGreaterThanOrEqual(0);
      }
    });

    it('different hostnames produce different metric series', async () => {
      const r1 = await dataService.getMetricHistory('host-a');
      const r2 = await dataService.getMetricHistory('host-b');
      // At least some points should differ
      const hasDiff = r1.some((p, i) => p.cpu !== r2[i].cpu);
      expect(hasDiff).toBe(true);
    });

    it('getServerMetrics synthesizes DB-specific fields for HANA', async () => {
      mockedApi.getHosts.mockResolvedValue([
        { id: 'H1', hostname: 'sap-ep1-hana', status: 'active' },
      ]);
      mockedApi.getSystemById.mockResolvedValue({
        id: 'SYS1',
        dbType: 'SAP HANA 2.0',
        status: 'healthy',
      });
      const result = await dataService.getServerMetrics('SYS1');
      expect(result).not.toBeNull();
      expect(result.dbInfo.type).toBe('HANA');
      expect(result.dbInfo.version).toBe('SAP HANA 2.0');
      expect(result.dbInfo.state).toBe('ONLINE');
      expect(result.dbInfo.cpuDb).toBeTypeOf('number');
      expect(result.dbInfo.ramPct).toBeTypeOf('number');
      expect(result.dbInfo.diskData).toBeTypeOf('number');
    });

    it('getServerMetrics synthesizes DB-specific fields for Oracle', async () => {
      mockedApi.getHosts.mockResolvedValue([
        { id: 'H2', hostname: 'sap-cr1', status: 'active' },
      ]);
      mockedApi.getSystemById.mockResolvedValue({
        id: 'SYS2',
        dbType: 'Oracle 19c',
      });
      const result = await dataService.getServerMetrics('SYS2');
      expect(result.dbInfo.type).toBe('Oracle');
      expect(result.dbInfo.tablespacePct).toBeTypeOf('number');
      expect(result.dbInfo.blockedSessions).toBeTypeOf('number');
    });

    it('getServerMetrics synthesizes DB-specific fields for ASE', async () => {
      mockedApi.getHosts.mockResolvedValue([{ id: 'H3', hostname: 'h', status: 'active' }]);
      mockedApi.getSystemById.mockResolvedValue({ id: 'SYS3', dbType: 'SAP ASE 16.0' });
      const result = await dataService.getServerMetrics('SYS3');
      expect(result.dbInfo.type).toBe('ASE');
      expect(result.dbInfo.cacheHitPct).toBeTypeOf('number');
      expect(result.dbInfo.txLogPct).toBeTypeOf('number');
    });

    it('getServerMetrics synthesizes DB-specific fields for MSSQL', async () => {
      mockedApi.getHosts.mockResolvedValue([{ id: 'H4', hostname: 'h', status: 'active' }]);
      mockedApi.getSystemById.mockResolvedValue({ id: 'SYS4', dbType: 'MSSQL 2019' });
      const result = await dataService.getServerMetrics('SYS4');
      expect(result.dbInfo.type).toBe('MSSQL');
      expect(result.dbInfo.logPct).toBeTypeOf('number');
      expect(result.dbInfo.dataPct).toBeTypeOf('number');
    });

    it('getServerMetrics synthesizes DB-specific fields for DB2', async () => {
      mockedApi.getHosts.mockResolvedValue([{ id: 'H5', hostname: 'h', status: 'active' }]);
      mockedApi.getSystemById.mockResolvedValue({ id: 'SYS5', dbType: 'DB2 11.5' });
      const result = await dataService.getServerMetrics('SYS5');
      expect(result.dbInfo.type).toBe('DB2');
      expect(result.dbInfo.tablespacePct).toBeTypeOf('number');
      expect(result.dbInfo.logPct).toBeTypeOf('number');
    });

    it('getServerMetrics synthesizes DB-specific fields for MaxDB', async () => {
      mockedApi.getHosts.mockResolvedValue([{ id: 'H6', hostname: 'h', status: 'active' }]);
      mockedApi.getSystemById.mockResolvedValue({ id: 'SYS6', dbType: 'MaxDB 7.9' });
      const result = await dataService.getServerMetrics('SYS6');
      expect(result.dbInfo.type).toBe('MaxDB');
      expect(result.dbInfo.dataVolPct).toBeTypeOf('number');
      expect(result.dbInfo.logVolPct).toBeTypeOf('number');
      expect(result.dbInfo.cacheHitPct).toBeTypeOf('number');
    });

    it('getServerMetrics returns null when hosts is empty', async () => {
      mockedApi.getHosts.mockResolvedValue([]);
      mockedApi.getSystemById.mockResolvedValue({ id: 'SYS7' });
      const result = await dataService.getServerMetrics('SYS7');
      expect(result).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════
  // 13. getSystemInstances — RISE_RESTRICTED in API mode
  // ════════════════════════════════════════════════════════════
  describe('getSystemInstances (API mode)', () => {
    it('returns flattened instances with synthesized metrics', async () => {
      mockedApi.getComponents.mockResolvedValue([
        {
          name: 'ASCS',
          type: 'ASCS',
          version: '777',
          instances: [
            { instanceNr: '01', type: 'ASCS', role: 'Central Services', hostId: 'H1', status: 'active' },
          ],
        },
      ]);
      mockedApi.getHosts.mockResolvedValue([
        { id: 'H1', hostname: 'sap-ep1-ascs', ip: '10.0.1.1', os: 'SUSE', osVersion: '15', status: 'active' },
      ]);
      mockedApi.getSystemById.mockResolvedValue({ id: 'SYS1', supportsOsMetrics: true });
      const result = await dataService.getSystemInstances('SYS1');
      expect(result).toHaveLength(1);
      expect(result[0].nr).toBe('01');
      expect(result[0].role).toBe('ASCS');
      expect(result[0].hostname).toBe('sap-ep1-ascs');
      expect(result[0].cpu).toBeTypeOf('number');
      expect(result[0].status).toBe('running');
    });

    it('returns null metrics for RISE_RESTRICTED instances', async () => {
      mockedApi.getComponents.mockResolvedValue([
        { instances: [{ instanceNr: '00', hostId: 'H1', status: 'active' }] },
      ]);
      mockedApi.getHosts.mockResolvedValue([{ id: 'H1', hostname: 'h' }]);
      mockedApi.getSystemById.mockResolvedValue({
        id: 'SYS-R',
        monitoringCapabilityProfile: 'RISE_RESTRICTED',
      });
      const result = await dataService.getSystemInstances('SYS-R');
      expect(result).toHaveLength(1);
      expect(result[0].cpu).toBeNull();
      expect(result[0].mem).toBeNull();
      expect(result[0].disk).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════
  // 14. getSystemHosts — RISE_RESTRICTED in API mode
  // ════════════════════════════════════════════════════════════
  describe('getSystemHosts (API mode)', () => {
    it('returns hosts with synthesized metrics', async () => {
      mockedApi.getHosts.mockResolvedValue([
        { id: 'H1', hostname: 'sap-ep1', os: 'SUSE', osVersion: '15 SP5', status: 'active', instances: [] },
      ]);
      mockedApi.getSystemById.mockResolvedValue({ id: 'SYS1', supportsOsMetrics: true });
      const result = await dataService.getSystemHosts('SYS1');
      expect(result).toHaveLength(1);
      expect(result[0].cpu).toBeTypeOf('number');
      expect(result[0].os).toBe('SUSE 15 SP5');
    });

    it('returns null metrics for RISE_RESTRICTED system hosts', async () => {
      mockedApi.getHosts.mockResolvedValue([
        { id: 'H2', hostname: 'h', instances: [] },
      ]);
      mockedApi.getSystemById.mockResolvedValue({
        id: 'SYS-R',
        monitoringCapabilityProfile: 'RISE_RESTRICTED',
      });
      const result = await dataService.getSystemHosts('SYS-R');
      expect(result[0].cpu).toBeNull();
      expect(result[0].mem).toBeNull();
      expect(result[0].disk).toBeNull();
      expect(result[0].availability).toBeNull();
    });

    it('transforms nested instances in host objects', async () => {
      mockedApi.getHosts.mockResolvedValue([
        {
          id: 'H3',
          hostname: 'host3',
          instances: [
            { instanceNr: '00', type: 'PAS', role: 'Dialog', status: 'active' },
            { instanceNr: '01', type: 'ASCS', status: 'warning' },
          ],
        },
      ]);
      mockedApi.getSystemById.mockResolvedValue({ id: 'SYS3' });
      const [host] = await dataService.getSystemHosts('SYS3');
      expect(host.instances).toHaveLength(2);
      expect(host.instances[0].nr).toBe('00');
      expect(host.instances[0].role).toBe('PAS');
      expect(host.instances[0].status).toBe('running');
      expect(host.instances[1].status).toBe('running'); // warning -> running
    });
  });

  // ════════════════════════════════════════════════════════════
  // 15. getSAPMonitoring — synthetic SAP monitoring data
  // ════════════════════════════════════════════════════════════
  describe('getSAPMonitoring (API mode)', () => {
    it('returns ABAP stack monitoring for non-Java system', async () => {
      mockedApi.getSystemById.mockResolvedValue({
        id: 'SYS-ABAP',
        sapStackType: 'ABAP',
      });
      const result = await dataService.getSAPMonitoring('SYS-ABAP');
      expect(result).not.toBeNull();
      expect(result.sm12).toBeDefined();
      expect(result.sm12.totalLocks).toBeTypeOf('number');
      expect(result.sm13).toBeDefined();
      expect(result.sm37).toBeDefined();
      expect(result.sm21).toBeDefined();
    });

    it('returns Java stack monitoring for Java system', async () => {
      mockedApi.getSystemById.mockResolvedValue({
        id: 'SYS-JAVA',
        sapStackType: 'JAVA',
      });
      const result = await dataService.getSAPMonitoring('SYS-JAVA');
      expect(result).not.toBeNull();
      expect(result.javaStack).toBe(true);
      expect(result.messageMonitor).toBeDefined();
      expect(result.channelMonitor).toBeDefined();
      expect(result.alertInbox).toBeDefined();
      expect(result.cacheStats).toBeDefined();
    });

    it('returns Java stack monitoring for DUAL_STACK system', async () => {
      mockedApi.getSystemById.mockResolvedValue({
        id: 'SYS-DUAL',
        sapStackType: 'DUAL_STACK',
      });
      const result = await dataService.getSAPMonitoring('SYS-DUAL');
      expect(result.javaStack).toBe(true);
    });

    it('returns null when system is not found', async () => {
      mockedApi.getSystemById.mockResolvedValue(null);
      const result = await dataService.getSAPMonitoring('NONEXIST');
      expect(result).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════
  // 16. transformHAConfig
  // ════════════════════════════════════════════════════════════
  describe('transformHAConfig (via getHASystems)', () => {
    it('sets haStatus NOT_CONFIGURED when haEnabled=false', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        { id: 'HA1', systemId: 'S1', haEnabled: false, haStrategy: 'HOT_STANDBY', system: { sid: 'X1' } },
      ]);
      const [ha] = await dataService.getHASystems();
      expect(ha.haStatus).toBe('NOT_CONFIGURED');
    });

    it('sets haStatus FAILOVER_IN_PROGRESS when status matches', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        { id: 'HA2', systemId: 'S2', haEnabled: true, haStrategy: 'HOT_STANDBY', status: 'failover_in_progress', system: { sid: 'X2' } },
      ]);
      const [ha] = await dataService.getHASystems();
      expect(ha.haStatus).toBe('FAILOVER_IN_PROGRESS');
    });

    it('sets haStatus DEGRADED for critical system', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        { id: 'HA3', systemId: 'S3', haEnabled: true, haStrategy: 'WARM_STANDBY', system: { sid: 'X3', status: 'critical' } },
      ]);
      const [ha] = await dataService.getHASystems();
      expect(ha.haStatus).toBe('DEGRADED');
    });

    it('sets haStatus STANDBY for PILOT_LIGHT', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        { id: 'HA4', systemId: 'S4', haEnabled: true, haStrategy: 'PILOT_LIGHT', system: { sid: 'X4' } },
      ]);
      const [ha] = await dataService.getHASystems();
      expect(ha.haStatus).toBe('STANDBY');
    });

    it('builds secondary with stopped state for PILOT_LIGHT', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        {
          id: 'HA5', systemId: 'S5', haEnabled: true, haStrategy: 'PILOT_LIGHT',
          primaryNode: 'pri', secondaryNode: 'sec',
          system: { sid: 'X5', environment: 'PRD' },
        },
      ]);
      const [ha] = await dataService.getHASystems();
      expect(ha.secondary).not.toBeNull();
      expect(ha.secondary.state).toBe('stopped');
    });

    it('builds warm standby details with scale-up info', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        {
          id: 'HA6', systemId: 'S6', haEnabled: true, haStrategy: 'WARM_STANDBY',
          primaryNode: 'pri', secondaryNode: 'sec',
          system: { sid: 'X6', environment: 'QAS' },
        },
      ]);
      const [ha] = await dataService.getHASystems();
      expect(ha.warmStandbyDetails).toBeDefined();
      expect(ha.warmStandbyDetails.costSavingsPercent).toBe(75);
      expect(ha.warmStandbyDetails.scaleUpRequired).toBe(true);
      expect(ha.primary.instanceType).toBe('r6i.8xlarge');
      expect(ha.secondary.instanceType).toBe('r6i.2xlarge');
    });

    it('sets dnsEndpoint for CROSS_REGION_DR', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        {
          id: 'HA7', systemId: 'S7', haEnabled: true, haStrategy: 'CROSS_REGION_DR',
          primaryNode: 'pri', secondaryNode: null,
          system: { sid: 'DR1', environment: 'PRD' },
        },
      ]);
      const [ha] = await dataService.getHASystems();
      expect(ha.dnsEndpoint).toContain('dr1');
      expect(ha.networkStrategy).toBe('ROUTE53');
    });

    it('sets null replication for strategies without it', async () => {
      mockedApi.getHAConfigs.mockResolvedValue([
        { id: 'HA8', systemId: 'S8', haEnabled: true, haStrategy: 'BACKUP_RESTORE', system: { sid: 'BR1' } },
      ]);
      const [ha] = await dataService.getHASystems();
      expect(ha.replicationMode).toBeNull();
      expect(ha.replicationStatus).toBeNull();
      expect(ha.replicationLag).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════
  // 17. transformAnalytics (via getAnalytics)
  // ════════════════════════════════════════════════════════════
  describe('getAnalytics (API mode)', () => {
    it('combines overview and runbook analytics', async () => {
      mockedApi.getAnalyticsOverview.mockResolvedValue({
        alertsByLevel: { critical: 5, warning: 10 },
        operationsByStatus: { COMPLETED: 8, SCHEDULED: 3 },
      });
      mockedApi.getRunbookAnalytics.mockResolvedValue({
        totalExecutions: 100,
        byResult: { SUCCESS: 90, FAILED: 10 },
        byRunbook: {
          'RB-1': { total: 60, success: 55 },
          'RB-2': { total: 40, success: 38 },
        },
      });
      const result = await dataService.getAnalytics();
      expect(result.totalExecutions).toBe(100);
      expect(result.successRate).toBe(90);
      expect(result.failedCount).toBe(10);
      expect(result.topRunbooks).toHaveLength(2);
      expect(result.dailyTrend).toHaveLength(14);
      expect(result.alertStats.total).toBe(15);
      expect(result.alertStats.critical).toBe(5);
      expect(result.slaMetrics.pendingApproval).toBe(3);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 18. Settings endpoints
  // ════════════════════════════════════════════════════════════
  describe('settings endpoints (API mode)', () => {
    it('getThresholds extracts from settings response', async () => {
      const thresholds = [{ metric: 'cpu', value: 90 }];
      mockedApi.getSettings.mockResolvedValue({
        settings: { thresholds },
      });
      const result = await dataService.getThresholds();
      expect(result).toBe(thresholds);
    });

    it('getThresholds falls back to mockThresholds when settings missing', async () => {
      mockedApi.getSettings.mockResolvedValue({});
      const result = await dataService.getThresholds();
      expect(result).toBe(mockThresholds);
    });

    it('getEscalationPolicy extracts from settings response', async () => {
      const escalation = [{ level: 'L1', target: 'ops' }];
      mockedApi.getSettings.mockResolvedValue({
        settings: { escalation },
      });
      const result = await dataService.getEscalationPolicy();
      expect(result).toBe(escalation);
    });

    it('getMaintenanceWindows extracts from settings response', async () => {
      const windows = [{ day: 'Sunday', start: '02:00' }];
      mockedApi.getSettings.mockResolvedValue({
        settings: { maintenanceWindows: windows },
      });
      const result = await dataService.getMaintenanceWindows();
      expect(result).toBe(windows);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 19. Edge cases
  // ════════════════════════════════════════════════════════════
  describe('edge cases', () => {
    it('getServerDeps transforms api response with detail formatting', async () => {
      mockedApi.getDependencies.mockResolvedValue([
        { name: 'DB', status: 'ok', latencyMs: 5 },
        { name: 'RFC', status: 'ok', details: 'All good' },
        { name: 'EXT', status: 'ok', details: { info: 'test' } },
      ]);
      const result = await dataService.getServerDeps('SYS1');
      expect(result).toHaveLength(3);
      expect(result[0].detail).toBe('Latency: 5ms');
      expect(result[1].detail).toBe('All good');
      expect(result[2].detail).toBe('{"info":"test"}');
    });

    it('getServerDeps returns empty array when api returns null', async () => {
      mockedApi.getDependencies.mockResolvedValue(null);
      const result = await dataService.getServerDeps('SYS1');
      expect(result).toEqual([]);
    });

    it('getSIDLines groups systems by product family', async () => {
      mockedApi.getSystems.mockResolvedValue([
        { id: 'S1', sid: 'E1', sapProduct: 'S/4HANA 2023' },
        { id: 'S2', sid: 'E2', sapProduct: 'S/4HANA 2023' },
        { id: 'S3', sid: 'B1', sapProduct: 'BW/4HANA 2.0' },
        { id: 'S4', sid: 'P1', sapProduct: 'PI/PO 7.5' },
      ]);
      const result = await dataService.getSIDLines();
      const erpLine = result.find(l => l.line === 'ERP');
      expect(erpLine).toBeDefined();
      expect(erpLine.systems).toEqual(['S1', 'S2']);
      const bwLine = result.find(l => l.line === 'BW');
      expect(bwLine).toBeDefined();
      expect(bwLine.systems).toEqual(['S3']);
    });

    it('getSystemMeta with id delegates directly to api', async () => {
      const meta = { kernelVersion: '777.36' };
      mockedApi.getSystemMeta.mockResolvedValue(meta);
      const result = await dataService.getSystemMeta('SYS1');
      expect(mockedApi.getSystemMeta).toHaveBeenCalledWith('SYS1');
      expect(result).toBe(meta);
    });

    it('getSystemMeta without id builds map from array', async () => {
      mockedApi.getSystemMeta.mockResolvedValue([
        { systemId: 'S1', kernelVersion: '777' },
        { systemId: 'S2', kernelVersion: '753' },
      ]);
      const result = await dataService.getSystemMeta(undefined);
      expect(result).toEqual({
        S1: { systemId: 'S1', kernelVersion: '777' },
        S2: { systemId: 'S2', kernelVersion: '753' },
      });
    });

    it('transformRunbookExecution formats ts from startedAt', async () => {
      mockedApi.getRunbookExecutions.mockResolvedValue([
        { id: 'EX1', system: { sid: 'EP1' }, startedAt: '2026-03-10T14:33:00Z' },
      ]);
      const [exec] = await dataService.getRunbookExecutions();
      expect(exec.sid).toBe('EP1');
      expect(exec.ts).toMatch(/\d{1,2}\/\d{1,2}/); // date part (locale-dependent)
    });

    it('transformRunbookExecution returns empty ts/sid for missing data', async () => {
      mockedApi.getRunbookExecutions.mockResolvedValue([
        { id: 'EX2' },
      ]);
      const [exec] = await dataService.getRunbookExecutions();
      expect(exec.sid).toBe('');
      expect(exec.ts).toBe('');
    });

    it('transformEvent extracts sid from system object', async () => {
      mockedApi.getEvents.mockResolvedValue([
        { id: 'E1', system: { sid: 'EP1' } },
      ]);
      const [event] = await dataService.getEvents();
      expect(event.sid).toBe('EP1');
    });

    it('transformEvent falls back to direct sid', async () => {
      mockedApi.getEvents.mockResolvedValue([
        { id: 'E2', sid: 'EQ1' },
      ]);
      const [event] = await dataService.getEvents();
      expect(event.sid).toBe('EQ1');
    });

    it('handles empty array responses from API gracefully', async () => {
      mockedApi.getSystems.mockResolvedValue([]);
      const systems = await dataService.getSystems();
      expect(systems).toEqual([]);

      mockedApi.getAlerts.mockResolvedValue([]);
      const alerts = await dataService.getAlerts();
      expect(alerts).toEqual([]);

      mockedApi.getRunbooks.mockResolvedValue([]);
      const runbooks = await dataService.getRunbooks();
      expect(runbooks).toEqual([]);
    });
  });
});
