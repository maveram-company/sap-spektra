import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

const mockService = {
  getUseCases: jest.fn(),
  getResponses: jest.fn(),
};

describe('AiController', () => {
  let controller: AiController;
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: mockService }],
    }).compile();

    controller = module.get(AiController);
    service = module.get(AiService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── useCases ──

  describe('useCases', () => {
    it('delegates to aiService.getUseCases', async () => {
      const expected = [{ id: 'uc-1', name: 'Log Analysis' }];
      mockService.getUseCases.mockResolvedValue(expected);

      const result = await controller.useCases();

      expect(result).toEqual(expected);
      expect(service.getUseCases).toHaveBeenCalledWith();
    });
  });

  // ── responses ──

  describe('responses', () => {
    it('delegates to aiService.getResponses with orgId', async () => {
      const expected = [{ id: 'resp-1', insight: 'CPU spike detected' }];
      mockService.getResponses.mockResolvedValue(expected);

      const result = await controller.responses('org-1');

      expect(result).toEqual(expected);
      expect(service.getResponses).toHaveBeenCalledWith('org-1');
    });
  });
});
