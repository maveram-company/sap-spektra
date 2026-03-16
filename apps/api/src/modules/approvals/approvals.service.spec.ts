import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalsService } from './approvals.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RunbookExecutionEngineService } from '../runbooks/runbook-execution-engine.service';
import { AuditService } from '../audit/audit.service';

const ORG_ID = 'org-test-1';

function mockApproval(overrides = {}) {
  return {
    id: 'apr-1',
    organizationId: ORG_ID,
    systemId: 'sys-1',
    runbookId: null as string | null,
    description: 'Restart PAS instance',
    severity: 'high',
    status: 'PENDING',
    requestedBy: 'operator@acme.com',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let prisma: Record<string, any>;
  let mockEngine: Record<string, jest.Mock>;
  let mockAudit: Record<string, jest.Mock>;

  beforeEach(async () => {
    prisma = {
      approvalRequest: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      runbook: {
        findUnique: jest.fn(),
      },
      runbookExecution: {
        create: jest.fn(),
      },
    };

    mockEngine = {
      executeRunbook: jest.fn().mockResolvedValue(undefined),
    };

    mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RunbookExecutionEngineService, useValue: mockEngine },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<ApprovalsService>(ApprovalsService);
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns approvals for organization', async () => {
      prisma.approvalRequest.findMany.mockResolvedValue([mockApproval()]);
      const result = await service.findAll(ORG_ID);
      expect(result).toHaveLength(1);
    });

    it('applies status and systemId filters', async () => {
      prisma.approvalRequest.findMany.mockResolvedValue([]);
      await service.findAll(ORG_ID, { status: 'PENDING', systemId: 'sys-1' });

      expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            status: 'PENDING',
            systemId: 'sys-1',
          }),
        }),
      );
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('returns approval when found', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(mockApproval());
      const result = await service.findOne(ORG_ID, 'apr-1');
      expect(result.description).toBe('Restart PAS instance');
    });

    it('throws NotFoundException for missing approval', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(null);
      await expect(service.findOne(ORG_ID, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ──

  describe('create', () => {
    it('creates a new approval request with PENDING status', async () => {
      prisma.approvalRequest.create.mockResolvedValue(mockApproval());

      const result = await service.create(ORG_ID, {
        systemId: 'sys-1',
        description: 'Restart PAS',
        severity: 'high',
        requestedBy: 'operator@acme.com',
      });

      expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            status: 'PENDING',
          }),
        }),
      );
      expect(result.status).toBe('PENDING');
    });
  });

  // ── process ──

  describe('process', () => {
    it('approves a PENDING request and creates audit entry', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(mockApproval());
      prisma.approvalRequest.update.mockResolvedValue(
        mockApproval({ status: 'APPROVED', processedBy: 'admin@acme.com' }),
      );

      const result = await service.process(
        ORG_ID,
        'apr-1',
        'APPROVED',
        'admin@acme.com',
      );
      expect(result.status).toBe('APPROVED');
      expect(mockAudit.log).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          action: 'approval.approve',
          resource: 'approval/apr-1',
        }),
      );
    });

    it('rejects a PENDING request and creates audit entry', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(mockApproval());
      prisma.approvalRequest.update.mockResolvedValue(
        mockApproval({ status: 'REJECTED', processedBy: 'admin@acme.com' }),
      );

      const result = await service.process(
        ORG_ID,
        'apr-1',
        'REJECTED',
        'admin@acme.com',
      );
      expect(result.status).toBe('REJECTED');
      expect(mockAudit.log).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          action: 'approval.reject',
          severity: 'warning',
        }),
      );
    });

    it('triggers runbook execution when approved with runbookId', async () => {
      const approval = mockApproval({ runbookId: 'rb-1' });
      prisma.approvalRequest.findFirst.mockResolvedValue(approval);
      prisma.approvalRequest.update.mockResolvedValue(
        mockApproval({ status: 'APPROVED', runbookId: 'rb-1' }),
      );
      prisma.runbook.findUnique.mockResolvedValue({
        id: 'rb-1',
        steps: JSON.stringify([
          { order: 1, action: 'Stop', command: 'stopsap' },
          { order: 2, action: 'Restart', command: 'startsap' },
        ]),
      });
      prisma.runbookExecution.create.mockResolvedValue({ id: 'exec-1' });

      await service.process(ORG_ID, 'apr-1', 'APPROVED', 'admin@acme.com');

      expect(prisma.runbookExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            runbookId: 'rb-1',
            systemId: 'sys-1',
            gate: 'HUMAN',
            result: 'RUNNING',
            totalSteps: 2,
          }),
        }),
      );
      expect(mockEngine.executeRunbook).toHaveBeenCalledWith(
        'exec-1',
        'rb-1',
        'sys-1',
      );
      // Approval should be marked EXECUTED
      expect(prisma.approvalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'EXECUTED' }),
        }),
      );
    });

    it('does NOT trigger execution when approved without runbookId', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(mockApproval());
      prisma.approvalRequest.update.mockResolvedValue(
        mockApproval({ status: 'APPROVED' }),
      );

      await service.process(ORG_ID, 'apr-1', 'APPROVED', 'admin@acme.com');

      expect(mockEngine.executeRunbook).not.toHaveBeenCalled();
    });

    it('does NOT trigger execution when rejected with runbookId', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(
        mockApproval({ runbookId: 'rb-1' }),
      );
      prisma.approvalRequest.update.mockResolvedValue(
        mockApproval({ status: 'REJECTED', runbookId: 'rb-1' }),
      );

      await service.process(ORG_ID, 'apr-1', 'REJECTED', 'admin@acme.com');

      expect(mockEngine.executeRunbook).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing approval', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.process(ORG_ID, 'missing', 'APPROVED', 'admin@acme.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when processing non-PENDING approval', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(
        mockApproval({ status: 'APPROVED' }),
      );

      await expect(
        service.process(ORG_ID, 'apr-1', 'REJECTED', 'admin@acme.com'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
