import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

const mockService = {
  getSummary: jest.fn(),
};

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockService }],
    }).compile();

    controller = module.get(DashboardController);
    service = module.get(DashboardService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── getSummary ──

  describe('getSummary', () => {
    it('delegates to dashboardService.getSummary with orgId', async () => {
      const expected = { systems: 5, alerts: 3, operations: 10 };
      mockService.getSummary.mockResolvedValue(expected);

      const result = await controller.getSummary('org-1');

      expect(result).toEqual(expected);
      expect(service.getSummary).toHaveBeenCalledWith('org-1');
    });
  });
});
