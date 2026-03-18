import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getUsers: vi.fn().mockResolvedValue([
      { id: 'usr-1', name: 'Test User', email: 'test@test.com', role: 'admin', status: 'active', lastLoginAt: '2026-01-01', mfaEnabled: true },
    ]),
    getAuditLog: vi.fn().mockResolvedValue([
      { id: 'aud-1', action: 'login', resource: 'auth', severity: 'info', userEmail: 'test@test.com', createdAt: '2026-01-01T00:00:00Z' },
    ]),
    getPlans: vi.fn().mockResolvedValue([
      { id: 'plan-1', name: 'Pro', tier: 'pro' },
    ]),
    getApiKeys: vi.fn().mockResolvedValue([
      { id: 'key-1', name: 'Production API Key', prefix: 'sk-prod' },
    ]),
    getSettings: vi.fn().mockResolvedValue({
      settings: {
        thresholds: [{ metric: 'cpu', warning: 80, critical: 90 }],
        escalation: [{ level: 1, channel: 'email' }],
        maintenanceWindows: [{ day: 'Sunday', start: '02:00', end: '06:00' }],
      },
    }),
  },
}));

vi.mock('../../../lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../../lib/mockData', () => ({
  mockUsers: [
    { id: 'mock-usr-1', name: 'Mock User', email: 'mock@test.com', role: 'admin', status: 'active' },
  ],
  mockAuditLog: [
    { id: 'mock-aud-1', action: 'login', resource: 'auth', severity: 'info', userEmail: 'mock@test.com', time: '2026-01-01T00:00:00Z', user: 'mock@test.com', timestamp: '2026-01-01T00:00:00Z' },
  ],
  mockApiKeys: [
    { id: 'mock-key-1', name: 'Test Key', prefix: 'sk-test' },
  ],
  mockThresholds: [{ metric: 'cpu', warning: 80, critical: 90 }],
  mockEscalationPolicy: [{ level: 1, channel: 'email' }],
  mockMaintenanceWindows: [{ day: 'Sunday', start: '02:00', end: '06:00' }],
}));

import { AdminRealProvider } from '../admin.real';
import { AdminMockProvider } from '../admin.mock';

describe('AdminProvider parity tests', () => {
  const real = new AdminRealProvider();
  const mock = new AdminMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getUsers() returns an array', async () => {
      const result = await provider.getUsers();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getAuditLog() returns an array', async () => {
      const result = await provider.getAuditLog();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getPlans() returns data', async () => {
      const result = await provider.getPlans();
      expect(result.data).toBeDefined();
    });

    it('getApiKeys() returns data', async () => {
      const result = await provider.getApiKeys();
      expect(result.data).toBeDefined();
    });

    it('getThresholds() returns data', async () => {
      const result = await provider.getThresholds();
      expect(result.data).toBeDefined();
    });

    it('getEscalationPolicy() returns data', async () => {
      const result = await provider.getEscalationPolicy();
      expect(result.data).toBeDefined();
    });

    it('getMaintenanceWindows() returns data', async () => {
      const result = await provider.getMaintenanceWindows();
      expect(result.data).toBeDefined();
    });
  });

  // ── ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getUsers();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getUsers();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
});
