import { Test, TestingModule } from '@nestjs/testing';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

const mockService = {
  findAll: jest.fn(),
  getStats: jest.fn(),
  acknowledge: jest.fn(),
  resolve: jest.fn(),
};

describe('AlertsController', () => {
  let controller: AlertsController;
  let service: AlertsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [{ provide: AlertsService, useValue: mockService }],
    }).compile();

    controller = module.get(AlertsController);
    service = module.get(AlertsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to alertsService.findAll with orgId and filters', async () => {
      const filters = { severity: 'critical' } as any;
      const expected = [{ id: 'alert-1' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1', filters);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1', filters);
    });
  });

  // ── stats ──

  describe('stats', () => {
    it('delegates to alertsService.getStats with orgId', async () => {
      const expected = { total: 10, critical: 2, warning: 5 };
      mockService.getStats.mockResolvedValue(expected);

      const result = await controller.stats('org-1');

      expect(result).toEqual(expected);
      expect(service.getStats).toHaveBeenCalledWith('org-1');
    });
  });

  // ── acknowledge ──

  describe('acknowledge', () => {
    it('delegates to alertsService.acknowledge with orgId, id, and user email', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'operator',
      } as any;
      const expected = { id: 'alert-1', status: 'acknowledged' };
      mockService.acknowledge.mockResolvedValue(expected);

      const result = await controller.acknowledge('org-1', 'alert-1', user);

      expect(result).toEqual(expected);
      expect(service.acknowledge).toHaveBeenCalledWith(
        'org-1',
        'alert-1',
        'admin@test.com',
      );
    });
  });

  // ── resolve ──

  describe('resolve', () => {
    it('delegates to alertsService.resolve with orgId, id, user email, and data', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'operator',
      } as any;
      const data = { resolution: 'Fixed the issue' } as any;
      const expected = { id: 'alert-1', status: 'resolved' };
      mockService.resolve.mockResolvedValue(expected);

      const result = await controller.resolve('org-1', 'alert-1', user, data);

      expect(result).toEqual(expected);
      expect(service.resolve).toHaveBeenCalledWith(
        'org-1',
        'alert-1',
        'admin@test.com',
        data,
      );
    });
  });
});
