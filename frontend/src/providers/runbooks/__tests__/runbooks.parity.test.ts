import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getRunbooks: vi.fn().mockResolvedValue([
      {
        id: 'rb-1',
        name: 'HANA Backup',
        description: 'Automated HANA backup',
        category: 'Backup',
        dbType: 'HANA',
        autoExecute: true,
        costSafe: true,
        executions: [{ result: 'SUCCESS', duration: '12s' }],
        prereqs: '[]',
        steps: '[]',
      },
    ]),
    getRunbookExecutions: vi.fn().mockResolvedValue([
      {
        id: 'exec-1', runbookId: 'rb-1', systemId: 'sys-1',
        status: 'SUCCESS', result: 'SUCCESS',
        system: { sid: 'EP1' }, startedAt: '2026-01-01T00:00:00Z',
      },
    ]),
    executeRunbook: vi.fn().mockResolvedValue({ id: 'exec-new', result: 'RUNNING' }),
    getExecutionDetail: vi.fn().mockResolvedValue({ id: 'exec-1', steps: [] }),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockRunbooks: [
    {
      id: 'mock-rb-1', name: 'HANA Backup', description: 'Automated HANA backup',
      category: 'Backup', dbType: 'HANA',
      autoExecute: true, costSafe: true,
      auto: true, gate: 'SAFE', totalRuns: 5, successRate: 100,
    },
  ],
  mockRunbookExecutions: [
    {
      id: 'mock-exec-1', runbookId: 'mock-rb-1', systemId: 'sys-1',
      status: 'SUCCESS', result: 'SUCCESS', sid: 'EP1',
    },
  ],
}));

import { RunbooksRealProvider } from '../runbooks.real';
import { RunbooksMockProvider } from '../runbooks.mock';

describe('RunbooksProvider parity tests', () => {
  const real = new RunbooksRealProvider();
  const mock = new RunbooksMockProvider();

  // ── A) Shape parity ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getRunbooks() returns an array', async () => {
      const result = await provider.getRunbooks();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getRunbookExecutions() returns an array', async () => {
      const result = await provider.getRunbookExecutions();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('executeRunbook() returns an object', async () => {
      const result = await provider.executeRunbook('rb-1', 'sys-1', false);
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });

    it('getExecutionDetail() returns data', async () => {
      const result = await provider.getExecutionDetail('exec-1');
      // Both real and mock can return an object or null
      expect(result.data === null || typeof result.data === 'object').toBe(true);
    });
  });

  // ── B) Semantic parity — RunbookViewModel fields ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider — semantic assertions', (_name, provider) => {
    it('getRunbooks returns RunbookViewModel[] with required fields', async () => {
      const result = await provider.getRunbooks();
      for (const rb of result.data) {
        expect(typeof rb.id).toBe('string');
        expect(typeof rb.name).toBe('string');
      }
    });

    it('getRunbookExecutions returns ExecutionViewModel[] with required fields', async () => {
      const result = await provider.getRunbookExecutions();
      for (const exec of result.data) {
        expect(typeof exec.id).toBe('string');
        expect(typeof exec.runbookId).toBe('string');
        expect(typeof exec.systemId).toBe('string');
        expect(typeof exec.status).toBe('string');
      }
    });
  });

  // ── C) State transition parity — dry run vs real execution ──

  describe('state transition parity', () => {
    it('both providers return an object for executeRunbook (non-dry-run)', async () => {
      const realResult = await real.executeRunbook('rb-1', 'sys-1', false);
      const mockResult = await mock.executeRunbook('rb-1', 'sys-1', false);
      expect(typeof realResult.data).toBe('object');
      expect(typeof mockResult.data).toBe('object');
    });

    it('mock returns dryRun flag for dry run execution', async () => {
      const result = await mock.executeRunbook('rb-1', 'sys-1', true);
      expect(result.data.dryRun).toBe(true);
    });
  });

  // ── D) Permission parity ──

  describe('permission parity', () => {
    it('mock provider exposes the same method set as real', () => {
      const realMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(real)).filter(m => m !== 'constructor');
      const mockMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(mock)).filter(m => m !== 'constructor');
      expect(mockMethods.sort()).toEqual(realMethods.sort());
    });

    it('mock readOnly still returns data (not errors)', async () => {
      const runbooks = await mock.getRunbooks();
      expect(Array.isArray(runbooks.data)).toBe(true);
      const execs = await mock.getRunbookExecutions();
      expect(Array.isArray(execs.data)).toBe(true);
    });
  });

  // ── E) ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getRunbooks();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getRunbooks();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
});
