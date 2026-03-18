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
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('getAlertStats() returns object with total, critical, warnings', async () => {
      const result = await provider.getAlertStats();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(typeof result.total).toBe('number');
      expect(typeof result.critical).toBe('number');
      expect(typeof result.warnings).toBe('number');
    });
  });

  // ── B) Semantic parity — AlertViewModel fields ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider — semantic assertions', (_name, provider) => {
    it('getAlerts returns AlertViewModel[] with required fields', async () => {
      const result = await provider.getAlerts();
      for (const alert of result) {
        expect(typeof alert.id).toBe('string');
        expect(typeof alert.level).toBe('string');
        expect(typeof alert.status).toBe('string');
        expect(typeof alert.sid).toBe('string');
        expect(typeof alert.resolved).toBe('boolean');
      }
    });

    it('getAlertStats returns AlertStats with numeric fields', async () => {
      const stats = await provider.getAlertStats();
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
      expect(resolved.length).toBeLessThan(all.length);
      for (const alert of resolved) {
        expect(alert.status).toBe('resolved');
      }
    });

    it('mock supports filtering by level', async () => {
      const all = await mock.getAlerts();
      const critical = await mock.getAlerts({ level: 'critical' });
      expect(critical.length).toBeLessThan(all.length);
      for (const alert of critical) {
        expect(alert.level).toBe('critical');
      }
    });

    it('real provider accepts filters parameter', async () => {
      const result = await real.getAlerts({ status: 'open', level: 'critical' });
      expect(Array.isArray(result)).toBe(true);
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
      expect(Array.isArray(alerts)).toBe(true);
      const stats = await mock.getAlertStats();
      expect(typeof stats.total).toBe('number');
    });
  });
});
