import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getAlerts: vi.fn().mockResolvedValue([
      { id: 'a1', level: 'critical', status: 'open', createdAt: '2026-01-01T00:00:00Z', system: { sid: 'EP1' } },
    ]),
    getAlertStats: vi.fn().mockResolvedValue({ total: 5, critical: 2, warnings: 3 }),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockAlerts: [
    { id: 'mock-a1', level: 'critical', status: 'open', sid: 'EP1' },
    { id: 'mock-a2', level: 'warning', status: 'open', sid: 'EQ1' },
  ],
}));

import { AlertsRealProvider } from '../alerts.real';
import { AlertsMockProvider } from '../alerts.mock';

describe('AlertsProvider parity tests', () => {
  const real = new AlertsRealProvider();
  const mock = new AlertsMockProvider();

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
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('critical');
      expect(result).toHaveProperty('warnings');
    });
  });
});
