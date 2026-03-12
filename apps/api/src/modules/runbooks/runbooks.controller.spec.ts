import { Test, TestingModule } from '@nestjs/testing';
import { RunbooksController } from './runbooks.controller';
import { RunbooksService } from './runbooks.service';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  getExecutions: jest.fn(),
  execute: jest.fn(),
};

describe('RunbooksController', () => {
  let controller: RunbooksController;
  let service: RunbooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunbooksController],
      providers: [{ provide: RunbooksService, useValue: mockService }],
    }).compile();

    controller = module.get(RunbooksController);
    service = module.get(RunbooksService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to runbooksService.findAll with orgId', async () => {
      const expected = [{ id: 'rb-1', name: 'Restart HANA' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1');

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1');
    });
  });

  // ── executions ──

  describe('executions', () => {
    it('delegates to runbooksService.getExecutions with orgId', async () => {
      const expected = [{ id: 'exec-1', runbookId: 'rb-1' }];
      mockService.getExecutions.mockResolvedValue(expected);

      const result = await controller.executions('org-1');

      expect(result).toEqual(expected);
      expect(service.getExecutions).toHaveBeenCalledWith('org-1');
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('delegates to runbooksService.findOne with orgId and id', async () => {
      const expected = { id: 'rb-1', name: 'Restart HANA' };
      mockService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('org-1', 'rb-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('org-1', 'rb-1');
    });
  });

  // ── execute ──

  describe('execute', () => {
    it('delegates to runbooksService.execute with orgId, id, systemId, user email, and dryRun', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'operator',
      } as any;
      const body = { systemId: 'sys-1', dryRun: true };
      const expected = { executionId: 'exec-1', status: 'RUNNING' };
      mockService.execute.mockResolvedValue(expected);

      const result = await controller.execute('org-1', 'rb-1', user, body);

      expect(result).toEqual(expected);
      expect(service.execute).toHaveBeenCalledWith(
        'org-1',
        'rb-1',
        'sys-1',
        'admin@test.com',
        true,
      );
    });

    it('passes undefined dryRun when not provided', async () => {
      const user = {
        email: 'admin@test.com',
        sub: 'u-1',
        orgId: 'org-1',
        role: 'operator',
      } as any;
      const body = { systemId: 'sys-1' };
      mockService.execute.mockResolvedValue({});

      await controller.execute('org-1', 'rb-1', user, body);

      expect(service.execute).toHaveBeenCalledWith(
        'org-1',
        'rb-1',
        'sys-1',
        'admin@test.com',
        undefined,
      );
    });
  });
});
