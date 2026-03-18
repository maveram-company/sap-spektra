// ══════════════════════════════════════════════════════════════
// SAP Spektra — Approvals Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: getApprovals, approveAction, rejectAction
//   DEMO: returns mockApprovals with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import type { ApiApproval, ApiRecord } from '../types/api';
import {
  mockApprovals,
} from '../lib/mockData';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Transform: API → frontend ViewModel ──

export function transformApproval(a: ApiApproval) {
  return {
    ...a,
    sid: a.system?.sid || a.sid || '',
  };
}

// ── Public API ──

export const getApprovals = async (status?: string) => {
  if (isDemoMode()) {
    await delay();
    return status ? mockApprovals.filter((a: ApiRecord) => a.status === status) : mockApprovals;
  }
  const approvals = await api.getApprovals(status) as ApiApproval[];
  return approvals.map(transformApproval);
};

export const approveAction = async (id: string) => {
  if (isDemoMode()) { await delay(300); return { success: true }; }
  return api.approveAction(id);
};

export const rejectAction = async (id: string) => {
  if (isDemoMode()) { await delay(300); return { success: true }; }
  return api.rejectAction(id);
};
