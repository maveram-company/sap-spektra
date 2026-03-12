import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockSystem(overrides = {}) {
  return {
    id: 'sys-1',
    sid: 'EP1',
    status: 'healthy',
    healthScore: 92,
    environment: 'PRD',
    sapProduct: 'SAP ERP',
    ...overrides,
  };
}

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      system: { findMany: jest.fn() },
      alert: { count: jest.fn() },
      approvalRequest: { count: jest.fn() },
      event: { findMany: jest.fn() },
      connector: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  // ── getSummary ──

  describe('getSummary', () => {
    it('returns the correct summary structure', async () => {
      prisma.system.findMany.mockResolvedValue([mockSystem()]);
      prisma.alert.count.mockResolvedValue(0);
      prisma.approvalRequest.count.mockResolvedValue(0);
      prisma.event.findMany.mockResolvedValue([]);
      prisma.connector.findMany.mockResolvedValue([]);

      const result = await service.getSummary(ORG_ID);

      expect(result).toHaveProperty('systems');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('approvals');
      expect(result).toHaveProperty('connectors');
      expect(result).toHaveProperty('recentEvents');
    });

    it('computes status counts correctly', async () => {
      const systems = [
        mockSystem({ id: '1', status: 'healthy', healthScore: 95 }),
        mockSystem({ id: '2', status: 'healthy', healthScore: 88 }),
        mockSystem({ id: '3', status: 'warning', healthScore: 60 }),
        mockSystem({ id: '4', status: 'critical', healthScore: 20 }),
        mockSystem({ id: '5', status: 'unreachable', healthScore: 0 }),
      ];
      prisma.system.findMany.mockResolvedValue(systems);
      prisma.alert.count.mockResolvedValue(3);
      prisma.approvalRequest.count.mockResolvedValue(1);
      prisma.event.findMany.mockResolvedValue([]);
      prisma.connector.findMany.mockResolvedValue([]);

      const result = await service.getSummary(ORG_ID);

      expect(result.systems.total).toBe(5);
      expect(result.systems.healthy).toBe(2);
      expect(result.systems.warning).toBe(1);
      expect(result.systems.critical).toBe(1);
      expect(result.systems.unreachable).toBe(1);
    });

    it('computes average health score correctly', async () => {
      const systems = [
        mockSystem({ id: '1', healthScore: 90 }),
        mockSystem({ id: '2', healthScore: 60 }),
        mockSystem({ id: '3', healthScore: 30 }),
      ];
      prisma.system.findMany.mockResolvedValue(systems);
      prisma.alert.count.mockResolvedValue(0);
      prisma.approvalRequest.count.mockResolvedValue(0);
      prisma.event.findMany.mockResolvedValue([]);
      prisma.connector.findMany.mockResolvedValue([]);

      const result = await service.getSummary(ORG_ID);

      // (90+60+30)/3 = 60
      expect(result.systems.avgHealthScore).toBe(60);
    });

    it('returns zeros for an empty organization', async () => {
      prisma.system.findMany.mockResolvedValue([]);
      prisma.alert.count.mockResolvedValue(0);
      prisma.approvalRequest.count.mockResolvedValue(0);
      prisma.event.findMany.mockResolvedValue([]);
      prisma.connector.findMany.mockResolvedValue([]);

      const result = await service.getSummary(ORG_ID);

      expect(result.systems.total).toBe(0);
      expect(result.systems.healthy).toBe(0);
      expect(result.systems.warning).toBe(0);
      expect(result.systems.critical).toBe(0);
      expect(result.systems.unreachable).toBe(0);
      expect(result.systems.avgHealthScore).toBe(0);
      expect(result.alerts.active).toBe(0);
      expect(result.alerts.critical).toBe(0);
      expect(result.approvals.pending).toBe(0);
      expect(result.connectors.total).toBe(0);
    });

    it('counts connectors by status', async () => {
      prisma.system.findMany.mockResolvedValue([]);
      prisma.alert.count.mockResolvedValue(0);
      prisma.approvalRequest.count.mockResolvedValue(0);
      prisma.event.findMany.mockResolvedValue([]);
      prisma.connector.findMany.mockResolvedValue([
        { id: 'c1', systemId: 'sys-1', method: 'RFC', status: 'connected', latencyMs: 12 },
        { id: 'c2', systemId: 'sys-2', method: 'REST', status: 'connected', latencyMs: 45 },
        { id: 'c3', systemId: 'sys-3', method: 'RFC', status: 'disconnected', latencyMs: null },
      ]);

      const result = await service.getSummary(ORG_ID);

      expect(result.connectors.total).toBe(3);
      expect(result.connectors.connected).toBe(2);
      expect(result.connectors.disconnected).toBe(1);
    });

    it('passes alert counts from Prisma', async () => {
      prisma.system.findMany.mockResolvedValue([]);
      prisma.alert.count
        .mockResolvedValueOnce(15)   // activeAlerts
        .mockResolvedValueOnce(3);   // criticalAlerts
      prisma.approvalRequest.count.mockResolvedValue(7);
      prisma.event.findMany.mockResolvedValue([]);
      prisma.connector.findMany.mockResolvedValue([]);

      const result = await service.getSummary(ORG_ID);

      expect(result.alerts.active).toBe(15);
      expect(result.alerts.critical).toBe(3);
      expect(result.approvals.pending).toBe(7);
    });
  });
});
