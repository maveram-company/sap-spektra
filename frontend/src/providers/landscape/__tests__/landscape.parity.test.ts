import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getSystems: vi.fn().mockResolvedValue([
      {
        id: 'sys-1',
        sid: 'EP1',
        sapProduct: 'S/4HANA',
        dbType: 'SAP HANA 2.0',
        environment: 'PRD',
        sapStackType: 'ABAP',
        updatedAt: '2026-01-01T00:00:00Z',
        hosts: [{ id: 'h1', hostname: 'sap-ep1-01', os: 'SLES' }],
        instances: [{ instanceNr: '00', hostId: 'h1', role: 'PAS' }],
        systemMeta: { kernelVersion: '789' },
        haConfig: { haEnabled: true, haStrategy: 'HOT_STANDBY', secondaryNode: 'sap-ep1-02' },
      },
    ]),
    getLandscapeValidation: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
  },
}));

vi.mock('../../../lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../../lib/mockData', () => ({
  mockDiscovery: [
    { instanceId: 'EP1_00', hostname: 'sap-ep1-01', sid: 'EP1', role: 'PAS', scanStatus: 'success' },
  ],
  mockSIDLines: [
    { line: 'ERP', description: 'S/4HANA', systems: ['sys-1'] },
  ],
  mockLandscapeValidation: { valid: true, issues: [] },
}));

import { LandscapeRealProvider } from '../landscape.real';
import { LandscapeMockProvider } from '../landscape.mock';

describe('LandscapeProvider parity tests', () => {
  const real = new LandscapeRealProvider();
  const mock = new LandscapeMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getDiscovery() returns an array', async () => {
      const result = await provider.getDiscovery();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('getSIDLines() returns an array', async () => {
      const result = await provider.getSIDLines();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('getLandscapeValidation() returns an object', async () => {
      const result = await provider.getLandscapeValidation();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });
});
