import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockEvent(overrides = {}) {
  return {
    id: 'evt-1',
    organizationId: ORG_ID,
    systemId: 'sys-1',
    level: 'info',
    source: 'monitoring',
    message: 'System check passed',
    timestamp: new Date(),
    system: { sid: 'EP1' },
    ...overrides,
  };
}

describe('EventsService', () => {
  let service: EventsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      event: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns events for the organization', async () => {
      const events = [mockEvent(), mockEvent({ id: 'evt-2' })];
      prisma.event.findMany.mockResolvedValue(events);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(2);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID }),
        }),
      );
    });

    it('filters by level when provided', async () => {
      prisma.event.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { level: 'error' });

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            level: 'error',
          }),
        }),
      );
    });

    it('filters by source when provided', async () => {
      prisma.event.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { source: 'sap_router' });

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            source: 'sap_router',
          }),
        }),
      );
    });

    it('filters by systemId when provided', async () => {
      prisma.event.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { systemId: 'sys-5' });

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            systemId: 'sys-5',
          }),
        }),
      );
    });

    it('respects limit when provided', async () => {
      prisma.event.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { limit: 25 });

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 }),
      );
    });

    it('defaults limit to 100 when not provided', async () => {
      prisma.event.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('orders events by timestamp descending', async () => {
      prisma.event.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { timestamp: 'desc' } }),
      );
    });
  });
});
