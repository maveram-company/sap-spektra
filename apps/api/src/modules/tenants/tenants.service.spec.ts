import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ORG_ID = 'org-test-1';

function mockOrg(overrides = {}) {
  return {
    id: ORG_ID,
    name: 'Acme Corp',
    timezone: 'America/Bogota',
    language: 'es',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('TenantsService', () => {
  let service: TenantsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      system: {
        count: jest.fn(),
      },
      membership: {
        count: jest.fn(),
      },
      alert: {
        count: jest.fn(),
      },
    };

    const mockAudit = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    jest.clearAllMocks();
  });

  // ── findOne ──

  describe('findOne', () => {
    it('returns the organization', async () => {
      const org = mockOrg();
      prisma.organization.findUnique.mockResolvedValue(org);

      const result = await service.findOne(ORG_ID);

      expect(result).toEqual(org);
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: ORG_ID },
      });
    });

    it('throws NotFoundException when organization not found', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ──

  describe('update', () => {
    it('updates and returns the organization', async () => {
      const org = mockOrg();
      const updated = mockOrg({ name: 'Acme Updated' });
      prisma.organization.findUnique.mockResolvedValue(org);
      prisma.organization.update.mockResolvedValue(updated);

      const result = await service.update(ORG_ID, { name: 'Acme Updated' });

      expect(result.name).toBe('Acme Updated');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { name: 'Acme Updated' },
      });
    });

    it('throws NotFoundException when organization not found', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.update(ORG_ID, { name: 'Nope' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getStats ──

  describe('getStats', () => {
    it('returns aggregated counts', async () => {
      prisma.system.count.mockResolvedValue(5);
      prisma.membership.count.mockResolvedValue(12);
      prisma.alert.count
        .mockResolvedValueOnce(30) // total alerts
        .mockResolvedValueOnce(8); // active alerts

      const stats = await service.getStats(ORG_ID);

      expect(stats).toEqual({
        systemCount: 5,
        userCount: 12,
        alertCount: 30,
        activeAlerts: 8,
      });
    });
  });
});
