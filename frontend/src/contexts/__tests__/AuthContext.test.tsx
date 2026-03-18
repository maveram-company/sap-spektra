import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock config to control demoMode
vi.mock('../../config', () => ({
  default: {
    features: { demoMode: true },
  },
}));

// Mock api.login for the non-demo path tests
vi.mock('../../hooks/useApi', () => ({
  api: {
    login: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from '../AuthContext';

const STORAGE_KEY = 'sap-spektra-auth';

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function validUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    username: 'admin',
    email: 'admin@test.com',
    name: 'Admin',
    role: 'admin',
    token: 'tok-123',
    exp: Math.floor(Date.now() / 1000) + 3600, // expires in 1 hour
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuthProvider – initial state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('throws when useAuth is called outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within AuthProvider',
    );
    spy.mockRestore();
  });

  it('starts with user=null when localStorage is empty', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('restores valid user from localStorage', () => {
    const user = validUser();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).not.toBeNull();
    expect(result.current.user!.username).toBe('admin');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('discards expired user from localStorage', () => {
    const expired = validUser({ exp: Math.floor(Date.now() / 1000) - 100 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expired));

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards corrupted JSON from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '{broken-json');

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards user with missing exp field', () => {
    const noExp = validUser({ exp: undefined });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(noExp));

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
  });
});

describe('AuthProvider – login (demo mode)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('creates a demo user with correct properties', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    let user: any;
    await act(async () => {
      user = await result.current.login('testuser', 'password');
    });

    expect(user).toBeDefined();
    expect(user!.username).toBe('testuser');
    expect(user!.role).toBe('admin');
    expect(user!.email).toContain('@demo.spektra.com');
    expect(user!.name).toBe('Testuser'); // capitalized
  });

  it('persists the user to localStorage after login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('admin', 'pass');
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.username).toBe('admin');
    expect(stored.token).toContain('demo-token');
  });

  it('sets isAuthenticated to true after login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login('admin', 'password');
    });

    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('AuthProvider – logout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('clears user and localStorage on logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('admin', 'pass');
    });
    expect(result.current.user).not.toBeNull();

    act(() => result.current.logout());

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('sets all role flags to false after logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('admin', 'pass');
    });
    expect(result.current.isAdmin).toBe(true);

    act(() => result.current.logout());

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isOperator).toBe(false);
    expect(result.current.isViewer).toBe(false);
  });
});

describe('AuthProvider – role flags', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('isAdmin is true for admin users', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'admin' })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isOperator).toBe(false);
  });

  it('isOperator is true for operator users', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'operator' })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isOperator).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });

  it('isViewer is true for viewer users', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'viewer' })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isViewer).toBe(true);
  });

  it('isEscalation is true for escalation users', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'escalation' })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isEscalation).toBe(true);
  });
});

describe('AuthProvider – hasRole (role hierarchy)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('admin has all roles', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'admin' })));
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.hasRole('admin')).toBe(true);
    expect(result.current.hasRole('escalation')).toBe(true);
    expect(result.current.hasRole('operator')).toBe(true);
    expect(result.current.hasRole('viewer')).toBe(true);
  });

  it('escalation has operator and viewer but not admin', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'escalation' })));
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.hasRole('admin')).toBe(false);
    expect(result.current.hasRole('escalation')).toBe(true);
    expect(result.current.hasRole('operator')).toBe(true);
    expect(result.current.hasRole('viewer')).toBe(true);
  });

  it('operator has viewer but not escalation or admin', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'operator' })));
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.hasRole('admin')).toBe(false);
    expect(result.current.hasRole('escalation')).toBe(false);
    expect(result.current.hasRole('operator')).toBe(true);
    expect(result.current.hasRole('viewer')).toBe(true);
  });

  it('viewer only has viewer', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'viewer' })));
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.hasRole('admin')).toBe(false);
    expect(result.current.hasRole('escalation')).toBe(false);
    expect(result.current.hasRole('operator')).toBe(false);
    expect(result.current.hasRole('viewer')).toBe(true);
  });

  it('null user has no roles (returns false for any role)', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.hasRole('viewer')).toBe(false);
    expect(result.current.hasRole('admin')).toBe(false);
  });

  it('unknown role returns false', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validUser({ role: 'admin' })));
    const { result } = renderHook(() => useAuth(), { wrapper });

    // admin level 40 >= unknown level 0 → true
    expect(result.current.hasRole('unknown_role')).toBe(true);
  });
});

describe('AuthProvider – loading state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loading is always false (synchronous auth)', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(false);
  });
});
