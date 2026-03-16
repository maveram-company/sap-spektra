import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from '../auth.service';
import { JwtPayload } from '../../../common/decorators/current-user.decorator';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: { validateUser: jest.Mock };

  const mockPayload: JwtPayload = {
    sub: 'u-1',
    email: 'user@test.com',
    organizationId: 'org-1',
    role: 'admin',
  };

  beforeEach(async () => {
    authService = {
      validateUser: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('returns the validated payload for an active user', async () => {
    authService.validateUser.mockResolvedValue(mockPayload);

    const result = await strategy.validate(mockPayload);

    expect(authService.validateUser).toHaveBeenCalledWith(mockPayload);
    expect(result).toEqual(mockPayload);
  });

  it('throws UnauthorizedException when user does not exist', async () => {
    authService.validateUser.mockRejectedValue(
      new UnauthorizedException('User not found or disabled'),
    );

    await expect(strategy.validate(mockPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when user is disabled', async () => {
    authService.validateUser.mockRejectedValue(
      new UnauthorizedException('User not found or disabled'),
    );

    await expect(
      strategy.validate({ ...mockPayload, sub: 'u-disabled' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('delegates validation entirely to AuthService.validateUser', async () => {
    const customPayload: JwtPayload = {
      sub: 'u-2',
      email: 'other@test.com',
      organizationId: 'org-2',
      role: 'operator',
    };
    authService.validateUser.mockResolvedValue(customPayload);

    const result = await strategy.validate(customPayload);

    expect(authService.validateUser).toHaveBeenCalledTimes(1);
    expect(result).toBe(customPayload);
  });
});
