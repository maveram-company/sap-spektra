import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function mockContext(role?: string): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role, organizationId: 'org-1' } : {} }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext('viewer'))).toBe(true);
  });

  it('allows admin to access viewer-level endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['viewer']);
    expect(guard.canActivate(mockContext('admin'))).toBe(true);
  });

  it('allows operator to access operator-level endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['operator']);
    expect(guard.canActivate(mockContext('operator'))).toBe(true);
  });

  it('denies viewer access to admin-level endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(() => guard.canActivate(mockContext('viewer'))).toThrow(ForbiddenException);
  });

  it('denies viewer access to operator-level endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['operator']);
    expect(() => guard.canActivate(mockContext('viewer'))).toThrow(ForbiddenException);
  });

  it('denies operator access to escalation-level endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['escalation']);
    expect(() => guard.canActivate(mockContext('operator'))).toThrow(ForbiddenException);
  });

  it('allows escalation to access operator-level endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['operator']);
    expect(guard.canActivate(mockContext('escalation'))).toBe(true);
  });

  it('throws when user has no role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['viewer']);
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });
});
