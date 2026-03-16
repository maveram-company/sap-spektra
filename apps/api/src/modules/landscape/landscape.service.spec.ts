import { Test, TestingModule } from '@nestjs/testing';
import { LandscapeService } from './landscape.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockSystem(overrides = {}) {
  return {
    id: 'sys-1',
    organizationId: ORG_ID,
    sid: 'PRD',
    environment: 'production',
    healthScore: 85,
    supportsHostMetrics: true,
    connectors: [{ id: 'conn-1', status: 'connected' }],
    haConfig: { haEnabled: true },
    ...overrides,
  };
}

describe('LandscapeService', () => {
  let service: LandscapeService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      system: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandscapeService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LandscapeService>(LandscapeService);
  });

  // ── getValidation ──

  describe('getValidation', () => {
    it('returns validation results for all systems in the organization', async () => {
      prisma.system.findMany.mockResolvedValue([mockSystem()]);

      const result = await service.getValidation(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe('sys-1');
      expect(result[0].sid).toBe('PRD');
      expect(result[0].environment).toBe('production');
    });

    it('enforces tenant isolation via organizationId', async () => {
      prisma.system.findMany.mockResolvedValue([]);

      await service.getValidation('org-other');

      expect(prisma.system.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-other' },
        include: { connectors: true, haConfig: true },
        take: 200,
      });
    });

    it('returns empty array when organization has no systems', async () => {
      prisma.system.findMany.mockResolvedValue([]);

      const result = await service.getValidation(ORG_ID);

      expect(result).toEqual([]);
    });

    // ── connectivity check ──

    it('marks connectivity as pass when at least one connector is connected', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({
          connectors: [
            { id: 'c-1', status: 'disconnected' },
            { id: 'c-2', status: 'connected' },
          ],
        }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const connectivityCheck = result[0].checks.find(
        (c) => c.rule === 'connectivity',
      );

      expect(connectivityCheck!.status).toBe('pass');
    });

    it('marks connectivity as fail when no connectors are connected', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({
          connectors: [{ id: 'c-1', status: 'disconnected' }],
        }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const connectivityCheck = result[0].checks.find(
        (c) => c.rule === 'connectivity',
      );

      expect(connectivityCheck!.status).toBe('fail');
    });

    it('marks connectivity as fail when connectors array is empty', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ connectors: [] }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const connectivityCheck = result[0].checks.find(
        (c) => c.rule === 'connectivity',
      );

      expect(connectivityCheck!.status).toBe('fail');
    });

    // ── monitoring_enabled check ──

    it('marks monitoring_enabled as pass when supportsHostMetrics is true', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ supportsHostMetrics: true }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const monitoringCheck = result[0].checks.find(
        (c) => c.rule === 'monitoring_enabled',
      );

      expect(monitoringCheck!.status).toBe('pass');
    });

    it('marks monitoring_enabled as warn when supportsHostMetrics is false', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ supportsHostMetrics: false }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const monitoringCheck = result[0].checks.find(
        (c) => c.rule === 'monitoring_enabled',
      );

      expect(monitoringCheck!.status).toBe('warn');
    });

    // ── ha_configured check ──

    it('marks ha_configured as pass when HA is enabled', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ haConfig: { haEnabled: true } }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const haCheck = result[0].checks.find((c) => c.rule === 'ha_configured');

      expect(haCheck!.status).toBe('pass');
    });

    it('marks ha_configured as warn when HA is disabled', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ haConfig: { haEnabled: false } }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const haCheck = result[0].checks.find((c) => c.rule === 'ha_configured');

      expect(haCheck!.status).toBe('warn');
    });

    it('marks ha_configured as warn when haConfig is null', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ haConfig: null }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const haCheck = result[0].checks.find((c) => c.rule === 'ha_configured');

      expect(haCheck!.status).toBe('warn');
    });

    // ── health_score check ──

    it('marks health_score as pass when score >= 70', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ healthScore: 70 }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const healthCheck = result[0].checks.find(
        (c) => c.rule === 'health_score',
      );

      expect(healthCheck!.status).toBe('pass');
    });

    it('marks health_score as warn when score >= 50 and < 70', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ healthScore: 50 }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const healthCheck = result[0].checks.find(
        (c) => c.rule === 'health_score',
      );

      expect(healthCheck!.status).toBe('warn');
    });

    it('marks health_score as fail when score < 50', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ healthScore: 30 }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const healthCheck = result[0].checks.find(
        (c) => c.rule === 'health_score',
      );

      expect(healthCheck!.status).toBe('fail');
    });

    it('marks health_score as warn at boundary value 69', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ healthScore: 69 }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const healthCheck = result[0].checks.find(
        (c) => c.rule === 'health_score',
      );

      expect(healthCheck!.status).toBe('warn');
    });

    it('marks health_score as fail at boundary value 49', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ healthScore: 49 }),
      ]);

      const result = await service.getValidation(ORG_ID);
      const healthCheck = result[0].checks.find(
        (c) => c.rule === 'health_score',
      );

      expect(healthCheck!.status).toBe('fail');
    });

    // ── overallStatus ──

    it('returns overallStatus pass when all checks pass', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({
          healthScore: 90,
          supportsHostMetrics: true,
          connectors: [{ id: 'c-1', status: 'connected' }],
          haConfig: { haEnabled: true },
        }),
      ]);

      const result = await service.getValidation(ORG_ID);

      expect(result[0].overallStatus).toBe('pass');
    });

    it('returns overallStatus warn when only warnings exist', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({
          healthScore: 90,
          supportsHostMetrics: false, // triggers warn
          connectors: [{ id: 'c-1', status: 'connected' }],
          haConfig: { haEnabled: true },
        }),
      ]);

      const result = await service.getValidation(ORG_ID);

      expect(result[0].overallStatus).toBe('warn');
    });

    it('returns overallStatus fail when any check fails', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({
          healthScore: 30, // triggers fail
          supportsHostMetrics: true,
          connectors: [{ id: 'c-1', status: 'connected' }],
          haConfig: { haEnabled: true },
        }),
      ]);

      const result = await service.getValidation(ORG_ID);

      expect(result[0].overallStatus).toBe('fail');
    });

    it('returns overallStatus fail even when there are also warnings', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({
          healthScore: 30, // fail
          supportsHostMetrics: false, // warn
          connectors: [], // fail
          haConfig: null, // warn
        }),
      ]);

      const result = await service.getValidation(ORG_ID);

      expect(result[0].overallStatus).toBe('fail');
    });

    // ── multiple systems ──

    it('validates multiple systems independently', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({
          id: 'sys-1',
          sid: 'PRD',
          healthScore: 95,
          connectors: [{ id: 'c-1', status: 'connected' }],
          haConfig: { haEnabled: true },
          supportsHostMetrics: true,
        }),
        mockSystem({
          id: 'sys-2',
          sid: 'DEV',
          healthScore: 30,
          connectors: [],
          haConfig: null,
          supportsHostMetrics: false,
        }),
      ]);

      const result = await service.getValidation(ORG_ID);

      expect(result).toHaveLength(2);
      expect(result[0].overallStatus).toBe('pass');
      expect(result[1].overallStatus).toBe('fail');
    });

    it('includes exactly four checks per system', async () => {
      prisma.system.findMany.mockResolvedValue([mockSystem()]);

      const result = await service.getValidation(ORG_ID);

      expect(result[0].checks).toHaveLength(4);
      const rules = result[0].checks.map((c) => c.rule);
      expect(rules).toEqual([
        'connectivity',
        'monitoring_enabled',
        'ha_configured',
        'health_score',
      ]);
    });
  });
});
