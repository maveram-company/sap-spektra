import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getApprovals: vi.fn().mockResolvedValue([
      { id: 'apr-1', status: 'PENDING', system: { sid: 'EP1' } },
    ]),
    approveAction: vi.fn().mockResolvedValue({ success: true }),
    rejectAction: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockApprovals: [
    { id: 'mock-apr-1', status: 'PENDING', sid: 'EP1' },
    { id: 'mock-apr-2', status: 'APPROVED', sid: 'EQ1' },
  ],
}));

import { ApprovalsRealProvider } from '../approvals.real';
import { ApprovalsMockProvider } from '../approvals.mock';

describe('ApprovalsProvider parity tests', () => {
  const real = new ApprovalsRealProvider();
  const mock = new ApprovalsMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getApprovals() returns an array', async () => {
      const result = await provider.getApprovals();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('approveAction() returns an object', async () => {
      const result = await provider.approveAction('test-id');
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('rejectAction() returns an object', async () => {
      const result = await provider.rejectAction('test-id');
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });
});
