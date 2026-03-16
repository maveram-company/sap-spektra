import { Test, TestingModule } from '@nestjs/testing';
import { MetricsPipelineService } from './metrics-pipeline.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('MetricsPipelineService', () => {
  let service: MetricsPipelineService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      host: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      hostMetric: {
        create: jest.fn(),
      },
      breach: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      alert: {
        create: jest.fn(),
      },
      healthSnapshot: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsPipelineService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MetricsPipelineService>(MetricsPipelineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('ignores metrics for unknown hosts', async () => {
    prisma.host.findUnique.mockResolvedValue(null);

    const result = await service.ingest({
      hostId: 'unknown',
      cpu: 50,
      memory: 60,
      disk: 40,
    });

    expect(result).toEqual({ breaches: 0, alerts: 0 });
    expect(prisma.hostMetric.create).not.toHaveBeenCalled();
  });

  it('stores metric and updates host for normal values (no breach)', async () => {
    prisma.host.findUnique.mockResolvedValue({
      id: 'h1',
      systemId: 'sys-1',
      system: { id: 'sys-1', sid: 'EP1', organizationId: 'org-1' },
    });
    prisma.host.update.mockResolvedValue({});
    prisma.hostMetric.create.mockResolvedValue({});
    prisma.breach.findFirst.mockResolvedValue(null);
    prisma.breach.findMany.mockResolvedValue([]);
    prisma.host.findMany.mockResolvedValue([{ cpu: 50, memory: 60, disk: 40 }]);
    prisma.healthSnapshot.create.mockResolvedValue({});

    const result = await service.ingest({
      hostId: 'h1',
      cpu: 50,
      memory: 60,
      disk: 40,
    });

    expect(result).toEqual({ breaches: 0, alerts: 0 });
    expect(prisma.hostMetric.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hostId: 'h1', cpu: 50 }),
      }),
    );
    expect(prisma.host.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'h1' },
        data: { cpu: 50, memory: 60, disk: 40 },
      }),
    );
  });

  it('creates breach and alert when CPU exceeds critical threshold', async () => {
    prisma.host.findUnique.mockResolvedValue({
      id: 'h1',
      systemId: 'sys-1',
      system: { id: 'sys-1', sid: 'EP1', organizationId: 'org-1' },
    });
    prisma.host.update.mockResolvedValue({});
    prisma.hostMetric.create.mockResolvedValue({});
    prisma.breach.findFirst.mockResolvedValue(null);
    prisma.breach.findMany.mockResolvedValue([]);
    prisma.breach.create.mockResolvedValue({});
    prisma.alert.create.mockResolvedValue({});
    prisma.host.findMany.mockResolvedValue([{ cpu: 97, memory: 60, disk: 40 }]);
    prisma.healthSnapshot.create.mockResolvedValue({});

    const result = await service.ingest({
      hostId: 'h1',
      cpu: 97,
      memory: 60,
      disk: 40,
    });

    expect(result.breaches).toBe(1);
    expect(result.alerts).toBe(1);
    expect(prisma.breach.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          systemId: 'sys-1',
          metric: 'cpu',
          value: 97,
          severity: 'CRITICAL',
        }),
      }),
    );
    expect(prisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          level: 'critical',
          escalation: 'L2',
        }),
      }),
    );
  });

  it('creates warning breach when memory exceeds warning but not critical', async () => {
    prisma.host.findUnique.mockResolvedValue({
      id: 'h1',
      systemId: 'sys-1',
      system: { id: 'sys-1', sid: 'EP1', organizationId: 'org-1' },
    });
    prisma.host.update.mockResolvedValue({});
    prisma.hostMetric.create.mockResolvedValue({});
    prisma.breach.findFirst.mockResolvedValue(null);
    prisma.breach.findMany.mockResolvedValue([]);
    prisma.breach.create.mockResolvedValue({});
    prisma.alert.create.mockResolvedValue({});
    prisma.host.findMany.mockResolvedValue([{ cpu: 50, memory: 88, disk: 40 }]);
    prisma.healthSnapshot.create.mockResolvedValue({});

    const result = await service.ingest({
      hostId: 'h1',
      cpu: 50,
      memory: 88,
      disk: 40,
    });

    expect(result.breaches).toBe(1);
    expect(prisma.breach.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metric: 'memory',
          severity: 'HIGH',
        }),
      }),
    );
    expect(prisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'warning',
          escalation: 'L1',
        }),
      }),
    );
  });

  it('auto-resolves breaches when metric drops below warning', async () => {
    const openBreach = {
      id: 'br-1',
      systemId: 'sys-1',
      metric: 'cpu',
      resolved: false,
    };
    prisma.host.findUnique.mockResolvedValue({
      id: 'h1',
      systemId: 'sys-1',
      system: { id: 'sys-1', sid: 'EP1', organizationId: 'org-1' },
    });
    prisma.host.update.mockResolvedValue({});
    prisma.hostMetric.create.mockResolvedValue({});
    prisma.breach.findFirst.mockResolvedValue(null);
    // For autoResolveBreaches: cpu < 80, return open breach; memory/disk normal, return empty
    prisma.breach.findMany
      .mockResolvedValueOnce([openBreach]) // cpu breaches
      .mockResolvedValueOnce([]) // memory breaches
      .mockResolvedValueOnce([]); // disk breaches
    prisma.breach.update.mockResolvedValue({});
    prisma.host.findMany.mockResolvedValue([{ cpu: 50, memory: 60, disk: 40 }]);
    prisma.healthSnapshot.create.mockResolvedValue({});

    await service.ingest({
      hostId: 'h1',
      cpu: 50,
      memory: 60,
      disk: 40,
    });

    expect(prisma.breach.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'br-1' },
        data: expect.objectContaining({ resolved: true }),
      }),
    );
  });

  it('creates health snapshot after ingestion', async () => {
    prisma.host.findUnique.mockResolvedValue({
      id: 'h1',
      systemId: 'sys-1',
      system: { id: 'sys-1', sid: 'EP1', organizationId: 'org-1' },
    });
    prisma.host.update.mockResolvedValue({});
    prisma.hostMetric.create.mockResolvedValue({});
    prisma.breach.findFirst.mockResolvedValue(null);
    prisma.breach.findMany.mockResolvedValue([]);
    prisma.host.findMany.mockResolvedValue([
      { cpu: 50, memory: 60, disk: 40 },
      { cpu: 70, memory: 80, disk: 50 },
    ]);
    prisma.healthSnapshot.create.mockResolvedValue({});

    await service.ingest({ hostId: 'h1', cpu: 50, memory: 60, disk: 40 });

    expect(prisma.healthSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          systemId: 'sys-1',
          status: expect.any(String),
          score: expect.any(Number),
        }),
      }),
    );
  });
});
