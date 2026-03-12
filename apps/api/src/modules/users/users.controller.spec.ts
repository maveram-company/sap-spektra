import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockService }],
    }).compile();

    controller = module.get(UsersController);
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('delegates to usersService.findAll with orgId', async () => {
      const expected = [{ id: 'user-1', email: 'a@b.com' }];
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('org-1');

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith('org-1');
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('delegates to usersService.findOne with orgId and id', async () => {
      const expected = { id: 'user-1', email: 'a@b.com' };
      mockService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('org-1', 'user-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('org-1', 'user-1');
    });
  });

  // ── create ──

  describe('create', () => {
    it('delegates to usersService.create with orgId and dto', async () => {
      const dto = { email: 'new@b.com', role: 'viewer' } as any;
      const expected = { id: 'user-2', email: 'new@b.com' };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create('org-1', dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith('org-1', dto);
    });
  });

  // ── update ──

  describe('update', () => {
    it('delegates to usersService.update with orgId, id and dto', async () => {
      const dto = { role: 'admin' } as any;
      const expected = { id: 'user-1', role: 'admin' };
      mockService.update.mockResolvedValue(expected);

      const result = await controller.update('org-1', 'user-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('org-1', 'user-1', dto);
    });
  });

  // ── remove ──

  describe('remove', () => {
    it('delegates to usersService.remove with orgId and id', async () => {
      const expected = { deleted: true };
      mockService.remove.mockResolvedValue(expected);

      const result = await controller.remove('org-1', 'user-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('org-1', 'user-1');
    });
  });
});
