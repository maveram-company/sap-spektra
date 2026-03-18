import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getRunbooks: vi.fn().mockResolvedValue([
      {
        id: 'rb-1',
        name: 'HANA Backup',
        autoExecute: true,
        costSafe: true,
        executions: [{ result: 'SUCCESS', duration: '12s' }],
        prereqs: '[]',
        steps: '[]',
      },
    ]),
    getRunbookExecutions: vi.fn().mockResolvedValue([
      { id: 'exec-1', runbookId: 'rb-1', result: 'SUCCESS', system: { sid: 'EP1' }, startedAt: '2026-01-01T00:00:00Z' },
    ]),
    executeRunbook: vi.fn().mockResolvedValue({ id: 'exec-new', result: 'RUNNING' }),
    getExecutionDetail: vi.fn().mockResolvedValue({ id: 'exec-1', steps: [] }),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockRunbooks: [
    { id: 'mock-rb-1', name: 'HANA Backup', auto: true, gate: 'SAFE', totalRuns: 5, successRate: 100 },
  ],
  mockRunbookExecutions: [
    { id: 'mock-exec-1', runbookId: 'mock-rb-1', result: 'SUCCESS', sid: 'EP1' },
  ],
}));

import { RunbooksRealProvider } from '../runbooks.real';
import { RunbooksMockProvider } from '../runbooks.mock';

describe('RunbooksProvider parity tests', () => {
  const real = new RunbooksRealProvider();
  const mock = new RunbooksMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getRunbooks() returns an array', async () => {
      const result = await provider.getRunbooks();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('getRunbookExecutions() returns an array', async () => {
      const result = await provider.getRunbookExecutions();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('executeRunbook() returns an object', async () => {
      const result = await provider.executeRunbook('rb-1', 'sys-1', false);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('getExecutionDetail() returns data', async () => {
      const result = await provider.getExecutionDetail('exec-1');
      // Both real and mock can return an object or null
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });
});
