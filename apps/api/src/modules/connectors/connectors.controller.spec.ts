import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  heartbeat: jest.fn(),
};

describe('ConnectorsController', () => {
  let controller: ConnectorsController;
  let service: ConnectorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectorsController],
      providers: [{ provide: ConnectorsService, useValue: mockService }],
    }).compile();

    controller = module.get(ConnectorsController);
    service = module.get(ConnectorsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to connectorsService.findAll with orgId', async () => {
      const expected = [{ id: 'conn-1' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1');

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1');
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('delegates to connectorsService.findOne with orgId and id', async () => {
      const expected = { id: 'conn-1', name: 'Agent A' };
      mockService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('org-1', 'conn-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('org-1', 'conn-1');
    });
  });

  // ── heartbeat ──

  describe('heartbeat', () => {
    it('delegates to connectorsService.heartbeat with orgId and id', async () => {
      const expected = { id: 'conn-1', lastHeartbeat: '2026-01-01T00:00:00Z' };
      mockService.heartbeat.mockResolvedValue(expected);

      const result = await controller.heartbeat('org-1', 'conn-1');

      expect(result).toEqual(expected);
      expect(service.heartbeat).toHaveBeenCalledWith('org-1', 'conn-1');
    });
  });
});
