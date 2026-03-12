import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RunbooksService } from './runbooks.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockRunbook(overrides = {}) {
  return {
    id: 'rb-1',
    organizationId: ORG_ID,
    name: 'HANA Backup',
    description: 'Execute HANA backup via hdbsql',
    costSafe: true,
    autoExecute: true,
    dbType: 'HANA',
    steps: JSON.stringify(['Stop tenant', 'Create snapshot', 'Verify backup']),
    prereqs: JSON.stringify(['HANA 2.0 or higher']),
    parameters: null,
    ...overrides,
  };
}

function mockSystem(overrides = {}) {
  return {
    id: 'sys-1',
    sid: 'EP1',
    dbType: 'SAP HANA 2.0',
    sapProduct: 'SAP ERP',
    sapStackType: 'ABAP',
    monitoringCapabilityProfile: 'FULL_STACK_AGENT',
    supportsRunbookExecution: true,
    systemMeta: { osVersion: 'SLES 15 SP5' },
    ...overrides,
  };
}

describe('RunbooksService', () => {
  let service: RunbooksService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      runbook: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      runbookExecution: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      system: {
        findUnique: jest.fn(),
      },
      hAConfig: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunbooksService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RunbooksService>(RunbooksService);
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns all runbooks for the organization', async () => {
      prisma.runbook.findMany.mockResolvedValue([mockRunbook()]);
      const result = await service.findAll(ORG_ID);
      expect(result).toHaveLength(1);
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('returns runbook when found', async () => {
      prisma.runbook.findFirst.mockResolvedValue(mockRunbook());
      const result = await service.findOne(ORG_ID, 'rb-1');
      expect(result.name).toBe('HANA Backup');
    });

    it('throws NotFoundException for missing runbook', async () => {
      prisma.runbook.findFirst.mockResolvedValue(null);
      await expect(service.findOne(ORG_ID, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── execute: dry-run ──

  describe('execute (dry-run)', () => {
    it('returns simulation with compatibility info', async () => {
      prisma.runbook.findFirst.mockResolvedValue(mockRunbook());
      prisma.system.findUnique.mockResolvedValue(mockSystem());

      const result = (await service.execute(
        ORG_ID,
        'rb-1',
        'sys-1',
        'user@test.com',
        true,
      )) as any;

      expect(result.dryRun).toBe(true);
      expect(result.compatible).toBe(true);
      expect(result.validationFailures).toHaveLength(0);
      expect(result.gate).toBe('SAFE');
    });

    it('reports incompatibility for RISE_RESTRICTED systems', async () => {
      prisma.runbook.findFirst.mockResolvedValue(mockRunbook());
      prisma.system.findUnique.mockResolvedValue(
        mockSystem({
          monitoringCapabilityProfile: 'RISE_RESTRICTED',
          supportsRunbookExecution: false,
        }),
      );

      const result = (await service.execute(
        ORG_ID,
        'rb-1',
        'sys-1',
        'user@test.com',
        true,
      )) as any;

      expect(result.dryRun).toBe(true);
      expect(result.compatible).toBe(false);
      expect(result.validationFailures.length).toBeGreaterThan(0);
      expect(result.validationFailures[0]).toContain(
        'no soporta ejecución de runbooks',
      );
    });

    it('reports DB incompatibility', async () => {
      prisma.runbook.findFirst.mockResolvedValue(
        mockRunbook({ dbType: 'Oracle' }),
      );
      prisma.system.findUnique.mockResolvedValue(
        mockSystem({ dbType: 'SAP HANA 2.0' }),
      );

      const result = (await service.execute(
        ORG_ID,
        'rb-1',
        'sys-1',
        'user@test.com',
        true,
      )) as any;

      expect(result.compatible).toBe(false);
      expect(
        result.validationFailures.some((f: string) =>
          f.includes('BD incompatible'),
        ),
      ).toBe(true);
    });
  });

  // ── execute: real ──

  describe('execute (real)', () => {
    it('throws NotFoundException for missing runbook', async () => {
      prisma.runbook.findFirst.mockResolvedValue(null);

      await expect(
        service.execute(ORG_ID, 'missing', 'sys-1', 'user@test.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks execution for incompatible systems', async () => {
      prisma.runbook.findFirst.mockResolvedValue(mockRunbook());
      prisma.system.findUnique.mockResolvedValue(
        mockSystem({
          supportsRunbookExecution: false,
          monitoringCapabilityProfile: 'RISE_RESTRICTED',
        }),
      );

      await expect(
        service.execute(ORG_ID, 'rb-1', 'sys-1', 'user@test.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates execution and returns SUCCESS for cost-safe runbooks', async () => {
      prisma.runbook.findFirst.mockResolvedValue(mockRunbook());
      prisma.system.findUnique.mockResolvedValue(mockSystem());
      const createdExec = { id: 'exec-1', result: 'RUNNING' };
      prisma.runbookExecution.create.mockResolvedValue(createdExec);
      prisma.runbookExecution.update.mockResolvedValue({
        ...createdExec,
        result: 'SUCCESS',
      });

      const result = (await service.execute(
        ORG_ID,
        'rb-1',
        'sys-1',
        'user@test.com',
      )) as any;
      expect(result.result).toBe('SUCCESS');
    });

    it('creates PENDING execution for non-cost-safe runbooks', async () => {
      prisma.runbook.findFirst.mockResolvedValue(
        mockRunbook({ costSafe: false }),
      );
      prisma.system.findUnique.mockResolvedValue(mockSystem());
      const createdExec = { id: 'exec-1', result: 'PENDING', gate: 'HUMAN' };
      prisma.runbookExecution.create.mockResolvedValue(createdExec);

      const result = (await service.execute(
        ORG_ID,
        'rb-1',
        'sys-1',
        'user@test.com',
      )) as any;
      expect(result.result).toBe('PENDING');
    });
  });

  // ── RISE_RESTRICTED validation ──

  describe('RISE_RESTRICTED behavior', () => {
    it('validates stack incompatibility for ABAP-only runbooks on JAVA systems', async () => {
      prisma.runbook.findFirst.mockResolvedValue(
        mockRunbook({ dbType: 'ABAP' }),
      );
      prisma.system.findUnique.mockResolvedValue(
        mockSystem({ sapStackType: 'JAVA' }),
      );

      const result = (await service.execute(
        ORG_ID,
        'rb-1',
        'sys-1',
        'user@test.com',
        true,
      )) as any;

      expect(result.compatible).toBe(false);
      expect(
        result.validationFailures.some((f: string) =>
          f.includes('Stack incompatible'),
        ),
      ).toBe(true);
    });

    it('validates OS compatibility', async () => {
      prisma.runbook.findFirst.mockResolvedValue(
        mockRunbook({ parameters: JSON.stringify({ osType: 'WINDOWS' }) }),
      );
      prisma.system.findUnique.mockResolvedValue(
        mockSystem({ systemMeta: { osVersion: 'SLES 15 SP5' } }),
      );

      const result = (await service.execute(
        ORG_ID,
        'rb-1',
        'sys-1',
        'user@test.com',
        true,
      )) as any;

      expect(result.compatible).toBe(false);
      expect(
        result.validationFailures.some((f: string) =>
          f.includes('OS incompatible'),
        ),
      ).toBe(true);
    });
  });
});
