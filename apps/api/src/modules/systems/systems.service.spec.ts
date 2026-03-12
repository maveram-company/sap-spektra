import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SystemsService } from './systems.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockSystem(overrides = {}) {
  return {
    id: 'sys-1',
    sid: 'EP1',
    organizationId: ORG_ID,
    description: 'ERP Production',
    status: 'healthy',
    healthScore: 92,
    environment: 'PRD',
    sapProduct: 'SAP ERP',
    sapStackType: 'ABAP',
    dbType: 'SAP HANA 2.0',
    deploymentModel: 'ON_PREMISE',
    connectionMode: 'AGENT_FULL',
    monitoringCapabilityProfile: 'FULL_STACK_AGENT',
    supportsRunbookExecution: true,
    ...overrides,
  };
}

describe('SystemsService', () => {
  let service: SystemsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      system: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SystemsService>(SystemsService);
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns all systems for the organization', async () => {
      const systems = [mockSystem(), mockSystem({ id: 'sys-2', sid: 'EQ1' })];
      prisma.system.findMany.mockResolvedValue(systems);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(2);
      expect(prisma.system.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG_ID } }),
      );
    });

    it('applies tenant isolation — only queries given org', async () => {
      prisma.system.findMany.mockResolvedValue([]);
      await service.findAll('org-other');

      expect(prisma.system.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-other' } }),
      );
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('returns system when found in organization', async () => {
      prisma.system.findFirst.mockResolvedValue(mockSystem());

      const result = await service.findOne(ORG_ID, 'sys-1');
      expect(result.sid).toBe('EP1');
    });

    it('throws NotFoundException for missing system', async () => {
      prisma.system.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('enforces tenant isolation — includes organizationId in query', async () => {
      prisma.system.findFirst.mockResolvedValue(null);
      await service.findOne(ORG_ID, 'sys-1').catch(() => {});

      expect(prisma.system.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sys-1', organizationId: ORG_ID },
        }),
      );
    });
  });

  // ── create ──

  describe('create', () => {
    const dto = {
      sid: 'NEW',
      description: 'New System',
      sapProduct: 'SAP S/4HANA',
      productFamily: 'S4',
      sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0',
      environment: 'DEV',
    };

    it('creates a system when SID is unique', async () => {
      prisma.system.findUnique.mockResolvedValue(null);
      prisma.system.create.mockResolvedValue(mockSystem({ sid: 'NEW' }));

      const result = await service.create(ORG_ID, dto as any);
      expect(result.sid).toBe('NEW');
    });

    it('throws ConflictException for duplicate SID', async () => {
      prisma.system.findUnique.mockResolvedValue(mockSystem());

      await expect(service.create(ORG_ID, dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── update ──

  describe('update', () => {
    it('updates an existing system', async () => {
      prisma.system.findFirst.mockResolvedValue(mockSystem());
      prisma.system.update.mockResolvedValue(mockSystem({ description: 'Updated' }));

      const result = await service.update(ORG_ID, 'sys-1', { description: 'Updated' } as any);
      expect(result.description).toBe('Updated');
    });

    it('throws NotFoundException for missing system', async () => {
      prisma.system.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 'nonexistent', { description: 'X' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ──

  describe('remove', () => {
    it('deletes an existing system', async () => {
      prisma.system.findFirst.mockResolvedValue(mockSystem());
      prisma.system.delete.mockResolvedValue({});

      const result = await service.remove(ORG_ID, 'sys-1');
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException for missing system', async () => {
      prisma.system.findFirst.mockResolvedValue(null);
      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getHealthSummary ──

  describe('getHealthSummary', () => {
    it('computes summary stats correctly', async () => {
      prisma.system.findMany.mockResolvedValue([
        { id: '1', sid: 'EP1', status: 'healthy', healthScore: 95, environment: 'PRD' },
        { id: '2', sid: 'EQ1', status: 'warning', healthScore: 72, environment: 'QAS' },
        { id: '3', sid: 'ED1', status: 'critical', healthScore: 35, environment: 'DEV' },
      ]);

      const summary = await service.getHealthSummary(ORG_ID);

      expect(summary.total).toBe(3);
      expect(summary.healthy).toBe(1);
      expect(summary.warning).toBe(1);
      expect(summary.critical).toBe(1);
      expect(summary.unreachable).toBe(0);
      expect(summary.avgHealthScore).toBe(67); // (95+72+35)/3 = 67.33 → 67
    });

    it('returns zero averages for empty landscape', async () => {
      prisma.system.findMany.mockResolvedValue([]);
      const summary = await service.getHealthSummary(ORG_ID);

      expect(summary.total).toBe(0);
      expect(summary.avgHealthScore).toBe(0);
    });
  });
});
