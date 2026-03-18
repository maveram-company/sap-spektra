// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: getRunbooks, getRunbookExecutions, executeRunbook, getExecutionDetail
//   DEMO: returns mock data with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import type { ApiRunbook, ApiRecord } from '../types/api';
import {
  mockRunbooks,
  mockRunbookExecutions,
} from '../lib/mockData';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Transforms: API → frontend ViewModel ──

export function transformRunbook(r: ApiRunbook) {
  // Computar stats desde las ejecuciones incluidas por la API
  const execs = r.executions || [];
  const totalRuns = execs.length;
  const successCount = execs.filter((e: Record<string, unknown>) => e.result === 'SUCCESS').length;
  const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;

  // Parsear durations para calcular promedio
  let avgDuration = '—';
  if (totalRuns > 0) {
    const durations = execs.filter((e: Record<string, unknown>) => e.duration).map((e: Record<string, unknown>) => e.duration);
    avgDuration = durations.length > 0 ? String(durations[0]) : '—';
  }

  // Parsear prereqs y steps si son strings JSON
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

// ── Public API ──

export const getRunbooks = async () => {
  if (isDemoMode()) { await delay(); return mockRunbooks; }
  const runbooks = await api.getRunbooks() as ApiRunbook[];
  return runbooks.map(transformRunbook);
};

export const getRunbookExecutions = async () => {
  if (isDemoMode()) { await delay(300); return mockRunbookExecutions; }
  const execs = await api.getRunbookExecutions() as Record<string, unknown>[];
  return execs.map(transformRunbookExecution);
};

export const executeRunbook = async (runbookId: string, systemId: string, dryRun = false) => {
  if (isDemoMode()) {
    await delay(1500);
    return dryRun
      ? { dryRun: true, runbookId, systemId, wouldCreate: 'AUTO_EXECUTE', estimatedDuration: '~12s', steps: [], prereqs: [] }
      : { id: `exec-${Date.now()}`, runbookId, systemId, result: 'RUNNING', gate: 'SAFE' };
  }
  return api.executeRunbook(runbookId, systemId, dryRun);
};

export const getExecutionDetail = async (executionId: string) => {
  if (isDemoMode()) { await delay(300); return null; }
  return api.getExecutionDetail(executionId);
};
