import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getHAConfigs: vi.fn().mockResolvedValue([
      {
        id: 'ha-1',
        haEnabled: true,
        haStrategy: 'HOT_STANDBY',
        primaryNode: 'sap-ep1-hana-pri',
        secondaryNode: 'sap-ep1-hana-sec',
        status: 'active',
        lastFailoverAt: null,
        system: { sid: 'EP1', environment: 'PRD', description: 'ERP System', dbType: 'HANA', status: 'healthy', healthScore: 94 },
      },
    ]),
    getHAPrereqs: vi.fn().mockResolvedValue({ checks: [], passed: true }),
    getHAOpsHistory: vi.fn().mockResolvedValue([{ id: 'op-1', type: 'FAILOVER', status: 'SUCCESS' }]),
    getHADrivers: vi.fn().mockResolvedValue([{ name: 'pacemaker', version: '2.1' }]),
  },
}));

vi.mock('../../../lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../../lib/mockData', () => ({
  mockHASystems: [
    { id: 'mock-ha-1', sid: 'EP1', systemId: 'sys-1', strategy: 'HOT_STANDBY', status: 'HEALTHY', primaryNode: 'pri-1', secondaryNode: 'sec-1', haStatus: 'HEALTHY', haType: 'HANA_SR' },
  ],
  mockHAPrereqs: { checks: [], passed: true },
  mockHAOpsHistory: [{ id: 'mock-op-1', type: 'FAILOVER', status: 'SUCCESS' }],
  mockHADrivers: [{ name: 'pacemaker', version: '2.1' }],
}));

import { HARealProvider } from '../ha.real';
import { HAMockProvider } from '../ha.mock';

describe('HAProvider parity tests', () => {
  const real = new HARealProvider();
  const mock = new HAMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getHASystems() returns an array', async () => {
      const result = await provider.getHASystems();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getHAPrereqs() returns an object', async () => {
      const result = await provider.getHAPrereqs('sys-1');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });

    it('getHAOpsHistory() returns data', async () => {
      const result = await provider.getHAOpsHistory('sys-1');
      expect(result.data).toBeDefined();
    });

    it('getHADrivers() returns data', async () => {
      const result = await provider.getHADrivers('sys-1');
      expect(result.data).toBeDefined();
    });
  });

  // ── ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getHASystems();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getHASystems();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
});
