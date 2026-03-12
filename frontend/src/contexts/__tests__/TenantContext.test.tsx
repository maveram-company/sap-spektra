import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Mock AuthContext ─────────────────────────────────────────────────────────

let mockUser: Record<string, unknown> | null = null;

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import { TenantProvider, useTenant } from '../TenantContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return <TenantProvider>{children}</TenantProvider>;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TenantProvider – initial state', () => {
  beforeEach(() => {
    mockUser = null;
  });

  it('throws when useTenant is called outside TenantProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTenant())).toThrow(
      'useTenant must be used within TenantProvider',
    );
    spy.mockRestore();
  });

  it('provides default organization when user is null', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });

    expect(result.current.organization).toBeDefined();
    expect(result.current.organization.name).toBe('Demo Organization');
    expect(result.current.organization.plan).toBe('professional');
  });

  it('provides loading=false', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    expect(result.current.loading).toBe(false);
  });

  it('merges user organization with defaults', () => {
    mockUser = {
      organization: { id: 'org-custom', name: 'Custom Org', plan: 'enterprise' },
    };

    const { result } = renderHook(() => useTenant(), { wrapper });
    expect(result.current.organization.id).toBe('org-custom');
    expect(result.current.organization.name).toBe('Custom Org');
    expect(result.current.organization.plan).toBe('enterprise');
    // Default fields should still be present from spread
    expect(result.current.organization.settings).toBeDefined();
  });

  it('uses default org when user has no organization', () => {
    mockUser = { id: 'user-1', role: 'admin' };

    const { result } = renderHook(() => useTenant(), { wrapper });
    expect(result.current.organization.name).toBe('Demo Organization');
  });
});

describe('TenantProvider – updateSettings', () => {
  beforeEach(() => {
    mockUser = null;
  });

  it('merges new settings into existing settings', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });

    act(() => {
      result.current.updateSettings({ language: 'en' });
    });

    expect(result.current.organization.settings.language).toBe('en');
    // Previous settings should still exist
    expect(result.current.organization.settings.timezone).toBe('America/Bogota');
  });

  it('can update nested notification settings', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });

    act(() => {
      result.current.updateSettings({
        notifications: { email: false, slack: true, teams: false },
      });
    });

    expect(result.current.organization.settings.notifications.email).toBe(false);
    expect(result.current.organization.settings.notifications.slack).toBe(true);
  });

  it('can update security settings', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });

    act(() => {
      result.current.updateSettings({
        security: { mfaRequired: true, sessionTimeout: 60 },
      });
    });

    expect(result.current.organization.settings.security.mfaRequired).toBe(true);
    expect(result.current.organization.settings.security.sessionTimeout).toBe(60);
  });

  it('preserves other org fields when updating settings', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    const originalName = result.current.organization.name;

    act(() => {
      result.current.updateSettings({ language: 'en' });
    });

    expect(result.current.organization.name).toBe(originalName);
    expect(result.current.organization.plan).toBe('professional');
  });
});

describe('TenantProvider – isWithinLimits', () => {
  beforeEach(() => {
    mockUser = null;
  });

  it('returns true when usage is below the limit (systems)', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // Default: 9 systems, limit 25
    expect(result.current.isWithinLimits('systems')).toBe(true);
  });

  it('returns true when usage is below the limit (users)', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // Default: 4 users, limit 10
    expect(result.current.isWithinLimits('users')).toBe(true);
  });

  it('returns true when usage is below the limit (integrations)', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // Default: 1 integration, limit 3
    expect(result.current.isWithinLimits('integrations')).toBe(true);
  });

  it('returns true when usage is below the limit (aiCallsToday)', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // Default: 12 calls, limit 100
    expect(result.current.isWithinLimits('aiCallsToday')).toBe(true);
  });

  it('returns true for an unknown resource (defaults to Infinity limit)', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // Unknown resource → usage 0 < Infinity → true
    expect(result.current.isWithinLimits('unknownResource')).toBe(true);
  });
});

describe('TenantProvider – getUsagePercent', () => {
  beforeEach(() => {
    mockUser = null;
  });

  it('calculates correct percentage for systems', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // 9 / 25 = 36%
    expect(result.current.getUsagePercent('systems')).toBe(36);
  });

  it('calculates correct percentage for users', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // 4 / 10 = 40%
    expect(result.current.getUsagePercent('users')).toBe(40);
  });

  it('calculates correct percentage for integrations', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // 1 / 3 = 33.33% → rounded to 33
    expect(result.current.getUsagePercent('integrations')).toBe(33);
  });

  it('calculates correct percentage for aiCallsToday', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // 12 / 100 = 12%
    expect(result.current.getUsagePercent('aiCallsToday')).toBe(12);
  });

  it('returns 0 for unknown resource with no usage', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // usage[unknown] = 0, limit fallback = 1 → 0/1 = 0%
    expect(result.current.getUsagePercent('unknown')).toBe(0);
  });
});

describe('TenantProvider – combined behavior', () => {
  beforeEach(() => {
    mockUser = null;
  });

  it('settings update does not affect limits or usage calculations', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });

    const percentBefore = result.current.getUsagePercent('systems');

    act(() => {
      result.current.updateSettings({ language: 'en' });
    });

    expect(result.current.getUsagePercent('systems')).toBe(percentBefore);
    expect(result.current.isWithinLimits('systems')).toBe(true);
  });
});
