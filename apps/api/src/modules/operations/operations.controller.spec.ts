import { Test, TestingModule } from '@nestjs/testing';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

const mockService = {
  findAll: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  getJobs: jest.fn(),
  getTransports: jest.fn(),
  getCertificates: jest.fn(),
};

describe('OperationsController', () => {
  let controller: OperationsController;
  let service: OperationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [{ provide: OperationsService, useValue: mockService }],
    }).compile();

    controller = module.get(OperationsController);
    service = module.get(OperationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to operationsService.findAll with orgId and query params', async () => {
      const expected = [{ id: 'op-1' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1', {
        status: 'RUNNING',
        type: 'PATCH',
        systemId: 'sys-1',
      });

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1', {
        status: 'RUNNING',
        type: 'PATCH',
        systemId: 'sys-1',
      });
    });
  });

  // ── create ──

  describe('create', () => {
    it('delegates to operationsService.create with orgId and data including requestedBy', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'operator',
      } as any;
      const dto = { type: 'PATCH', systemId: 'sys-1' } as any;
      const expected = { id: 'op-2' };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create('org-1', user, dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith('org-1', {
        type: 'PATCH',
        systemId: 'sys-1',
        requestedBy: 'admin@test.com',
      });
    });
  });

  // ── updateStatus ──

  describe('updateStatus', () => {
    it('delegates to operationsService.updateStatus with orgId, id, user, and status', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'operator',
      } as any;
      const data = { status: 'COMPLETED' } as any;
      const expected = { id: 'op-1', status: 'COMPLETED' };
      mockService.updateStatus.mockResolvedValue(expected);

      const result = await controller.updateStatus('org-1', 'op-1', user, data);

      expect(result).toEqual(expected);
      expect(service.updateStatus).toHaveBeenCalledWith(
        'org-1',
        'op-1',
        'COMPLETED',
        'admin@test.com',
      );
    });
  });

  // ── jobs ──

  describe('jobs', () => {
    it('delegates to operationsService.getJobs with orgId and systemId', async () => {
      const expected = [{ id: 'job-1' }];
      mockService.getJobs.mockResolvedValue(expected);

      const result = await controller.jobs('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getJobs).toHaveBeenCalledWith('org-1', 'sys-1');
    });

    it('passes undefined when no systemId provided', async () => {
      mockService.getJobs.mockResolvedValue([]);

      await controller.jobs('org-1', undefined);

      expect(service.getJobs).toHaveBeenCalledWith('org-1', undefined);
    });
  });

  // ── transports ──

  describe('transports', () => {
    it('delegates to operationsService.getTransports with orgId and systemId', async () => {
      const expected = [{ id: 'tr-1' }];
      mockService.getTransports.mockResolvedValue(expected);

      const result = await controller.transports('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getTransports).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });

  // ── certificates ──

  describe('certificates', () => {
    it('delegates to operationsService.getCertificates with orgId and systemId', async () => {
      const expected = [{ id: 'cert-1' }];
      mockService.getCertificates.mockResolvedValue(expected);

      const result = await controller.certificates('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getCertificates).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });
});
