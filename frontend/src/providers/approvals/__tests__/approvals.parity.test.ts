import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getApprovals: vi.fn().mockResolvedValue([
      {
        id: 'apr-1', type: 'RUNBOOK_EXECUTE', status: 'PENDING',
        reason: 'Auto-remediation', requestedBy: 'system',
        createdAt: '2026-01-01T00:00:00Z', system: { sid: 'EP1' },
      },
    ]),
    approveAction: vi.fn().mockResolvedValue({ success: true }),
    rejectAction: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../../lib/mockData', () => ({
  mockApprovals: [
    {
      id: 'mock-apr-1', type: 'RUNBOOK_EXECUTE', status: 'PENDING',
      reason: 'Auto-remediation', requestedBy: 'system',
      sid: 'EP1', time: '14:30',
    },
    {
      id: 'mock-apr-2', type: 'SYSTEM_RESTART', status: 'APPROVED',
      reason: 'Scheduled maintenance', requestedBy: 'admin',
      sid: 'EQ1', time: '15:00',
    },
  ],
}));

import { ApprovalsRealProvider } from '../approvals.real';
import { ApprovalsMockProvider } from '../approvals.mock';

describe('ApprovalsProvider parity tests', () => {
  const real = new ApprovalsRealProvider();
  const mock = new ApprovalsMockProvider();

  // ── A) Shape parity ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getApprovals() returns an array', async () => {
      const result = await provider.getApprovals();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('approveAction() returns an object', async () => {
      const result = await provider.approveAction('test-id');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });

    it('rejectAction() returns an object', async () => {
      const result = await provider.rejectAction('test-id');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });
  });

  // ── B) Semantic parity — ApprovalViewModel fields ──

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider — semantic assertions', (_name, provider) => {
    it('getApprovals returns ApprovalViewModel[] with required fields', async () => {
      const result = await provider.getApprovals();
      for (const approval of result.data) {
        expect(typeof approval.id).toBe('string');
        expect(typeof approval.type).toBe('string');
        expect(typeof approval.status).toBe('string');
        expect(typeof approval.reason).toBe('string');
        expect(typeof approval.requestedBy).toBe('string');
        expect(typeof approval.sid).toBe('string');
      }
    });
  });

  // ── C) State transition parity — status filter, approve/reject ──

  describe('state transition parity', () => {
    it('mock supports filtering by status', async () => {
      const all = await mock.getApprovals();
      const pending = await mock.getApprovals('PENDING');
      expect(pending.data.length).toBeLessThan(all.data.length);
      for (const approval of pending.data) {
        expect(approval.status).toBe('PENDING');
      }
    });

    it('real provider accepts status filter parameter', async () => {
      const result = await real.getApprovals('PENDING');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock and real both handle approve returning an object', async () => {
      const realResult = await real.approveAction('apr-1');
      const mockResult = await mock.approveAction('apr-1');
      expect(typeof realResult.data).toBe('object');
      expect(typeof mockResult.data).toBe('object');
    });

    it('mock and real both handle reject returning an object', async () => {
      const realResult = await real.rejectAction('apr-1');
      const mockResult = await mock.rejectAction('apr-1');
      expect(typeof realResult.data).toBe('object');
      expect(typeof mockResult.data).toBe('object');
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
      const approvals = await mock.getApprovals();
      expect(Array.isArray(approvals.data)).toBe(true);
      const approveResult = await mock.approveAction('test');
      expect(approveResult.data).toBeDefined();
    });
  });

  // ── E) ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getApprovals();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getApprovals();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  // ── F) Error parity ──

  describe('error parity', () => {
    it('real provider rejects when api.approveAction throws on invalid id', async () => {
      const { api } = await import('../../../hooks/useApi');
      (api.approveAction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Approval not found'));
      await expect(real.approveAction('invalid-id')).rejects.toThrow('Approval not found');
    });

    it('real provider rejects when api.rejectAction throws on invalid id', async () => {
      const { api } = await import('../../../hooks/useApi');
      (api.rejectAction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Approval not found'));
      await expect(real.rejectAction('invalid-id')).rejects.toThrow('Approval not found');
    });

    it('mock provider handles invalid id gracefully for approveAction', async () => {
      const result = await mock.approveAction('nonexistent');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });

    it('mock provider handles invalid id gracefully for rejectAction', async () => {
      const result = await mock.rejectAction('nonexistent');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });
  });

  // ── G) Approval state parity ──

  describe('approval state parity', () => {
    it('mock approveAction returns an object with success indication', async () => {
      const result = await mock.approveAction('apr-1');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
      expect(result.source).toBe('mock');
    });

    it('mock rejectAction returns an object with success indication', async () => {
      const result = await mock.rejectAction('apr-1');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
      expect(result.source).toBe('mock');
    });

    it('real approveAction returns an object', async () => {
      const result = await real.approveAction('apr-1');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
      expect(result.source).toBe('real');
    });

    it('real rejectAction returns an object', async () => {
      const result = await real.rejectAction('apr-1');
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
      expect(result.source).toBe('real');
    });
  });

  // ── H) Evidence parity ──

  describe('evidence parity', () => {
    it('both real and mock return ProviderResult with consistent metadata', async () => {
      const realResult = await real.getApprovals();
      const mockResult = await mock.getApprovals();

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

    it('approveAction returns ProviderResult with evidence metadata', async () => {
      const realResult = await real.approveAction('apr-1');
      const mockResult = await mock.approveAction('apr-1');

      for (const result of [realResult, mockResult]) {
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('source');
        expect(result).toHaveProperty('confidence');
        expect(typeof result.degraded).toBe('boolean');
      }
    });
  });
});
