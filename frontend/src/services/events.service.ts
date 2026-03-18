// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: getEvents
//   DEMO: returns mockEvents with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import type { ApiEvent } from '../types/api';
import {
  mockEvents,
} from '../lib/mockData';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Transform: API → frontend ViewModel ──

export function transformEvent(e: ApiEvent) {
  return {
    ...e,
    sid: e.system?.sid || e.sid || '',
  };
}

// ── Public API ──

export const getEvents = async () => {
  if (isDemoMode()) { await delay(); return mockEvents; }
  const events = await api.getEvents() as ApiEvent[];
  return events.map(transformEvent);
};
