// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import { createLogger } from '../../lib/logger';
import type { ApiOperation, ApiRecord } from '../../types/api';
import { mockLicenses } from '../../lib/mockData';
import type { OperationsProvider, OperationViewModel } from './operations.contract';
import { providerResult } from '../types';

const log = createLogger('OperationsRealProvider');

export function transformOperation(op: ApiOperation): OperationViewModel {
  return {
    ...op,
    sid: op.system?.sid || (op as ApiRecord).sid as string || '',
    riskLevel: op.riskLevel || '',
    time: op.createdAt
      ? new Date(op.createdAt).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })
      : '',
    sched: (op as ApiRecord).schedule || 'Manual',
    next: op.status === 'SCHEDULED' ? (op as ApiRecord).scheduledTime : null,
    last: (op as ApiRecord).completedAt
      ? (op.status === 'FAILED'
        ? `\u2717 ${(op as ApiRecord).error || 'Error'}`
        : `\u2713 ${new Date((op as ApiRecord).completedAt as string).toISOString().slice(0, 10)}`)
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
    return providerResult(operations.map(transformOperation), 'real');
  }

  async getBackgroundJobs() {
    const jobs = await api.getJobs() as Record<string, unknown>[];
    return providerResult(jobs.map(transformJob), 'real');
  }

  async getTransports() {
    const transports = await api.getTransports() as Record<string, unknown>[];
    return providerResult(transports.map(transformTransport), 'real');
  }

  async getCertificates() {
    const certs = await api.getCertificates() as Record<string, unknown>[];
    return providerResult(certs.map(transformCertificate), 'real');
  }

  async getLicenses() {
    try {
      const data = await api.getLicenses();
      return providerResult(data as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch licenses', { error: (err as Error).message });
      return providerResult(mockLicenses as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }
}
