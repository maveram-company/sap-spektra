import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Mock TenantContext ───────────────────────────────────────────────────────

let mockOrganization: { plan?: string } = { plan: 'professional' };

vi.mock('../../contexts/TenantContext', () => ({
  useTenant: () => ({ organization: mockOrganization }),
}));

import { PlanProvider, usePlan } from '../usePlan';

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return <PlanProvider>{children}</PlanProvider>;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('usePlan – PlanProvider', () => {
  beforeEach(() => {
    mockOrganization = { plan: 'professional' };
  });

  it('throws when usePlan is called outside PlanProvider', () => {
    // Suppress console.error for the expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePlan())).toThrow(
      'usePlan must be used within PlanProvider',
    );
    spy.mockRestore();
  });

  it('returns the professional plan when organization.plan is professional', () => {
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.currentPlan.id).toBe('professional');
    expect(result.current.currentPlan.name).toBe('Professional');
    expect(result.current.currentPlan.price).toBe(299);
  });

  it('defaults to starter plan when organization has no plan', () => {
    mockOrganization = {};
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.currentPlan.id).toBe('starter');
    expect(result.current.currentPlan.price).toBe(0);
  });

  it('defaults to starter plan when organization is null', () => {
    mockOrganization = null as unknown as { plan?: string };
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.currentPlan.id).toBe('starter');
  });
});

describe('usePlan – hasFeature', () => {
  it('returns true for features in the current plan', () => {
    mockOrganization = { plan: 'professional' };
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.hasFeature('monitoring')).toBe(true);
    expect(result.current.hasFeature('runbooks')).toBe(true);
    expect(result.current.hasFeature('ai_analysis')).toBe(true);
    expect(result.current.hasFeature('analytics')).toBe(true);
  });

  it('returns false for features NOT in the current plan', () => {
    mockOrganization = { plan: 'starter' };
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.hasFeature('runbooks')).toBe(false);
    expect(result.current.hasFeature('ha_orchestration')).toBe(false);
    expect(result.current.hasFeature('sso')).toBe(false);
  });

  it('returns true for enterprise-only features when on enterprise plan', () => {
    mockOrganization = { plan: 'enterprise' };
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.hasFeature('ha_orchestration')).toBe(true);
    expect(result.current.hasFeature('compliance')).toBe(true);
    expect(result.current.hasFeature('sso')).toBe(true);
    expect(result.current.hasFeature('api_access')).toBe(true);
    expect(result.current.hasFeature('multi_cloud')).toBe(true);
  });
});

describe('usePlan – canUpgrade', () => {
  it('returns true for starter plan', () => {
    mockOrganization = { plan: 'starter' };
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.canUpgrade).toBe(true);
  });

  it('returns true for professional plan', () => {
    mockOrganization = { plan: 'professional' };
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.canUpgrade).toBe(true);
  });

  it('returns false for enterprise plan', () => {
    mockOrganization = { plan: 'enterprise' };
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.canUpgrade).toBe(false);
  });
});

describe('usePlan – getPlan', () => {
  it('returns a plan by id', () => {
    const { result } = renderHook(() => usePlan(), { wrapper });

    const starter = result.current.getPlan('starter');
    expect(starter).toBeDefined();
    expect(starter.id).toBe('starter');
    expect(starter.limits.maxSystems).toBe(3);
  });

  it('returns undefined for unknown plan id', () => {
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.getPlan('nonexistent')).toBeUndefined();
  });

  it('enterprise plan has Infinity limits', () => {
    const { result } = renderHook(() => usePlan(), { wrapper });

    const enterprise = result.current.getPlan('enterprise');
    expect(enterprise.limits.maxSystems).toBe(Infinity);
    expect(enterprise.limits.maxUsers).toBe(Infinity);
    expect(enterprise.limits.maxIntegrations).toBe(Infinity);
  });
});

describe('usePlan – getAllPlans', () => {
  it('returns all three plans', () => {
    const { result } = renderHook(() => usePlan(), { wrapper });

    const allPlans = result.current.getAllPlans();
    expect(allPlans).toHaveLength(3);

    const ids = allPlans.map((p: { id: string }) => p.id);
    expect(ids).toContain('starter');
    expect(ids).toContain('professional');
    expect(ids).toContain('enterprise');
  });

  it('exposes PLANS constant', () => {
    const { result } = renderHook(() => usePlan(), { wrapper });

    expect(result.current.PLANS).toBeDefined();
    expect(Object.keys(result.current.PLANS)).toEqual(['starter', 'professional', 'enterprise']);
  });
});
