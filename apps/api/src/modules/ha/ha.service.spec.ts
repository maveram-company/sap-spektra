import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HAService } from './ha.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockHAConfig(overrides = {}) {
  return {
    id: 'ha-1',
    systemId: 'sys-1',
    status: 'active',
    lastFailoverAt: null,
    system: { sid: 'EP1', description: 'ERP Production', environment: 'PRD', status: 'healthy', healthScore: 92 },
    ...overrides,
  };
}

describe('HAService', () => {
  let service: HAService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      hAConfig: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HAService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<HAService>(HAService);
    jest.clearAllMocks();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns all HA configs for the organization', async () => {
      const configs = [mockHAConfig(), mockHAConfig({ id: 'ha-2', systemId: 'sys-2' })];
      prisma.hAConfig.findMany.mockResolvedValue(configs);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(2);
      expect(prisma.hAConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { system: { organizationId: ORG_ID } },
        }),
      );
    });
  });

  // ── findBySystem ──

  describe('findBySystem', () => {
    it('returns config when found', async () => {
      prisma.hAConfig.findFirst.mockResolvedValue(mockHAConfig());

      const result = await service.findBySystem(ORG_ID, 'sys-1');

      expect(result.systemId).toBe('sys-1');
      expect(prisma.hAConfig.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: 'sys-1', system: { organizationId: ORG_ID } },
        }),
      );
    });

    it('throws NotFoundException when config not found', async () => {
      prisma.hAConfig.findFirst.mockResolvedValue(null);

      await expect(service.findBySystem(ORG_ID, 'sys-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── triggerFailover ──

  describe('triggerFailover', () => {
    it('updates status to failover_in_progress and sets lastFailoverAt', async () => {
      prisma.hAConfig.findFirst.mockResolvedValue(mockHAConfig());
      prisma.hAConfig.update.mockResolvedValue(
        mockHAConfig({ status: 'failover_in_progress', lastFailoverAt: new Date() }),
      );

      const result = await service.triggerFailover(ORG_ID, 'sys-1');

      expect(result.status).toBe('failover_in_progress');
      expect(result.lastFailoverAt).toBeTruthy();
      expect(prisma.hAConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ha-1' },
          data: expect.objectContaining({
            status: 'failover_in_progress',
            lastFailoverAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException when config not found', async () => {
      prisma.hAConfig.findFirst.mockResolvedValue(null);

      await expect(service.triggerFailover(ORG_ID, 'sys-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── updateStatus ──

  describe('updateStatus', () => {
    it('updates the status of an existing config', async () => {
      prisma.hAConfig.findFirst.mockResolvedValue(mockHAConfig());
      prisma.hAConfig.update.mockResolvedValue(mockHAConfig({ status: 'standby' }));

      const result = await service.updateStatus(ORG_ID, 'sys-1', 'standby');

      expect(result.status).toBe('standby');
      expect(prisma.hAConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ha-1' },
          data: { status: 'standby' },
        }),
      );
    });

    it('throws NotFoundException when config not found', async () => {
      prisma.hAConfig.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus(ORG_ID, 'sys-missing', 'standby')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
