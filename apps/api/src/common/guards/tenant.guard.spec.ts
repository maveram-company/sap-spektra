import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

function mockContext(organizationId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: organizationId
          ? { organizationId, sub: 'u-1', role: 'admin' }
          : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard();
  });

  it('allows access when organizationId is present', () => {
    expect(guard.canActivate(mockContext('org-123'))).toBe(true);
  });

  it('throws ForbiddenException when organizationId is missing', () => {
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
    expect(() => guard.canActivate(mockContext())).toThrow('No tenant context');
  });

  it('throws ForbiddenException when user object is empty', () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: null }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
