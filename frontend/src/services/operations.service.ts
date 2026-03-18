// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: getOperations, getBackgroundJobs, getTransports,
//         getCertificates, getLicenses
//   DEMO: returns mock data with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import { createLogger } from '../lib/logger';
import type { ApiOperation, ApiRecord } from '../types/api';
import {
  mockOperations,
  mockBackgroundJobs,
  mockTransports,
  mockCertificates,
  mockLicenses,
} from '../lib/mockData';

const log = createLogger('OperationsService');
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Transforms: API → frontend ViewModel ──

export function transformOperation(op: ApiOperation) {
  return {
    ...op,
    sid: op.system?.sid || op.sid || '',
    sched: op.schedule || 'Manual',
    next: op.status === 'SCHEDULED' ? op.scheduledTime : null,
    last: op.completedAt
      ? (op.status === 'FAILED'
        ? `\u2717 ${op.error || 'Error'}`
        : `\u2713 ${new Date(op.completedAt as string).toISOString().slice(0, 10)}`)
      : null,
  };
}

export function transformJob(j: ApiRecord) {
  // Parsear details JSON si existe
  let errorMsg = null;
  if (j.details) {
    try {
      const d = typeof j.details === 'string' ? JSON.parse(j.details) : j.details;
      errorMsg = d.error || null;
    } catch { /* ignore */ }
  }

  return {
    ...j,
    name: j.jobName || j.name || '',
    class: j.jobClass || j.class || '',
    runtime: j.duration || j.runtime || null,
    scheduledBy: j.user || j.scheduledBy || '',
    sid: j.system?.sid || j.sid || '',
    error: errorMsg || j.error || null,
    currentStep: j.currentStep ?? (j.status === 'finished' ? 1 : j.status === 'running' ? 1 : 0),
    stepCount: j.stepCount ?? 1,
  };
}

export function transformTransport(t: ApiRecord) {
  return {
    ...t,
    sid: t.system?.sid || t.sid || '',
    targetSystem: t.target || t.targetSystem || '',
  };
}

export function transformCertificate(c: ApiRecord) {
  return {
    ...c,
    sid: c.system?.sid || c.sid || '',
  };
}

// ── Public API ──

export const getOperations = async () => {
  if (isDemoMode()) { await delay(); return mockOperations; }
  const operations = await api.getOperations() as ApiOperation[];
  return operations.map(transformOperation);
};

export const getBackgroundJobs = async () => {
  if (isDemoMode()) { await delay(); return mockBackgroundJobs; }
  const jobs = await api.getJobs() as Record<string, unknown>[];
  return jobs.map(transformJob);
};

export const getTransports = async () => {
  if (isDemoMode()) { await delay(); return mockTransports; }
  const transports = await api.getTransports() as Record<string, unknown>[];
  return transports.map(transformTransport);
};

export const getCertificates = async () => {
  if (isDemoMode()) { await delay(); return mockCertificates; }
  const certs = await api.getCertificates() as Record<string, unknown>[];
  return certs.map(transformCertificate);
};

export const getLicenses = async () => {
  if (isDemoMode()) { await delay(300); return mockLicenses; }
  try { return await api.getLicenses(); } catch (err: unknown) { log.error('Failed to fetch licenses', { error: (err as Error).message }); return mockLicenses; }
};
