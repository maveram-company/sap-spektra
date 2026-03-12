import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const mockService = {
  findAll: jest.fn(),
};

describe('EventsController', () => {
  let controller: EventsController;
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: mockService }],
    }).compile();

    controller = module.get(EventsController);
    service = module.get(EventsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to eventsService.findAll with orgId and filters', async () => {
      const filters = {
        level: 'error',
        source: 'system',
        systemId: 'sys-1',
        limit: 50,
      } as any;
      const expected = [{ id: 'evt-1' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1', filters);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1', {
        level: 'error',
        source: 'system',
        systemId: 'sys-1',
        limit: 50,
      });
    });

    it('passes through undefined filter values', async () => {
      const filters = {} as any;
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll('org-1', filters);

      expect(service.findAll).toHaveBeenCalledWith('org-1', {
        level: undefined,
        source: undefined,
        systemId: undefined,
        limit: undefined,
      });
    });
  });
});
