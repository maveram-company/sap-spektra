// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: getConnectors
//   DEMO: returns mockConnectors with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import type { ApiConnector } from '../types/api';
import {
  mockConnectors,
} from '../lib/mockData';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Transform: API → frontend ViewModel ──

export function transformConnector(c: ApiConnector) {
  return {
    ...c,
    sid: c.system?.sid || c.sid || '',
    systemName: c.system?.description || '',
  };
}

// ── Public API ──

export const getConnectors = async () => {
  if (isDemoMode()) { await delay(); return mockConnectors; }
  const connectors = await api.getConnectors() as ApiConnector[];
  return connectors.map(transformConnector);
};
