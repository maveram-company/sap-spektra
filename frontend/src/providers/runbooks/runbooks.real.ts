// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiRunbook, ApiRecord } from '../../types/api';
import type { RunbooksProvider } from './runbooks.contract';

export function transformRunbook(r: ApiRunbook) {
  const execs = r.executions || [];
  const totalRuns = execs.length;
  const successCount = execs.filter((e: Record<string, unknown>) => e.result === 'SUCCESS').length;
  const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;

  let avgDuration = '—';
  if (totalRuns > 0) {
    const durations = execs.filter((e: Record<string, unknown>) => e.duration).map((e: Record<string, unknown>) => e.duration);
    avgDuration = durations.length > 0 ? String(durations[0]) : '—';
  }

  let prereqs = r.prereqs;
  if (typeof prereqs === 'string') {
    try { prereqs = JSON.parse(prereqs); } catch { prereqs = null; }
  }
  let steps = r.steps;
  if (typeof steps === 'string') {
    try { steps = JSON.parse(steps); } catch { steps = []; }
  }

  return {
    ...r,
    auto: r.autoExecute || false,
    gate: r.costSafe ? 'SAFE' : 'HUMAN',
    totalRuns,
    successRate,
    avgDuration,
    prereqs,
    steps,
  };
}

export function transformRunbookExecution(exec: ApiRecord) {
  return {
    ...exec,
    sid: exec.system?.sid || '',
    ts: exec.startedAt
      ? new Date(exec.startedAt).toLocaleString('es-CO', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '',
  };
}

export class RunbooksRealProvider implements RunbooksProvider {
  async getRunbooks() {
    const runbooks = await api.getRunbooks() as ApiRunbook[];
    return runbooks.map(transformRunbook);
  }

  async getRunbookExecutions() {
    const execs = await api.getRunbookExecutions() as Record<string, unknown>[];
    return execs.map(transformRunbookExecution);
  }

  async executeRunbook(runbookId: string, systemId: string, dryRun = false) {
    return api.executeRunbook(runbookId, systemId, dryRun);
  }

  async getExecutionDetail(executionId: string) {
    return api.getExecutionDetail(executionId);
  }
}
