import { Test, TestingModule } from '@nestjs/testing';
import { SystemsController } from './systems.controller';
import { SystemsService } from './systems.service';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getHealthSummary: jest.fn(),
};

describe('SystemsController', () => {
  let controller: SystemsController;
  let service: SystemsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemsController],
      providers: [{ provide: SystemsService, useValue: mockService }],
    }).compile();

    controller = module.get(SystemsController);
    service = module.get(SystemsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to systemsService.findAll with orgId', async () => {
      const expected = [{ id: 'sys-1' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1');

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1');
    });
  });

  // ── healthSummary ──

  describe('healthSummary', () => {
    it('delegates to systemsService.getHealthSummary with orgId', async () => {
      const expected = { total: 3, healthy: 2, warning: 1, critical: 0 };
      mockService.getHealthSummary.mockResolvedValue(expected);

      const result = await controller.healthSummary('org-1');

      expect(result).toEqual(expected);
      expect(service.getHealthSummary).toHaveBeenCalledWith('org-1');
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('delegates to systemsService.findOne with orgId and id', async () => {
      const expected = { id: 'sys-1', sid: 'EP1' };
      mockService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });

  // ── create ──

  describe('create', () => {
    it('delegates to systemsService.create with orgId and dto', async () => {
      const dto = { sid: 'NEW', description: 'New System' } as any;
      const expected = { id: 'sys-2', sid: 'NEW' };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create('org-1', dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith('org-1', dto);
    });
  });

  // ── update ──

  describe('update', () => {
    it('delegates to systemsService.update with orgId, id and dto', async () => {
      const dto = { description: 'Updated' } as any;
      const expected = { id: 'sys-1', description: 'Updated' };
      mockService.update.mockResolvedValue(expected);

      const result = await controller.update('org-1', 'sys-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('org-1', 'sys-1', dto);
    });
  });

  // ── remove ──

  describe('remove', () => {
    it('delegates to systemsService.remove with orgId and id', async () => {
      const expected = { deleted: true };
      mockService.remove.mockResolvedValue(expected);

      const result = await controller.remove('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });
});
