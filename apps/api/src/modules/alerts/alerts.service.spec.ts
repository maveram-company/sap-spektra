import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockAlert(overrides = {}) {
  return {
    id: 'alert-1',
    organizationId: ORG_ID,
    systemId: 'sys-1',
    level: 'warning',
    status: 'active',
    message: 'CPU above 85%',
    acknowledged: false,
    resolved: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AlertsService', () => {
  let service: AlertsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      alert: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns alerts for organization', async () => {
      prisma.alert.findMany.mockResolvedValue([mockAlert()]);
      const result = await service.findAll(ORG_ID);
      expect(result).toHaveLength(1);
    });

    it('applies filters when provided', async () => {
      prisma.alert.findMany.mockResolvedValue([]);
      await service.findAll(ORG_ID, { status: 'active', level: 'critical', systemId: 'sys-1' });

      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            status: 'active',
            level: 'critical',
            systemId: 'sys-1',
          }),
        }),
      );
    });

    it('enforces tenant isolation', async () => {
      prisma.alert.findMany.mockResolvedValue([]);
      await service.findAll('org-other');

      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-other' }) }),
      );
    });
  });

  // ── acknowledge ──

  describe('acknowledge', () => {
    it('acknowledges an existing alert', async () => {
      prisma.alert.findFirst.mockResolvedValue(mockAlert());
      prisma.alert.update.mockResolvedValue(mockAlert({ status: 'acknowledged', acknowledged: true }));

      const result = await service.acknowledge(ORG_ID, 'alert-1', 'user@test.com');
      expect(result.status).toBe('acknowledged');
      expect(result.acknowledged).toBe(true);
    });

    it('throws NotFoundException for missing alert', async () => {
      prisma.alert.findFirst.mockResolvedValue(null);

      await expect(
        service.acknowledge(ORG_ID, 'nonexistent', 'user@test.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('records acknowledging user email', async () => {
      prisma.alert.findFirst.mockResolvedValue(mockAlert());
      prisma.alert.update.mockResolvedValue(mockAlert());

      await service.acknowledge(ORG_ID, 'alert-1', 'admin@acme.com');

      expect(prisma.alert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ackBy: 'admin@acme.com' }),
        }),
      );
    });
  });

  // ── resolve ──

  describe('resolve', () => {
    it('resolves an existing alert with category and note', async () => {
      prisma.alert.findFirst.mockResolvedValue(mockAlert());
      prisma.alert.update.mockResolvedValue(mockAlert({ status: 'resolved', resolved: true }));

      const result = await service.resolve(ORG_ID, 'alert-1', 'user@test.com', {
        category: 'false_positive',
        note: 'Spike was transient',
      });

      expect(result.status).toBe('resolved');
    });

    it('throws NotFoundException for missing alert', async () => {
      prisma.alert.findFirst.mockResolvedValue(null);

      await expect(
        service.resolve(ORG_ID, 'nonexistent', 'user@test.com', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getStats ──

  describe('getStats', () => {
    it('returns aggregated alert stats', async () => {
      prisma.alert.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(60)  // active
        .mockResolvedValueOnce(15)  // acknowledged
        .mockResolvedValueOnce(25)  // resolved
        .mockResolvedValueOnce(5)   // critical
        .mockResolvedValueOnce(20); // warning

      const stats = await service.getStats(ORG_ID);

      expect(stats).toEqual({
        total: 100,
        active: 60,
        acknowledged: 15,
        resolved: 25,
        critical: 5,
        warning: 20,
      });
    });
  });
});
