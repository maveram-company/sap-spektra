import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockAuditEntry(overrides = {}) {
  return {
    id: 'audit-1',
    organizationId: ORG_ID,
    userId: 'user-1',
    userEmail: 'admin@test.com',
    action: 'system.restart',
    resource: 'system/sys-1',
    details: 'Restarted SAP system PRD',
    severity: 'info',
    timestamp: new Date('2025-06-01T10:00:00Z'),
    ...overrides,
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      auditEntry: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns audit entries for the organization', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([mockAuditEntry()]);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0].organizationId).toBe(ORG_ID);
    });

    it('enforces tenant isolation via organizationId', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll('org-other');

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-other' }),
        }),
      );
    });

    it('returns empty array when no audit entries exist', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      const result = await service.findAll(ORG_ID);

      expect(result).toEqual([]);
    });

    it('orders results by timestamp descending', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
        }),
      );
    });

    it('defaults to limit of 100 when no filters provided', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });

    it('defaults to limit of 100 when filters provided without limit', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { severity: 'warning' });

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });

    // ── filters ──

    it('applies severity filter when provided', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { severity: 'warning' });

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            severity: 'warning',
          }),
        }),
      );
    });

    it('applies action filter with contains matching', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { action: 'restart' });

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            action: { contains: 'restart' },
          }),
        }),
      );
    });

    it('applies custom limit when provided', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { limit: 25 });

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    it('applies all filters simultaneously', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, {
        severity: 'critical',
        action: 'delete',
        limit: 10,
      });

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          severity: 'critical',
          action: { contains: 'delete' },
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
      });
    });

    it('does not include severity in where clause when not provided', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { action: 'login' });

      const callArgs = prisma.auditEntry.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('severity');
    });

    it('does not include action in where clause when not provided', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { severity: 'info' });

      const callArgs = prisma.auditEntry.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('action');
    });

    it('works with no filters argument', async () => {
      prisma.auditEntry.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      expect(prisma.auditEntry.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        orderBy: { timestamp: 'desc' },
        take: 100,
      });
    });
  });

  // ── log ──

  describe('log', () => {
    it('creates an audit entry with all provided fields', async () => {
      const data = {
        userId: 'user-1',
        userEmail: 'admin@test.com',
        action: 'system.restart',
        resource: 'system/sys-1',
        details: 'Restarted PRD',
        severity: 'warning',
      };
      prisma.auditEntry.create.mockResolvedValue(mockAuditEntry({ ...data }));

      const result = await service.log(ORG_ID, data);

      expect(prisma.auditEntry.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG_ID,
          userId: 'user-1',
          userEmail: 'admin@test.com',
          action: 'system.restart',
          resource: 'system/sys-1',
          details: 'Restarted PRD',
          severity: 'warning',
        },
      });
      expect(result).toBeDefined();
    });

    it('defaults severity to info when not provided', async () => {
      const data = {
        userEmail: 'admin@test.com',
        action: 'system.view',
        resource: 'system/sys-1',
      };
      prisma.auditEntry.create.mockResolvedValue(
        mockAuditEntry({ severity: 'info' }),
      );

      await service.log(ORG_ID, data);

      expect(prisma.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          severity: 'info',
        }),
      });
    });

    it('associates the entry with the correct organization', async () => {
      const data = {
        userEmail: 'admin@test.com',
        action: 'login',
        resource: 'auth',
      };
      prisma.auditEntry.create.mockResolvedValue(mockAuditEntry());

      await service.log('org-42', data);

      expect(prisma.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-42',
        }),
      });
    });

    it('handles optional userId being undefined', async () => {
      const data = {
        userEmail: 'anonymous@test.com',
        action: 'api.access',
        resource: 'endpoint/health',
      };
      prisma.auditEntry.create.mockResolvedValue(
        mockAuditEntry({ userId: undefined }),
      );

      await service.log(ORG_ID, data);

      expect(prisma.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userEmail: 'anonymous@test.com',
          action: 'api.access',
        }),
      });
    });

    it('handles optional details being undefined', async () => {
      const data = {
        userEmail: 'admin@test.com',
        action: 'user.login',
        resource: 'auth',
      };
      prisma.auditEntry.create.mockResolvedValue(mockAuditEntry());

      await service.log(ORG_ID, data);

      expect(prisma.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'user.login',
          resource: 'auth',
        }),
      });
    });

    it('returns the created audit entry', async () => {
      const created = mockAuditEntry({ id: 'audit-new' });
      prisma.auditEntry.create.mockResolvedValue(created);

      const result = await service.log(ORG_ID, {
        userEmail: 'admin@test.com',
        action: 'test',
        resource: 'test',
      });

      expect(result).toEqual(created);
    });

    it('preserves explicit severity when provided', async () => {
      prisma.auditEntry.create.mockResolvedValue(
        mockAuditEntry({ severity: 'critical' }),
      );

      await service.log(ORG_ID, {
        userEmail: 'admin@test.com',
        action: 'system.delete',
        resource: 'system/sys-1',
        severity: 'critical',
      });

      expect(prisma.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          severity: 'critical',
        }),
      });
    });
  });
});
