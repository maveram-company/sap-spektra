import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConnectorsService } from './connectors.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ORG_ID = 'org-test-1';

function mockConnector(overrides = {}) {
  return {
    id: 'conn-1',
    organizationId: ORG_ID,
    systemId: 'sys-1',
    method: 'AGENT',
    status: 'connected',
    lastHeartbeat: new Date(),
    system: { sid: 'EP1' },
    ...overrides,
  };
}

describe('ConnectorsService', () => {
  let service: ConnectorsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      connector: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback: string) => {
              if (key === 'RUNTIME_MODE') return 'LOCAL_SIMULATED';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ConnectorsService>(ConnectorsService);
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns all connectors for the organization', async () => {
      prisma.connector.findMany.mockResolvedValue([mockConnector()]);
      const result = await service.findAll(ORG_ID);
      expect(result).toHaveLength(1);
    });

    it('enforces tenant isolation', async () => {
      prisma.connector.findMany.mockResolvedValue([]);
      await service.findAll('org-other');

      expect(prisma.connector.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-other' } }),
      );
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('returns connector when found', async () => {
      prisma.connector.findFirst.mockResolvedValue(mockConnector());
      const result = await service.findOne(ORG_ID, 'conn-1');
      expect(result.method).toBe('AGENT');
    });

    it('throws NotFoundException for missing connector', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);
      await expect(service.findOne(ORG_ID, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── heartbeat ──

  describe('heartbeat', () => {
    it('updates last heartbeat and sets status to connected', async () => {
      prisma.connector.findFirst.mockResolvedValue(
        mockConnector({ status: 'disconnected' }),
      );
      prisma.connector.update.mockResolvedValue(
        mockConnector({ status: 'connected' }),
      );

      const result = await service.heartbeat(ORG_ID, 'conn-1');
      expect(result.status).toBe('connected');

      expect(prisma.connector.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'connected' }),
        }),
      );
    });

    it('throws NotFoundException for missing connector', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);
      await expect(service.heartbeat(ORG_ID, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('enforces tenant isolation on heartbeat', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);
      await service.heartbeat('org-other', 'conn-1').catch(() => {});

      expect(prisma.connector.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conn-1', organizationId: 'org-other' },
        }),
      );
    });
  });
});
