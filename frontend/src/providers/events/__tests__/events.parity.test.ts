import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getEvents: vi.fn().mockResolvedValue([
      { id: 'evt-1', type: 'ALERT', system: { sid: 'EP1' } },
    ]),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockEvents: [
    { id: 'mock-evt-1', type: 'ALERT', sid: 'EP1' },
    { id: 'mock-evt-2', type: 'OPERATION', sid: 'EQ1' },
  ],
}));

import { EventsRealProvider } from '../events.real';
import { EventsMockProvider } from '../events.mock';

describe('EventsProvider parity tests', () => {
  const real = new EventsRealProvider();
  const mock = new EventsMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getEvents() returns an array', async () => {
      const result = await provider.getEvents();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
