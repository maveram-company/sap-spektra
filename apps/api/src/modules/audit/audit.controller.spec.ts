import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

const mockService = {
  findAll: jest.fn(),
};

describe('AuditController', () => {
  let controller: AuditController;
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: mockService }],
    }).compile();

    controller = module.get(AuditController);
    service = module.get(AuditService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to auditService.findAll with orgId and parsed filters', async () => {
      const expected = [{ id: 'log-1', action: 'LOGIN' }];
      mockService.findAll.mockResolvedValue(expected);

      const filters = { severity: 'high', action: 'LOGIN', limit: '50' } as any;
      const result = await controller.findAll('org-1', filters);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1', {
        severity: 'high',
        action: 'LOGIN',
        limit: 50,
      });
    });

    it('passes undefined limit when not provided', async () => {
      const expected = [{ id: 'log-2' }];
      mockService.findAll.mockResolvedValue(expected);

      const filters = {
        severity: undefined,
        action: undefined,
        limit: undefined,
      } as any;
      const result = await controller.findAll('org-1', filters);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1', {
        severity: undefined,
        action: undefined,
        limit: undefined,
      });
    });
  });
});
