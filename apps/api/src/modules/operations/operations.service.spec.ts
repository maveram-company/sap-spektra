import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OperationsService } from './operations.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockOperation(overrides = {}) {
  return {
    id: 'op-1',
    organizationId: ORG_ID,
    systemId: 'sys-1',
    type: 'PATCH',
    description: 'Kernel update',
    status: 'SCHEDULED',
    requestedBy: 'admin@test.com',
    riskLevel: 'LOW',
    createdAt: new Date(),
    completedAt: null,
    system: { sid: 'EP1', description: 'ERP Production' },
    ...overrides,
  };
}

describe('OperationsService', () => {
  let service: OperationsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      operationRecord: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      jobRecord: { findMany: jest.fn() },
      transportRecord: { findMany: jest.fn() },
      certificateRecord: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<OperationsService>(OperationsService);
    jest.clearAllMocks();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns all operations for the organization', async () => {
      const ops = [mockOperation(), mockOperation({ id: 'op-2' })];
      prisma.operationRecord.findMany.mockResolvedValue(ops);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(2);
      expect(prisma.operationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('applies status filter when provided', async () => {
      prisma.operationRecord.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { status: 'COMPLETED' });

      expect(prisma.operationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID, status: 'COMPLETED' }),
        }),
      );
    });

    it('applies type filter when provided', async () => {
      prisma.operationRecord.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { type: 'PATCH' });

      expect(prisma.operationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID, type: 'PATCH' }),
        }),
      );
    });

    it('applies systemId filter when provided', async () => {
      prisma.operationRecord.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { systemId: 'sys-3' });

      expect(prisma.operationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID, systemId: 'sys-3' }),
        }),
      );
    });
  });

  // ── create ──

  describe('create', () => {
    const dto = {
      systemId: 'sys-1',
      type: 'PATCH',
      description: 'Kernel update',
      requestedBy: 'admin@test.com',
    };

    it('creates an operation with default status and riskLevel', async () => {
      prisma.operationRecord.create.mockResolvedValue(mockOperation());

      await service.create(ORG_ID, dto);

      expect(prisma.operationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            status: 'SCHEDULED',
            riskLevel: 'LOW',
          }),
        }),
      );
    });

    it('uses provided riskLevel when given', async () => {
      prisma.operationRecord.create.mockResolvedValue(mockOperation({ riskLevel: 'HIGH' }));

      await service.create(ORG_ID, { ...dto, riskLevel: 'HIGH' });

      expect(prisma.operationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ riskLevel: 'HIGH' }),
        }),
      );
    });
  });

  // ── updateStatus ──

  describe('updateStatus', () => {
    it('updates the status of an existing operation', async () => {
      prisma.operationRecord.findFirst.mockResolvedValue(mockOperation());
      prisma.operationRecord.update.mockResolvedValue(mockOperation({ status: 'IN_PROGRESS' }));

      const result = await service.updateStatus(ORG_ID, 'op-1', 'IN_PROGRESS');

      expect(result.status).toBe('IN_PROGRESS');
      expect(prisma.operationRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'op-1' },
          data: { status: 'IN_PROGRESS' },
        }),
      );
    });

    it('sets completedAt when status is COMPLETED', async () => {
      prisma.operationRecord.findFirst.mockResolvedValue(mockOperation());
      prisma.operationRecord.update.mockResolvedValue(
        mockOperation({ status: 'COMPLETED', completedAt: new Date() }),
      );

      await service.updateStatus(ORG_ID, 'op-1', 'COMPLETED');

      expect(prisma.operationRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException when operation not found', async () => {
      prisma.operationRecord.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(ORG_ID, 'op-missing', 'COMPLETED'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getJobs ──

  describe('getJobs', () => {
    it('returns all jobs when no systemId is provided', async () => {
      const jobs = [{ id: 'j1', name: 'RSUSR002', system: { sid: 'EP1' } }];
      prisma.jobRecord.findMany.mockResolvedValue(jobs);

      const result = await service.getJobs();

      expect(result).toHaveLength(1);
      expect(prisma.jobRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { startedAt: 'desc' },
        }),
      );
    });

    it('filters by systemId when provided', async () => {
      prisma.jobRecord.findMany.mockResolvedValue([]);

      await service.getJobs('sys-1');

      expect(prisma.jobRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: 'sys-1' },
        }),
      );
    });
  });

  // ── getTransports ──

  describe('getTransports', () => {
    it('returns all transports when no systemId is provided', async () => {
      const transports = [{ id: 't1', trkorr: 'DEVK900001', system: { sid: 'EP1' } }];
      prisma.transportRecord.findMany.mockResolvedValue(transports);

      const result = await service.getTransports();

      expect(result).toHaveLength(1);
      expect(prisma.transportRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('filters by systemId when provided', async () => {
      prisma.transportRecord.findMany.mockResolvedValue([]);

      await service.getTransports('sys-1');

      expect(prisma.transportRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: 'sys-1' },
        }),
      );
    });
  });

  // ── getCertificates ──

  describe('getCertificates', () => {
    it('returns all certificates when no systemId is provided', async () => {
      const certs = [{ id: 'cert-1', subject: 'CN=sapserver', system: { sid: 'EP1' } }];
      prisma.certificateRecord.findMany.mockResolvedValue(certs);

      const result = await service.getCertificates();

      expect(result).toHaveLength(1);
      expect(prisma.certificateRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { daysLeft: 'asc' },
        }),
      );
    });

    it('filters by systemId when provided', async () => {
      prisma.certificateRecord.findMany.mockResolvedValue([]);

      await service.getCertificates('sys-1');

      expect(prisma.certificateRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: 'sys-1' },
        }),
      );
    });
  });
});
