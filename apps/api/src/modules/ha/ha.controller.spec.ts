import { Test, TestingModule } from '@nestjs/testing';
import { HAController } from './ha.controller';
import { HAService } from './ha.service';

const mockService = {
  findAll: jest.fn(),
  findBySystem: jest.fn(),
  triggerFailover: jest.fn(),
  updateStatus: jest.fn(),
  getPrereqs: jest.fn(),
  getOpsHistory: jest.fn(),
  getDrivers: jest.fn(),
};

describe('HAController', () => {
  let controller: HAController;
  let service: HAService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HAController],
      providers: [{ provide: HAService, useValue: mockService }],
    }).compile();

    controller = module.get(HAController);
    service = module.get(HAService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to haService.findAll with orgId', async () => {
      const expected = [{ systemId: 'sys-1', mode: 'active-passive' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1');

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1');
    });
  });

  // ── findBySystem ──

  describe('findBySystem', () => {
    it('delegates to haService.findBySystem with orgId and systemId', async () => {
      const expected = { systemId: 'sys-1', mode: 'active-passive' };
      mockService.findBySystem.mockResolvedValue(expected);

      const result = await controller.findBySystem('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.findBySystem).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });

  // ── triggerFailover ──

  describe('triggerFailover', () => {
    it('delegates to haService.triggerFailover with orgId, systemId, and user email', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'admin',
      } as any;
      const expected = { success: true };
      mockService.triggerFailover.mockResolvedValue(expected);

      const result = await controller.triggerFailover('org-1', 'sys-1', user);

      expect(result).toEqual(expected);
      expect(service.triggerFailover).toHaveBeenCalledWith(
        'org-1',
        'sys-1',
        'admin@test.com',
      );
    });
  });

  // ── updateStatus ──

  describe('updateStatus', () => {
    it('delegates to haService.updateStatus with orgId, systemId, and status', async () => {
      const data = { status: 'SYNCED' } as any;
      const expected = { systemId: 'sys-1', status: 'SYNCED' };
      mockService.updateStatus.mockResolvedValue(expected);

      const result = await controller.updateStatus('org-1', 'sys-1', data);

      expect(result).toEqual(expected);
      expect(service.updateStatus).toHaveBeenCalledWith(
        'org-1',
        'sys-1',
        'SYNCED',
      );
    });
  });

  // ── getPrereqs ──

  describe('getPrereqs', () => {
    it('delegates to haService.getPrereqs with orgId and systemId', async () => {
      const expected = [{ check: 'Network', passed: true }];
      mockService.getPrereqs.mockResolvedValue(expected);

      const result = await controller.getPrereqs('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getPrereqs).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });

  // ── getOpsHistory ──

  describe('getOpsHistory', () => {
    it('delegates to haService.getOpsHistory with orgId and systemId', async () => {
      const expected = [{ id: 'ops-1', action: 'failover' }];
      mockService.getOpsHistory.mockResolvedValue(expected);

      const result = await controller.getOpsHistory('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getOpsHistory).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });

  // ── getDrivers ──

  describe('getDrivers', () => {
    it('delegates to haService.getDrivers with orgId and systemId', async () => {
      const expected = [{ name: 'Pacemaker', version: '2.1' }];
      mockService.getDrivers.mockResolvedValue(expected);

      const result = await controller.getDrivers('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getDrivers).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });
});
