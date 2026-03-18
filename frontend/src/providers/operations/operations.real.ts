// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiOperation, ApiRecord } from '../../types/api';
import type { OperationsProvider } from './operations.contract';

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

export class OperationsRealProvider implements OperationsProvider {
  async getOperations() {
    const operations = await api.getOperations() as ApiOperation[];
    return operations.map(transformOperation);
  }

  async getBackgroundJobs() {
    const jobs = await api.getJobs() as Record<string, unknown>[];
    return jobs.map(transformJob);
  }

  async getTransports() {
    const transports = await api.getTransports() as Record<string, unknown>[];
    return transports.map(transformTransport);
  }

  async getCertificates() {
    const certs = await api.getCertificates() as Record<string, unknown>[];
    return certs.map(transformCertificate);
  }

  async getLicenses() {
    return api.getLicenses();
  }
}
