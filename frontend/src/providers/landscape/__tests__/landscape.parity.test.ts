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
import { LandscapeRestrictedProvider } from '../landscape.restricted';

describe('LandscapeProvider parity tests', () => {
  const real = new LandscapeRealProvider();
  const mock = new LandscapeMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getDiscovery() returns an array', async () => {
      const result = await provider.getDiscovery();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getSIDLines() returns an array', async () => {
      const result = await provider.getSIDLines();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getLandscapeValidation() returns an object', async () => {
      const result = await provider.getLandscapeValidation();
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });
  });

  // ── ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getDiscovery();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getDiscovery();
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
    const restricted = new LandscapeRestrictedProvider();

    it('getDiscovery returns empty array with source=restricted', async () => {
      const result = await restricted.getDiscovery();
      expect(result.source).toBe('restricted');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBeTruthy();
      expect(result.data).toEqual([]);
    });

    it('getSIDLines returns empty array with source=restricted', async () => {
      const result = await restricted.getSIDLines();
      expect(result.source).toBe('restricted');
      expect(result.confidence).toBe('low');
      expect(result.data).toEqual([]);
    });

    it('getLandscapeValidation returns restricted marker with source=restricted', async () => {
      const result = await restricted.getLandscapeValidation();
      expect(result.source).toBe('restricted');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBeTruthy();
      expect(result.data).toHaveProperty('restricted', true);
    });

    it('implements all methods from the contract', () => {
      const realMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(real)).filter(m => m !== 'constructor');
      const restrictedMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(restricted)).filter(m => m !== 'constructor');
      expect(restrictedMethods.sort()).toEqual(realMethods.sort());
    });
  });
});
