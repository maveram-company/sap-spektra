import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getAlerts: vi.fn().mockResolvedValue([
      {
        id: 'a1', title: 'CPU Spike', message: 'CPU above 90%',
        level: 'critical', status: 'open',
        createdAt: '2026-01-01T00:00:00Z', system: { sid: 'EP1' },
      },
    ]),
    getAlertStats: vi.fn().mockResolvedValue({ total: 5, critical: 2, warnings: 3 }),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockAlerts: [
    {
      id: 'mock-a1', title: 'CPU Spike', message: 'CPU above 90%',
      level: 'critical', status: 'open', sid: 'EP1',
      time: '14:30', resolved: false, systemId: 'sys-1',
    },
    {
      id: 'mock-a2', title: 'Memory Warning', message: 'Memory above 80%',
      level: 'warning', status: 'open', sid: 'EQ1',
      time: '15:00', resolved: false, systemId: 'sys-2',
    },
    {
      id: 'mock-a3', title: 'Disk Resolved', message: 'Disk issue fixed',
      level: 'info', status: 'resolved', sid: 'EP1',
      time: '12:00', resolved: true, systemId: 'sys-1',
    },
  ],
}));

import { AlertsRealProvider } from '../alerts.real';
import { AlertsMockProvider } from '../alerts.mock';
import { AlertsRestrictedProvider } from '../alerts.restricted';

describe('AlertsProvider parity tests', () => {
  const real = new AlertsRealProvider();
  const mock = new AlertsMockProvider();

  // ── A) Shape parity ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getAlerts() returns an array', async () => {
      const result = await provider.getAlerts();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getAlertStats() returns object with total, critical, warnings', async () => {
      const result = await provider.getAlertStats();
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
      expect(typeof result.data.total).toBe('number');
      expect(typeof result.data.critical).toBe('number');
      expect(typeof result.data.warnings).toBe('number');
    });
  });

  // ── B) Semantic parity — AlertViewModel fields ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider — semantic assertions', (_name, provider) => {
    it('getAlerts returns AlertViewModel[] with required fields', async () => {
      const result = await provider.getAlerts();
      for (const alert of result.data) {
        expect(typeof alert.id).toBe('string');
        expect(typeof alert.level).toBe('string');
        expect(typeof alert.status).toBe('string');
        expect(typeof alert.sid).toBe('string');
        expect(typeof alert.resolved).toBe('boolean');
      }
    });

    it('getAlertStats returns AlertStats with numeric fields', async () => {
      const result = await provider.getAlertStats();
      const stats = result.data;
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.critical).toBeGreaterThanOrEqual(0);
      expect(stats.warnings).toBeGreaterThanOrEqual(0);
      expect(stats.critical + stats.warnings).toBeLessThanOrEqual(stats.total);
    });
  });

  // ── C) State transition parity — filters ──

  describe('state transition parity', () => {
    it('mock supports filtering by status', async () => {
      const all = await mock.getAlerts();
      const resolved = await mock.getAlerts({ status: 'resolved' });
      expect(resolved.data.length).toBeLessThan(all.data.length);
      for (const alert of resolved.data) {
        expect(alert.status).toBe('resolved');
      }
    });

    it('mock supports filtering by level', async () => {
      const all = await mock.getAlerts();
      const critical = await mock.getAlerts({ level: 'critical' });
      expect(critical.data.length).toBeLessThan(all.data.length);
      for (const alert of critical.data) {
        expect(alert.level).toBe('critical');
      }
    });

    it('real provider accepts filters parameter', async () => {
      const result = await real.getAlerts({ status: 'open', level: 'critical' });
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  // ── D) Permission parity ──

  describe('permission parity', () => {
    it('mock provider exposes the same method set as real', () => {
      const realMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(real)).filter(m => m !== 'constructor');
      const mockMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(mock)).filter(m => m !== 'constructor');
      expect(mockMethods.sort()).toEqual(realMethods.sort());
    });

    it('mock readOnly still returns data (not errors)', async () => {
      const alerts = await mock.getAlerts();
      expect(Array.isArray(alerts.data)).toBe(true);
      const stats = await mock.getAlertStats();
      expect(typeof stats.data.total).toBe('number');
    });
  });

  // ── E) ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getAlerts();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getAlerts();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  // ── Restricted provider ──

  describe('restricted provider', () => {
    const restricted = new AlertsRestrictedProvider();

    it('getAlerts returns empty array with source=restricted', async () => {
      const result = await restricted.getAlerts();
      expect(result.source).toBe('restricted');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBeTruthy();
      expect(result.data).toEqual([]);
    });

    it('getAlertStats returns zeros with source=restricted', async () => {
      const result = await restricted.getAlertStats();
      expect(result.source).toBe('restricted');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBeTruthy();
      expect(result.data).toEqual({ total: 0, critical: 0, warnings: 0 });
    });

    it('implements all methods from the contract', () => {
      const realMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(real)).filter(m => m !== 'constructor');
      const restrictedMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(restricted)).filter(m => m !== 'constructor');
      expect(restrictedMethods.sort()).toEqual(realMethods.sort());
    });
  });
});
