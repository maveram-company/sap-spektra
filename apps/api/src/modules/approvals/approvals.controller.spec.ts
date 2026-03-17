import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  process: jest.fn(),
};

describe('ApprovalsController', () => {
  let controller: ApprovalsController;
  let service: ApprovalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprovalsController],
      providers: [{ provide: ApprovalsService, useValue: mockService }],
    }).compile();

    controller = module.get(ApprovalsController);
    service = module.get(ApprovalsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to approvalsService.findAll with orgId and query params', async () => {
      const expected = [{ id: 'appr-1' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1', {
        status: 'PENDING',
        systemId: 'sys-1',
      });

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1', {
        status: 'PENDING',
        systemId: 'sys-1',
      });
    });

    it('passes undefined when no query params are provided', async () => {
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll('org-1', {});

      expect(service.findAll).toHaveBeenCalledWith('org-1', {});
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('delegates to approvalsService.findOne with orgId and id', async () => {
      const expected = { id: 'appr-1', status: 'PENDING' };
      mockService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('org-1', 'appr-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('org-1', 'appr-1');
    });
  });

  // ── create ──

  describe('create', () => {
    it('delegates to approvalsService.create with orgId and data including requestedBy', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'operator',
      } as any;
      const dto = { title: 'Deploy patch', systemId: 'sys-1' } as any;
      const expected = { id: 'appr-2', title: 'Deploy patch' };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create('org-1', user, dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith('org-1', {
        title: 'Deploy patch',
        systemId: 'sys-1',
        requestedBy: 'admin@test.com',
      });
    });
  });

  // ── approve ──

  describe('approve', () => {
    it('delegates to approvalsService.process with APPROVED status', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'escalation',
      } as any;
      const expected = { id: 'appr-1', status: 'APPROVED' };
      mockService.process.mockResolvedValue(expected);

      const result = await controller.approve('org-1', 'appr-1', user);

      expect(result).toEqual(expected);
      expect(service.process).toHaveBeenCalledWith(
        'org-1',
        'appr-1',
        'APPROVED',
        'admin@test.com',
      );
    });
  });

  // ── reject ──

  describe('reject', () => {
    it('delegates to approvalsService.process with REJECTED status', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'escalation',
      } as any;
      const expected = { id: 'appr-1', status: 'REJECTED' };
      mockService.process.mockResolvedValue(expected);

      const result = await controller.reject('org-1', 'appr-1', user);

      expect(result).toEqual(expected);
      expect(service.process).toHaveBeenCalledWith(
        'org-1',
        'appr-1',
        'REJECTED',
        'admin@test.com',
      );
    });
  });
});
