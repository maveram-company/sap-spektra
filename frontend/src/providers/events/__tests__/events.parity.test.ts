import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getEvents: vi.fn().mockResolvedValue([
      { id: 'evt-1', type: 'ALERT', message: 'CPU spike', level: 'critical', source: 'monitor', createdAt: '2026-01-01T14:30:00Z', system: { sid: 'EP1' } },
    ]),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockEvents: [
    { id: 'mock-evt-1', type: 'ALERT', message: 'CPU spike', level: 'critical', source: 'monitor', sid: 'EP1', time: '14:30' },
    { id: 'mock-evt-2', type: 'OPERATION', message: 'Backup done', level: 'info', source: 'scheduler', sid: 'EQ1', time: '15:00' },
  ],
}));

import { EventsRealProvider } from '../events.real';
import { EventsMockProvider } from '../events.mock';
import { EventsRestrictedProvider } from '../events.restricted';

describe('EventsProvider parity tests', () => {
  const real = new EventsRealProvider();
  const mock = new EventsMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getEvents() returns an array', async () => {
      const result = await provider.getEvents();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  // ── ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getEvents();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getEvents();
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
    const restricted = new EventsRestrictedProvider();

    it('getEvents returns empty array with source=restricted', async () => {
      const result = await restricted.getEvents();
      expect(result.source).toBe('restricted');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBeTruthy();
      expect(result.data).toEqual([]);
    });

    it('implements all methods from the contract', () => {
      const realMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(real)).filter(m => m !== 'constructor');
      const restrictedMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(restricted)).filter(m => m !== 'constructor');
      expect(restrictedMethods.sort()).toEqual(realMethods.sort());
    });
  });
});
