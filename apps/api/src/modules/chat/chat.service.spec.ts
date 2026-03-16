import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      system: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([
          {
            sid: 'EP1',
            status: 'healthy',
            healthScore: 95,
            environment: 'production',
          },
        ]),
      },
      alert: {
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a-1',
            title: 'CPU high',
            level: 'critical',
            system: { sid: 'EP1' },
          },
        ]),
      },
    };

    // Default: active alerts = 3, critical = 1
    prisma.alert.count
      .mockResolvedValueOnce(3) // activeAlerts
      .mockResolvedValueOnce(1); // criticalCount

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('LOCAL_SIMULATED') },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ── status / estado / resumen ──

  describe('processMessage — status keywords', () => {
    it.each(['estado', 'status', 'resumen'])(
      'responds to "%s" with status_summary',
      async (keyword) => {
        // Re-mock alert.count for each call (consumed by mockResolvedValueOnce)
        prisma.alert.count = jest
          .fn()
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(1);

        const result = await service.processMessage(ORG_ID, keyword);

        expect(result.type).toBe('status_summary');
        expect((result as any).data).toEqual(
          expect.objectContaining({
            systemCount: 5,
            activeAlerts: 3,
            criticalCount: 1,
          }),
        );
        expect(result.suggestions).toBeDefined();
      },
    );
  });

  // ── alerta ──

  describe('processMessage — alert keywords', () => {
    it('responds to "alerta" with alert_list', async () => {
      prisma.alert.count = jest
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);

      const result = await service.processMessage(
        ORG_ID,
        'Ver mis alertas activas',
      );

      expect(result.type).toBe('alert_list');
      expect((result as any).data).toHaveLength(1);
      expect(((result as any).data as any[])[0]).toEqual(
        expect.objectContaining({ id: 'a-1', system: 'EP1' }),
      );
    });
  });

  // ── sistema ──

  describe('processMessage — system keywords', () => {
    it('responds to "sistema" with system_list', async () => {
      prisma.alert.count = jest
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);

      const result = await service.processMessage(ORG_ID, 'Listar sistemas');

      expect(result.type).toBe('system_list');
      expect((result as any).data).toHaveLength(1);
      expect(((result as any).data as any[])[0]).toEqual(
        expect.objectContaining({ sid: 'EP1' }),
      );
    });
  });

  // ── generic ──

  describe('processMessage — generic message', () => {
    it('returns general type for unknown input', async () => {
      prisma.alert.count = jest
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);

      const result = await service.processMessage(ORG_ID, 'hola mundo');

      expect(result.type).toBe('general');
      expect(result.message).toContain('hola mundo');
      expect(result.suggestions).toBeDefined();
    });
  });
});
