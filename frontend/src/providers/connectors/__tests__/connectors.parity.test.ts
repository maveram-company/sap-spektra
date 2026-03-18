import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getConnectors: vi.fn().mockResolvedValue([
      { id: 'conn-1', name: 'SAP ERP', system: { sid: 'EP1', description: 'ERP System' } },
    ]),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockConnectors: [
    { id: 'mock-conn-1', name: 'SAP ERP', sid: 'EP1' },
    { id: 'mock-conn-2', name: 'SAP BW', sid: 'BP1' },
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
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
