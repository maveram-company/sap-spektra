import { Test, TestingModule } from '@nestjs/testing';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

const mockService = {
  findOne: jest.fn(),
  update: jest.fn(),
  getStats: jest.fn(),
};

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: TenantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [{ provide: TenantsService, useValue: mockService }],
    }).compile();

    controller = module.get(TenantsController);
    service = module.get(TenantsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findOne ──

  describe('findOne', () => {
    it('delegates to tenantsService.findOne with orgId', async () => {
      const expected = { id: 'org-1', name: 'Acme' };
      mockService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('org-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('org-1');
    });
  });

  // ── update ──

  describe('update', () => {
    it('delegates to tenantsService.update with orgId and data', async () => {
      const data = { name: 'Acme Updated' } as any;
      const expected = { id: 'org-1', name: 'Acme Updated' };
      mockService.update.mockResolvedValue(expected);

      const result = await controller.update('org-1', data);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('org-1', data);
    });
  });

  // ── stats ──

  describe('stats', () => {
    it('delegates to tenantsService.getStats with orgId', async () => {
      const expected = { users: 5, systems: 3 };
      mockService.getStats.mockResolvedValue(expected);

      const result = await controller.stats('org-1');

      expect(result).toEqual(expected);
      expect(service.getStats).toHaveBeenCalledWith('org-1');
    });
  });
});
