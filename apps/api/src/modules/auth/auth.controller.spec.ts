import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockService = {
  login: jest.fn(),
  register: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockService }],
    }).compile();

    controller = module.get(AuthController);
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── login ──

  describe('login', () => {
    it('delegates to authService.login with dto', async () => {
      const dto = { email: 'admin@test.com', password: 'secret123' } as any;
      const expected = {
        access_token: 'jwt-token',
        user: { email: 'admin@test.com' },
      };
      mockService.login.mockResolvedValue(expected);

      const result = await controller.login(dto);

      expect(result).toEqual(expected);
      expect(service.login).toHaveBeenCalledWith(dto);
    });
  });

  // ── register ──

  describe('register', () => {
    it('delegates to authService.register with dto', async () => {
      const dto = {
        email: 'new@test.com',
        password: 'secret123',
        orgName: 'TestOrg',
      } as any;
      const expected = {
        access_token: 'jwt-token',
        user: { email: 'new@test.com' },
      };
      mockService.register.mockResolvedValue(expected);

      const result = await controller.register(dto);

      expect(result).toEqual(expected);
      expect(service.register).toHaveBeenCalledWith(dto);
    });
  });

  // ── me ──

  describe('me', () => {
    it('returns the current user payload directly', () => {
      const user = {
        sub: 'u-1',
        email: 'admin@test.com',
        orgId: 'org-1',
        role: 'admin',
      } as any;

      const result = controller.me(user);

      expect(result).toEqual(user);
    });
  });
});
