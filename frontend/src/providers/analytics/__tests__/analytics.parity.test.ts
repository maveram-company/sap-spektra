import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getAnalyticsOverview: vi.fn().mockResolvedValue({
      alertsByLevel: { critical: 2, warning: 5 },
      operationsByStatus: { COMPLETED: 10, SCHEDULED: 3 },
    }),
    getRunbookAnalytics: vi.fn().mockResolvedValue({
      totalExecutions: 50,
      byRunbook: {
        'HANA Backup': { total: 20, success: 18 },
        'WP Restart': { total: 15, success: 15 },
      },
      byResult: { SUCCESS: 45, FAILED: 5 },
    }),
  },
}));

vi.mock('../../../lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../../lib/mockData', () => ({
  mockAnalytics: {
    totalExecutions: 42,
    successRate: 95.2,
    failedCount: 2,
    avgPerDay: 3,
    topRunbooks: [],
    dailyTrend: [],
    alertStats: { total: 7, critical: 2, warnings: 5, autoResolved: 10, avgResolutionMin: 23 },
    slaMetrics: { runbooksToday: 42, successRate: 95.2, avgDuration: '12s', mostExecuted: 'HANA Backup', pendingApproval: 3 },
  },
}));

import { AnalyticsRealProvider } from '../analytics.real';
import { AnalyticsMockProvider } from '../analytics.mock';

describe('AnalyticsProvider parity tests', () => {
  const real = new AnalyticsRealProvider();
  const mock = new AnalyticsMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getAnalytics() returns an object', async () => {
      const result = await provider.getAnalytics();
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
      expect(result.data).not.toBeNull();
    });

    it('getRunbookAnalytics() returns an object', async () => {
      const result = await provider.getRunbookAnalytics();
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
      expect(result.data).not.toBeNull();
    });
  });

  // ── ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getAnalytics();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getAnalytics();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
    });
  });
});
