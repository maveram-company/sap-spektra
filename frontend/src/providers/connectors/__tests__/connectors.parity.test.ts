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

  // ── Degraded parity ──

  describe('degraded parity', () => {
    it('fallback returns connectors with degraded=true when real fails', async () => {
      const { api } = await import('../../../hooks/useApi');
      (api.getConnectors as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const { createFallbackProvider } = await import('../../create-fallback');
      const fallback = createFallbackProvider(
        real,
        mock,
        'Connectors',
      );
      const result = await fallback.getConnectors();
      expect(result.source).toBe('fallback');
      expect(result.degraded).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.confidence).toBe('medium');
    });
  });

  // ── Evidence parity ──

  describe('evidence parity', () => {
    it('both real and mock return ProviderResult with consistent metadata', async () => {
      const realResult = await real.getConnectors();
      const mockResult = await mock.getConnectors();

      for (const result of [realResult, mockResult]) {
        expect(result).toHaveProperty('timestamp');
        expect(typeof result.timestamp).toBe('string');
        expect(new Date(result.timestamp).getTime()).not.toBeNaN();
        expect(result).toHaveProperty('source');
        expect(['real', 'mock', 'fallback', 'restricted']).toContain(result.source);
        expect(result).toHaveProperty('confidence');
        expect(['high', 'medium', 'low']).toContain(result.confidence);
        expect(typeof result.degraded).toBe('boolean');
      }
    });
  });
});
