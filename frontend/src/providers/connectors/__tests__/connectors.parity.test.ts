import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getConnectors: vi.fn().mockResolvedValue([
      { id: 'conn-1', method: 'RFC', status: 'active', systemId: 'sys-1', lastHeartbeat: '2026-01-01T00:00:00Z', system: { sid: 'EP1', description: 'ERP System' } },
    ]),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockConnectors: [
    { id: 'mock-conn-1', method: 'RFC', status: 'active', systemId: 'sys-1', sid: 'EP1', lastHeartbeat: '2026-01-01T00:00:00Z' },
    { id: 'mock-conn-2', method: 'HTTP', status: 'active', systemId: 'sys-2', sid: 'BP1', lastHeartbeat: '2026-01-01T00:00:00Z' },
  ],
}));

import { ConnectorsRealProvider } from '../connectors.real';
import { ConnectorsMockProvider } from '../connectors.mock';

describe('ConnectorsProvider parity tests', () => {
  const real = new ConnectorsRealProvider();
  const mock = new ConnectorsMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getConnectors() returns an array', async () => {
      const result = await provider.getConnectors();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  // ── ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getConnectors();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getConnectors();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
});
