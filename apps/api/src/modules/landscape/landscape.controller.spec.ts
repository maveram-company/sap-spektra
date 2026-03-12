import { Test, TestingModule } from '@nestjs/testing';
import { LandscapeController } from './landscape.controller';
import { LandscapeService } from './landscape.service';

const mockService = {
  getValidation: jest.fn(),
};

describe('LandscapeController', () => {
  let controller: LandscapeController;
  let service: LandscapeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LandscapeController],
      providers: [{ provide: LandscapeService, useValue: mockService }],
    }).compile();

    controller = module.get(LandscapeController);
    service = module.get(LandscapeService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── validation ──

  describe('validation', () => {
    it('delegates to landscapeService.getValidation with orgId', async () => {
      const expected = { checks: [{ system: 'EP1', status: 'pass' }] };
      mockService.getValidation.mockResolvedValue(expected);

      const result = await controller.validation('org-1');

      expect(result).toEqual(expected);
      expect(service.getValidation).toHaveBeenCalledWith('org-1');
    });
  });
});
