import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    getOperations: vi.fn().mockResolvedValue([
      { id: 'op-1', type: 'BACKUP', status: 'SCHEDULED', description: 'Backup', riskLevel: 'low', system: { sid: 'EP1' }, schedule: 'Daily', scheduledTime: '2026-01-01T22:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
    ]),
    getJobs: vi.fn().mockResolvedValue([
      { id: 'job-1', jobName: 'ZBACKUP', jobClass: 'A', status: 'finished', system: { sid: 'EP1' }, duration: '5m' },
    ]),
    getTransports: vi.fn().mockResolvedValue([
      { id: 'tr-1', transportId: 'EP1K900001', system: { sid: 'EP1' }, target: 'EQ1' },
    ]),
    getCertificates: vi.fn().mockResolvedValue([
      { id: 'cert-1', name: 'SSL Cert', system: { sid: 'EP1' }, expiresAt: '2027-01-01' },
    ]),
    getLicenses: vi.fn().mockResolvedValue([
      { id: 'lic-1', type: 'SAP S/4HANA', status: 'active' },
    ]),
  },
}));

vi.mock('../../../lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../../lib/mockData', () => ({
  mockOperations: [
    { id: 'mock-op-1', type: 'BACKUP', status: 'SCHEDULED', description: 'Backup', riskLevel: 'low', sid: 'EP1', time: '22:00' },
  ],
  mockBackgroundJobs: [
    { id: 'mock-job-1', name: 'ZBACKUP', class: 'A', status: 'finished', sid: 'EP1' },
  ],
  mockTransports: [
    { id: 'mock-tr-1', transportId: 'EP1K900001', sid: 'EP1' },
  ],
  mockCertificates: [
    { id: 'mock-cert-1', name: 'SSL Cert', sid: 'EP1' },
  ],
  mockLicenses: [
    { id: 'mock-lic-1', type: 'SAP S/4HANA', status: 'active' },
  ],
}));

import { OperationsRealProvider } from '../operations.real';
import { OperationsMockProvider } from '../operations.mock';

describe('OperationsProvider parity tests', () => {
  const real = new OperationsRealProvider();
  const mock = new OperationsMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('getOperations() returns an array', async () => {
      const result = await provider.getOperations();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getBackgroundJobs() returns an array', async () => {
      const result = await provider.getBackgroundJobs();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getTransports() returns an array', async () => {
      const result = await provider.getTransports();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getCertificates() returns an array', async () => {
      const result = await provider.getCertificates();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('getLicenses() returns data', async () => {
      const result = await provider.getLicenses();
      expect(result.data).toBeDefined();
    });
  });

  // ── ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.getOperations();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.getOperations();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
});
