import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

function mockContext(authHeader?: string) {
  const request = {
    headers: { authorization: authHeader },
    user: undefined as any,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    request,
  } as any;
}

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      apiKey: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyAuthGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get<ApiKeyAuthGuard>(ApiKeyAuthGuard);
  });

  it('returns false for non-API-key bearer tokens', async () => {
    const ctx = mockContext('Bearer eyJhbGciOiJIUzI1NiJ9.test.sig');
    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('returns false when no authorization header is present', async () => {
    const ctx = mockContext(undefined);
    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('throws UnauthorizedException for invalid API key', async () => {
    prisma.apiKey.findMany.mockResolvedValue([]);
    const ctx = mockContext('Bearer sk-spektra-invalidkey12345');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts valid API key and sets request.user', async () => {
    const rawKey = 'sk-spektra-testapikey123456';
    const keyHash = await bcrypt.hash(rawKey, 10);
    const prefix = rawKey.substring(0, 12);

    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: 'key-1',
        prefix,
        keyHash,
        status: 'active',
        organizationId: 'org-1',
        organization: { slug: 'testorg' },
      },
    ]);

    const ctx = mockContext(`Bearer ${rawKey}`);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(ctx.request.user).toEqual({
      sub: 'apikey:key-1',
      email: 'agent@testorg.spektra',
      organizationId: 'org-1',
      role: 'operator',
      isApiKey: true,
    });
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });
});
