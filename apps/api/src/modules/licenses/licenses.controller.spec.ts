import { Test, TestingModule } from '@nestjs/testing';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';

const mockService = {
  getLicenses: jest.fn(),
};

describe('LicensesController', () => {
  let controller: LicensesController;
  let service: LicensesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LicensesController],
      providers: [{ provide: LicensesService, useValue: mockService }],
    }).compile();

    controller = module.get(LicensesController);
    service = module.get(LicensesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── getLicenses ──

  describe('getLicenses', () => {
    it('delegates to licensesService.getLicenses with orgId', async () => {
      const expected = [
        { system: 'EP1', type: 'Production', expiry: '2025-12-31' },
      ];
      mockService.getLicenses.mockResolvedValue(expected);

      const result = await controller.getLicenses('org-1');

      expect(result).toEqual(expected);
      expect(service.getLicenses).toHaveBeenCalledWith('org-1');
    });
  });
});
