import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

const mockService = {
  getOverview: jest.fn(),
  getRunbookAnalytics: jest.fn(),
  getSystemTrends: jest.fn(),
};

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: mockService }],
    }).compile();

    controller = module.get(AnalyticsController);
    service = module.get(AnalyticsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── overview ──

  describe('overview', () => {
    it('delegates to analyticsService.getOverview with orgId', async () => {
      const expected = { totalRunbooks: 10, avgDuration: 45 };
      mockService.getOverview.mockResolvedValue(expected);

      const result = await controller.overview('org-1');

      expect(result).toEqual(expected);
      expect(service.getOverview).toHaveBeenCalledWith('org-1');
    });
  });

  // ── runbooks ──

  describe('runbooks', () => {
    it('delegates to analyticsService.getRunbookAnalytics with orgId', async () => {
      const expected = [{ runbookId: 'rb-1', executions: 5 }];
      mockService.getRunbookAnalytics.mockResolvedValue(expected);

      const result = await controller.runbooks('org-1');

      expect(result).toEqual(expected);
      expect(service.getRunbookAnalytics).toHaveBeenCalledWith('org-1');
    });
  });

  // ── systemTrends ──

  describe('systemTrends', () => {
    it('delegates to analyticsService.getSystemTrends with orgId, systemId, and parsed days', async () => {
      const expected = [{ date: '2024-01-01', health: 95 }];
      mockService.getSystemTrends.mockResolvedValue(expected);

      const query = { days: '14' } as any;
      const result = await controller.systemTrends('org-1', 'sys-1', query);

      expect(result).toEqual(expected);
      expect(service.getSystemTrends).toHaveBeenCalledWith(
        'org-1',
        'sys-1',
        14,
      );
    });

    it('defaults to 7 days when query.days is not provided', async () => {
      const expected = [{ date: '2024-01-01', health: 90 }];
      mockService.getSystemTrends.mockResolvedValue(expected);

      const query = {} as any;
      const result = await controller.systemTrends('org-1', 'sys-1', query);

      expect(result).toEqual(expected);
      expect(service.getSystemTrends).toHaveBeenCalledWith('org-1', 'sys-1', 7);
    });
  });
});
