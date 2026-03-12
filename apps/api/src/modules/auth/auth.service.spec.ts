import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

jest.mock('bcryptjs');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: Record<string, any>;
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-jwt-token') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    jwt = module.get(JwtService);
  });

  describe('login', () => {
    const loginDto = { email: 'admin@test.com', password: 'pass123' };

    it('returns token and user on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'admin@test.com',
        name: 'Admin',
        passwordHash: 'hashed',
        memberships: [
          { organizationId: 'org-1', role: 'admin', organization: { name: 'Test Org', slug: 'test-org' } },
        ],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({});

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('admin@test.com');
      expect(result.user.role).toBe('admin');
      expect(result.user.organizationId).toBe('org-1');
    });

    it('throws UnauthorizedException for unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'admin@test.com',
        passwordHash: 'hashed',
        memberships: [{ organizationId: 'org-1', role: 'admin', organization: { name: 'Test' } }],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user has no organization', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'admin@test.com',
        passwordHash: 'hashed',
        memberships: [],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('updates lastLoginAt on successful login', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'admin@test.com',
        passwordHash: 'hashed',
        memberships: [
          { organizationId: 'org-1', role: 'viewer', organization: { name: 'Org', slug: 'org' } },
        ],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({});

      await service.login(loginDto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('includes organizationId in JWT payload for tenant isolation', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'admin@test.com',
        passwordHash: 'hashed',
        memberships: [
          { organizationId: 'org-42', role: 'operator', organization: { name: 'Org', slug: 'org' } },
        ],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({});

      await service.login(loginDto);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-42' }),
      );
    });
  });

  describe('register', () => {
    const registerDto = {
      email: 'new@test.com',
      password: 'pass123',
      name: 'New User',
      organizationName: 'New Org',
    };

    it('throws ConflictException for existing email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });

    it('creates org with slug derived from name', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      prisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          organization: {
            create: jest.fn().mockResolvedValue({ id: 'org-new', name: 'New Org', slug: 'new-org' }),
          },
          user: {
            create: jest.fn().mockResolvedValue({ id: 'u-new', email: 'new@test.com', name: 'New User' }),
          },
          membership: { create: jest.fn() },
        };
        return fn(tx);
      });

      const result = await service.register(registerDto);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.role).toBe('admin');
    });
  });

  describe('validateUser', () => {
    it('returns payload for active user', async () => {
      const payload = { sub: 'u-1', email: 'a@b.com', organizationId: 'org-1', role: 'admin' };
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', status: 'active' });

      const result = await service.validateUser(payload);
      expect(result).toEqual(payload);
    });

    it('throws for disabled user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', status: 'disabled' });
      await expect(
        service.validateUser({ sub: 'u-1', email: 'a@b.com', organizationId: 'org-1', role: 'admin' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.validateUser({ sub: 'gone', email: 'a@b.com', organizationId: 'org-1', role: 'admin' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
