import { Test, TestingModule } from '@nestjs/testing';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

const mockService = {
  findAll: jest.fn(),
  findByTier: jest.fn(),
};

describe('PlansController', () => {
  let controller: PlansController;
  let service: PlansService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlansController],
      providers: [{ provide: PlansService, useValue: mockService }],
    }).compile();

    controller = module.get(PlansController);
    service = module.get(PlansService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to plansService.findAll', async () => {
      const expected = [{ tier: 'free' }, { tier: 'pro' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith();
    });
  });

  // ── findByTier ──

  describe('findByTier', () => {
    it('delegates to plansService.findByTier with tier param', async () => {
      const expected = { tier: 'pro', price: 99 };
      mockService.findByTier.mockResolvedValue(expected);

      const result = await controller.findByTier('pro');

      expect(result).toEqual(expected);
      expect(service.findByTier).toHaveBeenCalledWith('pro');
    });
  });
});
