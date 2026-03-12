import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockAlert(overrides = {}) {
  return {
    id: 'alert-1',
    organizationId: ORG_ID,
    systemId: 'sys-1',
    title: 'High CPU Usage',
    level: 'critical',
    status: 'active',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    system: { sid: 'PRD' },
    ...overrides,
  };
}

describe('AiService', () => {
  let service: AiService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      alert: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  // ── getUseCases ──

  describe('getUseCases', () => {
    it('returns all predefined use cases', async () => {
      const result = await service.getUseCases();

      expect(result).toHaveLength(5);
    });

    it('includes anomaly-detection use case with correct fields', async () => {
      const result = await service.getUseCases();
      const anomaly = result.find((uc) => uc.id === 'anomaly-detection');

      expect(anomaly).toBeDefined();
      expect(anomaly).toEqual({
        id: 'anomaly-detection',
        name: 'Anomaly Detection',
        description: 'ML-based anomaly detection on system metrics',
        status: 'available',
        category: 'monitoring',
      });
    });

    it('includes predictive-maintenance use case', async () => {
      const result = await service.getUseCases();
      const predictive = result.find(
        (uc) => uc.id === 'predictive-maintenance',
      );

      expect(predictive).toBeDefined();
      expect(predictive!.status).toBe('available');
      expect(predictive!.category).toBe('operations');
    });

    it('includes coming_soon use cases', async () => {
      const result = await service.getUseCases();
      const comingSoon = result.filter((uc) => uc.status === 'coming_soon');

      expect(comingSoon).toHaveLength(2);
      expect(comingSoon.map((uc) => uc.id)).toEqual(
        expect.arrayContaining(['capacity-planning', 'auto-remediation']),
      );
    });

    it('includes beta use case for security-analysis', async () => {
      const result = await service.getUseCases();
      const security = result.find((uc) => uc.id === 'security-analysis');

      expect(security).toBeDefined();
      expect(security!.status).toBe('beta');
      expect(security!.category).toBe('security');
    });

    it('each use case has all required fields', async () => {
      const result = await service.getUseCases();

      for (const uc of result) {
        expect(uc).toHaveProperty('id');
        expect(uc).toHaveProperty('name');
        expect(uc).toHaveProperty('description');
        expect(uc).toHaveProperty('status');
        expect(uc).toHaveProperty('category');
      }
    });
  });

  // ── getResponses ──

  describe('getResponses', () => {
    it('returns AI responses for active alerts', async () => {
      prisma.alert.findMany.mockResolvedValue([mockAlert()]);

      const result = await service.getResponses(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'ai-alert-1',
        alertId: 'alert-1',
        system: 'PRD',
        insight: expect.stringContaining('Analysis of High CPU Usage'),
        confidence: 0.92,
        generatedAt: expect.any(Date),
      });
    });

    it('queries only active alerts for the given organization', async () => {
      prisma.alert.findMany.mockResolvedValue([]);

      await service.getResponses(ORG_ID);

      expect(prisma.alert.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, status: 'active' },
        include: { system: { select: { sid: true } } },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('enforces tenant isolation via organizationId', async () => {
      prisma.alert.findMany.mockResolvedValue([]);

      await service.getResponses('org-other');

      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-other' }),
        }),
      );
    });

    it('returns high confidence for critical alerts', async () => {
      prisma.alert.findMany.mockResolvedValue([
        mockAlert({ level: 'critical' }),
      ]);

      const result = await service.getResponses(ORG_ID);

      expect(result[0].confidence).toBe(0.92);
      expect(result[0].insight).toContain('immediate remediation');
    });

    it('returns lower confidence for non-critical alerts', async () => {
      prisma.alert.findMany.mockResolvedValue([
        mockAlert({
          id: 'alert-2',
          level: 'warning',
          title: 'Disk usage high',
        }),
      ]);

      const result = await service.getResponses(ORG_ID);

      expect(result[0].confidence).toBe(0.78);
      expect(result[0].insight).toContain('monitoring trends');
    });

    it('returns empty array when no active alerts exist', async () => {
      prisma.alert.findMany.mockResolvedValue([]);

      const result = await service.getResponses(ORG_ID);

      expect(result).toEqual([]);
    });

    it('maps multiple alerts correctly', async () => {
      prisma.alert.findMany.mockResolvedValue([
        mockAlert({ id: 'a-1', title: 'Alert 1', level: 'critical' }),
        mockAlert({
          id: 'a-2',
          title: 'Alert 2',
          level: 'warning',
          system: { sid: 'DEV' },
        }),
        mockAlert({ id: 'a-3', title: 'Alert 3', level: 'info' }),
      ]);

      const result = await service.getResponses(ORG_ID);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('ai-a-1');
      expect(result[1].id).toBe('ai-a-2');
      expect(result[1].system).toBe('DEV');
      expect(result[2].id).toBe('ai-a-3');
    });

    it('uses alert createdAt as generatedAt', async () => {
      const fixedDate = new Date('2025-06-01T12:00:00Z');
      prisma.alert.findMany.mockResolvedValue([
        mockAlert({ createdAt: fixedDate }),
      ]);

      const result = await service.getResponses(ORG_ID);

      expect(result[0].generatedAt).toBe(fixedDate);
    });
  });
});
