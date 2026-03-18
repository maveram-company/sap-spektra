import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getSystems: vi.fn().mockResolvedValue([
      {
        id: 'sys-1',
        sid: 'EP1',
        sapProduct: 'S/4HANA',
        dbType: 'SAP HANA 2.0',
        description: 'Production ERP',
        environment: 'PRD',
        status: 'healthy',
        healthScore: 94,
        hosts: [{ id: 'h1', hostname: 'sap-ep1-01', cpu: 42, memory: 65, disk: 58, status: 'active' }],
        _count: { breaches: 0 },
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]),
    getSystemById: vi.fn().mockResolvedValue({
      id: 'sys-1',
      sid: 'EP1',
      sapProduct: 'S/4HANA',
      dbType: 'SAP HANA 2.0',
      description: 'Production ERP',
      environment: 'PRD',
      status: 'healthy',
      healthScore: 94,
      hosts: [{ id: 'h1', hostname: 'sap-ep1-01', cpu: 42, memory: 65, disk: 58, status: 'active' }],
      _count: { breaches: 0 },
      updatedAt: '2026-01-01T00:00:00Z',
    }),
    getSystemHostMetrics: vi.fn().mockResolvedValue({ cpu: [42], mem: [65] }),
    getBreaches: vi.fn().mockResolvedValue([
      { id: 'b-1', systemId: 'sys-1', metric: 'cpu', value: 95, system: { sid: 'EP1' } },
    ]),
    getHealthSnapshots: vi.fn().mockResolvedValue({ mttr: 25, mtbf: 1440, availability: 99.8 }),
    getHosts: vi.fn().mockResolvedValue([
      { id: 'h1', hostname: 'sap-ep1-01', cpu: 42, memory: 65, disk: 58, status: 'active', os: 'SLES', osVersion: '15', instances: [] },
    ]),
    getComponents: vi.fn().mockResolvedValue([]),
    getDependencies: vi.fn().mockResolvedValue([]),
    getSystemMeta: vi.fn().mockResolvedValue([]),
    getHostMetrics: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../../lib/mockData', () => ({
  mockSystems: [
    {
      id: 'sys-1', sid: 'EP1', type: 'S/4HANA', dbType: 'SAP HANA 2.0', description: 'Production ERP',
      environment: 'PRD', status: 'healthy', healthScore: 94,
      cpu: 42, mem: 65, disk: 58, isRiseRestricted: false,
      mttr: 25, mtbf: 1440, availability: 99.8,
    },
  ],
  mockBreaches: [
    { id: 'mock-b-1', systemId: 'sys-1', metric: 'cpu', value: 95, sid: 'EP1' },
  ],
  mockMetrics: vi.fn().mockReturnValue({ cpu: [42], mem: [65] }),
  mockServerMetrics: { 'sys-1': { avail: 99.9, monSt: 'green' } },
  mockServerDeps: { 'sys-1': [{ name: 'DB', status: 'ok', detail: 'Latency: 2ms' }] },
  mockSystemInstances: { 'sys-1': [{ nr: '00', role: 'PAS', hostname: 'sap-ep1-01' }] },
  mockMetricHistory: { 'sap-ep1-01': [{ cpu: 42, mem: 65, disk: 58 }] },
  getSystemHosts: vi.fn().mockReturnValue([{ id: 'h1', hostname: 'sap-ep1-01' }]),
  mockSystemMeta: { 'sys-1': { release: '2023', kernel: '789' } },
  mockSAPMonitoring: { 'sys-1': { sm12: {}, sm37: {} } },
}));

import { SystemsRealProvider } from '../systems.real';
import { SystemsMockProvider } from '../systems.mock';
import type { SystemViewModel } from '../systems.contract';

describe('SystemsProvider parity tests', () => {
  const real = new SystemsRealProvider();
  const mock = new SystemsMockProvider();

  // ── A) Shape parity ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getSystems() returns an array', async () => {
      const result = await provider.getSystems();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('getSystemById() returns an object or null', async () => {
      const result = await provider.getSystemById('sys-1');
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('getSystemMetrics() returns data', async () => {
      const result = await provider.getSystemMetrics('sys-1');
      expect(result).toBeDefined();
    });

    it('getSystemBreaches() returns an array', async () => {
      const result = await provider.getSystemBreaches('sys-1');
      expect(Array.isArray(result)).toBe(true);
    });

    it('getSystemSla() returns data', async () => {
      const result = await provider.getSystemSla('sys-1');
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('getServerMetrics() returns object or null', async () => {
      const result = await provider.getServerMetrics('sys-1');
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('getSystemInstances() returns an array', async () => {
      const result = await provider.getSystemInstances('sys-1');
      expect(Array.isArray(result)).toBe(true);
    });

    it('getSystemHosts() returns an array', async () => {
      const result = await provider.getSystemHosts('sys-1');
      expect(Array.isArray(result)).toBe(true);
    });

    it('getSystemMeta() returns data', async () => {
      const result = await provider.getSystemMeta('sys-1');
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('getMetricHistory() returns an array', async () => {
      const result = await provider.getMetricHistory('sap-ep1-01');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── B) Semantic parity — SystemViewModel fields ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider — semantic assertions', (_name, provider) => {
    it('getSystems returns SystemViewModel[] with required fields', async () => {
      const result = await provider.getSystems();
      for (const sys of result) {
        expect(typeof sys.id).toBe('string');
        expect(typeof sys.sid).toBe('string');
        expect(typeof sys.type).toBe('string');
        expect(typeof sys.environment).toBe('string');
        expect(typeof sys.healthScore).toBe('number');
        expect(typeof sys.status).toBe('string');
        expect(sys.cpu === null || typeof sys.cpu === 'number').toBe(true);
        expect(sys.mem === null || typeof sys.mem === 'number').toBe(true);
        expect(sys.disk === null || typeof sys.disk === 'number').toBe(true);
        expect(typeof sys.isRiseRestricted).toBe('boolean');
        expect(typeof sys.description).toBe('string');
      }
    });

    it('getSystemById returns SystemViewModel with required fields', async () => {
      const sys = await provider.getSystemById('sys-1') as SystemViewModel;
      expect(sys).not.toBeNull();
      expect(typeof sys.id).toBe('string');
      expect(typeof sys.sid).toBe('string');
      expect(typeof sys.status).toBe('string');
      expect(typeof sys.healthScore).toBe('number');
    });
  });

  // ── D) Permission parity — mock still exposes all methods ──

  describe('permission parity', () => {
    it('mock provider exposes the same method set as real', () => {
      const realMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(real)).filter(m => m !== 'constructor');
      const mockMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(mock)).filter(m => m !== 'constructor');
      expect(mockMethods.sort()).toEqual(realMethods.sort());
    });

    it('mock readOnly still returns data (not errors)', async () => {
      const systems = await mock.getSystems();
      expect(Array.isArray(systems)).toBe(true);
      const metrics = await mock.getSystemMetrics('sys-1');
      expect(metrics).toBeDefined();
    });
  });
});
