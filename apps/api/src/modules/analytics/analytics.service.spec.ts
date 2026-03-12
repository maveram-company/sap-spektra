import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      system: {
        count: jest.fn(),
      },
      alert: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
      operationRecord: {
        groupBy: jest.fn(),
      },
      breach: {
        findMany: jest.fn(),
      },
      healthSnapshot: {
        findMany: jest.fn(),
      },
      runbookExecution: {
        groupBy: jest.fn(),
      },
      runbook: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  // ── getOverview ──

  describe('getOverview', () => {
    it('returns aggregated overview data for organization', async () => {
      prisma.system.count.mockResolvedValue(12);
      prisma.alert.groupBy.mockResolvedValue([
        { level: 'critical', _count: 3 },
        { level: 'warning', _count: 7 },
      ]);
      prisma.operationRecord.groupBy.mockResolvedValue([
        { status: 'success', _count: 20 },
        { status: 'failed', _count: 2 },
      ]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.healthSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getOverview(ORG_ID);

      expect(result.systemCount).toBe(12);
      expect(result.alertsByLevel).toEqual({ critical: 3, warning: 7 });
      expect(result.operationsByStatus).toEqual({ success: 20, failed: 2 });
      expect(result.recentBreaches).toEqual([]);
      expect(result.healthTrend).toEqual([]);
    });

    it('enforces tenant isolation on system count', async () => {
      prisma.system.count.mockResolvedValue(0);
      prisma.alert.groupBy.mockResolvedValue([]);
      prisma.operationRecord.groupBy.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.healthSnapshot.findMany.mockResolvedValue([]);

      await service.getOverview('org-other');

      expect(prisma.system.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-other' },
      });
    });

    it('enforces tenant isolation on alert groupBy', async () => {
      prisma.system.count.mockResolvedValue(0);
      prisma.alert.groupBy.mockResolvedValue([]);
      prisma.operationRecord.groupBy.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.healthSnapshot.findMany.mockResolvedValue([]);

      await service.getOverview(ORG_ID);

      expect(prisma.alert.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID }),
        }),
      );
    });

    it('returns empty maps when no alerts or operations exist', async () => {
      prisma.system.count.mockResolvedValue(0);
      prisma.alert.groupBy.mockResolvedValue([]);
      prisma.operationRecord.groupBy.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.healthSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getOverview(ORG_ID);

      expect(result.systemCount).toBe(0);
      expect(result.alertsByLevel).toEqual({});
      expect(result.operationsByStatus).toEqual({});
    });

    it('includes recent unresolved breaches', async () => {
      const breaches = [
        {
          id: 'b-1',
          systemId: 'sys-1',
          resolved: false,
          timestamp: new Date(),
          system: { sid: 'PRD' },
        },
      ];
      prisma.system.count.mockResolvedValue(1);
      prisma.alert.groupBy.mockResolvedValue([]);
      prisma.operationRecord.groupBy.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue(breaches);
      prisma.healthSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getOverview(ORG_ID);

      expect(result.recentBreaches).toHaveLength(1);
      expect(result.recentBreaches[0].id).toBe('b-1');
    });

    it('queries breaches through system relation for tenant isolation', async () => {
      prisma.system.count.mockResolvedValue(0);
      prisma.alert.groupBy.mockResolvedValue([]);
      prisma.operationRecord.groupBy.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.healthSnapshot.findMany.mockResolvedValue([]);

      await service.getOverview(ORG_ID);

      expect(prisma.breach.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            system: { organizationId: ORG_ID },
            resolved: false,
          }),
        }),
      );
    });

    it('includes health trend snapshots', async () => {
      const snapshots = [
        {
          id: 'hs-1',
          systemId: 'sys-1',
          timestamp: new Date(),
          system: { sid: 'PRD' },
          score: 85,
        },
      ];
      prisma.system.count.mockResolvedValue(1);
      prisma.alert.groupBy.mockResolvedValue([]);
      prisma.operationRecord.groupBy.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.healthSnapshot.findMany.mockResolvedValue(snapshots);

      const result = await service.getOverview(ORG_ID);

      expect(result.healthTrend).toHaveLength(1);
      expect(result.healthTrend[0].system.sid).toBe('PRD');
    });
  });

  // ── getRunbookAnalytics ──

  describe('getRunbookAnalytics', () => {
    it('returns aggregated runbook execution analytics', async () => {
      prisma.runbookExecution.groupBy
        .mockResolvedValueOnce([
          { result: 'SUCCESS', _count: 10 },
          { result: 'FAILED', _count: 3 },
        ])
        .mockResolvedValueOnce([
          { runbookId: 'rb-1', result: 'SUCCESS', _count: 8 },
          { runbookId: 'rb-1', result: 'FAILED', _count: 2 },
          { runbookId: 'rb-2', result: 'SUCCESS', _count: 2 },
          { runbookId: 'rb-2', result: 'FAILED', _count: 1 },
        ]);
      prisma.runbook.findMany.mockResolvedValue([
        { id: 'rb-1', name: 'Restart Service' },
        { id: 'rb-2', name: 'Clear Cache' },
      ]);

      const result = await service.getRunbookAnalytics(ORG_ID);

      expect(result.totalExecutions).toBe(13);
      expect(result.byResult).toEqual({
        SUCCESS: 10,
        FAILED: 3,
        PENDING: 0,
        RUNNING: 0,
      });
      expect(result.byRunbook['Restart Service']).toEqual({
        total: 10,
        success: 8,
        failed: 2,
      });
      expect(result.byRunbook['Clear Cache']).toEqual({
        total: 3,
        success: 2,
        failed: 1,
      });
    });

    it('enforces tenant isolation via runbook relation', async () => {
      prisma.runbookExecution.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getRunbookAnalytics(ORG_ID);

      expect(prisma.runbookExecution.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { runbook: { organizationId: ORG_ID } },
        }),
      );
    });

    it('returns zeroed stats when no executions exist', async () => {
      prisma.runbookExecution.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getRunbookAnalytics(ORG_ID);

      expect(result.totalExecutions).toBe(0);
      expect(result.byResult).toEqual({
        SUCCESS: 0,
        FAILED: 0,
        PENDING: 0,
        RUNNING: 0,
      });
      expect(result.byRunbook).toEqual({});
    });

    it('does not query runbook names when no executions exist', async () => {
      prisma.runbookExecution.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getRunbookAnalytics(ORG_ID);

      expect(prisma.runbook.findMany).not.toHaveBeenCalled();
    });

    it('uses runbookId as fallback name when runbook lookup missing', async () => {
      prisma.runbookExecution.groupBy
        .mockResolvedValueOnce([{ result: 'SUCCESS', _count: 5 }])
        .mockResolvedValueOnce([
          { runbookId: 'rb-orphan', result: 'SUCCESS', _count: 5 },
        ]);
      prisma.runbook.findMany.mockResolvedValue([]);

      const result = await service.getRunbookAnalytics(ORG_ID);

      expect(result.byRunbook['rb-orphan']).toEqual({
        total: 5,
        success: 5,
        failed: 0,
      });
    });

    it('handles all four result statuses correctly', async () => {
      prisma.runbookExecution.groupBy
        .mockResolvedValueOnce([
          { result: 'SUCCESS', _count: 10 },
          { result: 'FAILED', _count: 5 },
          { result: 'PENDING', _count: 3 },
          { result: 'RUNNING', _count: 2 },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getRunbookAnalytics(ORG_ID);

      expect(result.totalExecutions).toBe(20);
      expect(result.byResult).toEqual({
        SUCCESS: 10,
        FAILED: 5,
        PENDING: 3,
        RUNNING: 2,
      });
    });
  });

  // ── getSystemTrends ──

  describe('getSystemTrends', () => {
    const SYSTEM_ID = 'sys-1';

    it('returns snapshots, breaches, and alerts for a system', async () => {
      prisma.healthSnapshot.findMany.mockResolvedValue([
        { id: 'hs-1', score: 90 },
      ]);
      prisma.breach.findMany.mockResolvedValue([{ id: 'b-1' }]);
      prisma.alert.findMany.mockResolvedValue([{ id: 'a-1' }]);

      const result = await service.getSystemTrends(ORG_ID, SYSTEM_ID);

      expect(result.snapshots).toHaveLength(1);
      expect(result.breaches).toHaveLength(1);
      expect(result.alerts).toHaveLength(1);
    });

    it('enforces tenant isolation on all three queries', async () => {
      prisma.healthSnapshot.findMany.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.getSystemTrends(ORG_ID, SYSTEM_ID);

      expect(prisma.healthSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            system: { organizationId: ORG_ID },
          }),
        }),
      );
      expect(prisma.breach.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            system: { organizationId: ORG_ID },
          }),
        }),
      );
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID }),
        }),
      );
    });

    it('uses default 7-day window', async () => {
      prisma.healthSnapshot.findMany.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      const before = Date.now();
      await service.getSystemTrends(ORG_ID, SYSTEM_ID);

      const call = prisma.healthSnapshot.findMany.mock.calls[0][0];
      const since = call.where.timestamp.gte;
      const expectedSince = before - 7 * 86400000;

      // Allow 1 second tolerance for execution time
      expect(since.getTime()).toBeGreaterThanOrEqual(expectedSince - 1000);
      expect(since.getTime()).toBeLessThanOrEqual(expectedSince + 1000);
    });

    it('accepts custom days parameter', async () => {
      prisma.healthSnapshot.findMany.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      const before = Date.now();
      await service.getSystemTrends(ORG_ID, SYSTEM_ID, 30);

      const call = prisma.healthSnapshot.findMany.mock.calls[0][0];
      const since = call.where.timestamp.gte;
      const expectedSince = before - 30 * 86400000;

      expect(since.getTime()).toBeGreaterThanOrEqual(expectedSince - 1000);
      expect(since.getTime()).toBeLessThanOrEqual(expectedSince + 1000);
    });

    it('filters by systemId', async () => {
      prisma.healthSnapshot.findMany.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.getSystemTrends(ORG_ID, 'sys-42');

      expect(prisma.healthSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ systemId: 'sys-42' }),
        }),
      );
      expect(prisma.breach.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ systemId: 'sys-42' }),
        }),
      );
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ systemId: 'sys-42' }),
        }),
      );
    });

    it('returns empty arrays when no data exists', async () => {
      prisma.healthSnapshot.findMany.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      const result = await service.getSystemTrends(ORG_ID, SYSTEM_ID);

      expect(result).toEqual({
        snapshots: [],
        breaches: [],
        alerts: [],
      });
    });

    it('orders snapshots and breaches by timestamp asc, alerts by createdAt asc', async () => {
      prisma.healthSnapshot.findMany.mockResolvedValue([]);
      prisma.breach.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.getSystemTrends(ORG_ID, SYSTEM_ID);

      expect(prisma.healthSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { timestamp: 'asc' } }),
      );
      expect(prisma.breach.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { timestamp: 'asc' } }),
      );
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
      );
    });
  });
});
