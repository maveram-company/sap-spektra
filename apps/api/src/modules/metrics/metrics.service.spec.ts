import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

describe('MetricsService', () => {
  let service: MetricsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      hostMetric: { findMany: jest.fn() },
      healthSnapshot: { findMany: jest.fn() },
      breach: { findMany: jest.fn() },
      dependency: { findMany: jest.fn() },
      host: { findMany: jest.fn() },
      component: { findMany: jest.fn() },
      systemMeta: { findFirst: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    jest.clearAllMocks();
  });

  // ── getHostMetrics ──

  describe('getHostMetrics', () => {
    it('returns metrics for a given host', async () => {
      const metrics = [{ id: 'm1', hostId: 'h1', cpuPct: 45, timestamp: new Date() }];
      prisma.hostMetric.findMany.mockResolvedValue(metrics);

      const result = await service.getHostMetrics('h1');

      expect(result).toHaveLength(1);
      expect(prisma.hostMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ hostId: 'h1' }),
          orderBy: { timestamp: 'asc' },
        }),
      );
    });

    it('defaults to 24 hours lookback', async () => {
      prisma.hostMetric.findMany.mockResolvedValue([]);
      const before = Date.now();

      await service.getHostMetrics('h1');

      const call = prisma.hostMetric.findMany.mock.calls[0][0];
      const since = call.where.timestamp.gte as Date;
      // since should be roughly 24 hours ago
      const hoursAgo = (before - since.getTime()) / 3600000;
      expect(hoursAgo).toBeGreaterThan(23.9);
      expect(hoursAgo).toBeLessThan(24.1);
    });

    it('respects custom hours parameter', async () => {
      prisma.hostMetric.findMany.mockResolvedValue([]);
      const before = Date.now();

      await service.getHostMetrics('h1', 6);

      const call = prisma.hostMetric.findMany.mock.calls[0][0];
      const since = call.where.timestamp.gte as Date;
      const hoursAgo = (before - since.getTime()) / 3600000;
      expect(hoursAgo).toBeGreaterThan(5.9);
      expect(hoursAgo).toBeLessThan(6.1);
    });
  });

  // ── getHostMetricsBySystem ──

  describe('getHostMetricsBySystem', () => {
    it('returns metrics filtered by system and organization', async () => {
      const metrics = [{ id: 'm1', host: { hostname: 'host-01' } }];
      prisma.hostMetric.findMany.mockResolvedValue(metrics);

      const result = await service.getHostMetricsBySystem(ORG_ID, 'sys-1');

      expect(result).toHaveLength(1);
      expect(prisma.hostMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            host: { systemId: 'sys-1', system: { organizationId: ORG_ID } },
          }),
        }),
      );
    });

    it('defaults to 24 hours lookback', async () => {
      prisma.hostMetric.findMany.mockResolvedValue([]);
      const before = Date.now();

      await service.getHostMetricsBySystem(ORG_ID, 'sys-1');

      const call = prisma.hostMetric.findMany.mock.calls[0][0];
      const since = call.where.timestamp.gte as Date;
      const hoursAgo = (before - since.getTime()) / 3600000;
      expect(hoursAgo).toBeGreaterThan(23.9);
      expect(hoursAgo).toBeLessThan(24.1);
    });
  });

  // ── getHealthSnapshots ──

  describe('getHealthSnapshots', () => {
    it('returns snapshots for a system', async () => {
      const snapshots = [{ id: 'snap-1', systemId: 'sys-1', healthScore: 85 }];
      prisma.healthSnapshot.findMany.mockResolvedValue(snapshots);

      const result = await service.getHealthSnapshots(ORG_ID, 'sys-1');

      expect(result).toHaveLength(1);
      expect(prisma.healthSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            systemId: 'sys-1',
            system: { organizationId: ORG_ID },
          }),
          orderBy: { timestamp: 'asc' },
        }),
      );
    });

    it('defaults to 24 hours lookback', async () => {
      prisma.healthSnapshot.findMany.mockResolvedValue([]);
      const before = Date.now();

      await service.getHealthSnapshots(ORG_ID, 'sys-1');

      const call = prisma.healthSnapshot.findMany.mock.calls[0][0];
      const since = call.where.timestamp.gte as Date;
      const hoursAgo = (before - since.getTime()) / 3600000;
      expect(hoursAgo).toBeGreaterThan(23.9);
      expect(hoursAgo).toBeLessThan(24.1);
    });
  });

  // ── getBreaches ──

  describe('getBreaches', () => {
    it('returns breaches for an organization', async () => {
      const breaches = [{ id: 'b1', systemId: 'sys-1', system: { sid: 'EP1' } }];
      prisma.breach.findMany.mockResolvedValue(breaches);

      const result = await service.getBreaches(ORG_ID);

      expect(result).toHaveLength(1);
      expect(prisma.breach.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ system: { organizationId: ORG_ID } }),
          orderBy: { timestamp: 'desc' },
        }),
      );
    });

    it('filters by systemId when provided', async () => {
      prisma.breach.findMany.mockResolvedValue([]);

      await service.getBreaches(ORG_ID, 'sys-1');

      expect(prisma.breach.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ systemId: 'sys-1' }),
        }),
      );
    });

    it('filters by resolved when provided', async () => {
      prisma.breach.findMany.mockResolvedValue([]);

      await service.getBreaches(ORG_ID, undefined, false);

      expect(prisma.breach.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resolved: false }),
        }),
      );
    });
  });

  // ── getDependencies ──

  describe('getDependencies', () => {
    it('returns dependencies for a system', async () => {
      const deps = [{ id: 'd1', systemId: 'sys-1', targetSid: 'EQ1', status: 'ok' }];
      prisma.dependency.findMany.mockResolvedValue(deps);

      const result = await service.getDependencies(ORG_ID, 'sys-1');

      expect(result).toHaveLength(1);
      expect(prisma.dependency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: 'sys-1', system: { organizationId: ORG_ID } },
          orderBy: { status: 'asc' },
        }),
      );
    });
  });

  // ── getHosts ──

  describe('getHosts', () => {
    it('returns hosts for a system with instances', async () => {
      const hosts = [{ id: 'h1', hostname: 'host-01', instances: [] }];
      prisma.host.findMany.mockResolvedValue(hosts);

      const result = await service.getHosts(ORG_ID, 'sys-1');

      expect(result).toHaveLength(1);
      expect(prisma.host.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: 'sys-1', system: { organizationId: ORG_ID } },
          include: { instances: true },
        }),
      );
    });
  });

  // ── getComponents ──

  describe('getComponents', () => {
    it('returns components for a system with instances', async () => {
      const components = [{ id: 'comp-1', name: 'ICM', instances: [] }];
      prisma.component.findMany.mockResolvedValue(components);

      const result = await service.getComponents(ORG_ID, 'sys-1');

      expect(result).toHaveLength(1);
      expect(prisma.component.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: 'sys-1', system: { organizationId: ORG_ID } },
          include: { instances: true },
        }),
      );
    });
  });

  // ── getSystemMeta ──

  describe('getSystemMeta', () => {
    it('returns single meta when systemId is provided', async () => {
      const meta = { id: 'meta-1', systemId: 'sys-1', kernelVersion: '7.53' };
      prisma.systemMeta.findFirst.mockResolvedValue(meta);

      const result = await service.getSystemMeta(ORG_ID, 'sys-1');

      expect(result).toEqual(meta);
      expect(prisma.systemMeta.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: 'sys-1', system: { organizationId: ORG_ID } },
        }),
      );
    });

    it('returns all meta when systemId is not provided', async () => {
      const metas = [
        { id: 'meta-1', systemId: 'sys-1', system: { sid: 'EP1' } },
        { id: 'meta-2', systemId: 'sys-2', system: { sid: 'EQ1' } },
      ];
      prisma.systemMeta.findMany.mockResolvedValue(metas);

      const result = await service.getSystemMeta(ORG_ID);

      expect(result).toHaveLength(2);
      expect(prisma.systemMeta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { system: { organizationId: ORG_ID } },
        }),
      );
    });
  });
});
