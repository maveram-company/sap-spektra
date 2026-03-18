// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA (High Availability) Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: getHASystems
//   FALLBACK-TO-MOCK: getHAPrereqs, getHAOpsHistory, getHADrivers
//   DERIVED: HA node IPs, zones, replication details (from haConfig + system data)
//   DEMO: returns mock data with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import { createLogger } from '../lib/logger';
import type { ApiRecord } from '../types/api';
import {
  mockHASystems,
  mockHAPrereqs,
  mockHAOpsHistory,
  mockHADrivers,
} from '../lib/mockData';

const log = createLogger('HAService');
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Transform: API → frontend ViewModel ──

export function transformHAConfig(h: ApiRecord) {
  const sid = h.system?.sid || '';
  const env = h.system?.environment || 'PRD';
  const strategy = h.haStrategy || 'HOT_STANDBY';
  // Derive stable node index from sid chars for IPs/zones (no hashSeed)
  const sidNum = sid ? (sid.charCodeAt(0) + (sid.charCodeAt(1) || 0) + (sid.charCodeAt(2) || 0)) % 10 : 1;

  const primaryHost = h.primaryNode || `sap-${sid.toLowerCase()}-hana-pri`;
  const secondaryHost = h.secondaryNode || null;

  const primary = {
    id: h.id ? `${h.id}-pri` : `i-${sid.toLowerCase()}-pri`,
    host: primaryHost,
    ip: `10.0.${sidNum + 1}.10`,
    zone: `us-east-1${String.fromCharCode(97 + (sidNum % 3))}`,
    instanceNr: '10',
    state: 'running',
  };

  if (strategy === 'WARM_STANDBY') {
    Object.assign(primary, { instanceType: 'r6i.8xlarge', vcpu: 32, memoryGb: 256 });
  }

  let secondary = null;
  if (secondaryHost) {
    secondary = {
      id: h.id ? `${h.id}-sec` : `i-${sid.toLowerCase()}-sec`,
      host: secondaryHost,
      ip: `10.0.${sidNum + 2}.10`,
      zone: `us-east-1${String.fromCharCode(98 + (sidNum % 2))}`,
      instanceNr: '10',
      state: strategy === 'PILOT_LIGHT' ? 'stopped' : 'running',
    };
    if (strategy === 'WARM_STANDBY') {
      Object.assign(secondary, { instanceType: 'r6i.2xlarge', vcpu: 8, memoryGb: 64, targetInstanceType: 'r6i.8xlarge', targetVcpu: 32, targetMemoryGb: 256 });
    }
  }

  let haStatus = 'HEALTHY';
  if (!h.haEnabled) haStatus = 'NOT_CONFIGURED';
  else if (h.status === 'failover_in_progress') haStatus = 'FAILOVER_IN_PROGRESS';
  else if (h.system?.status === 'critical') haStatus = 'DEGRADED';
  else if (strategy === 'PILOT_LIGHT') haStatus = 'STANDBY';
  else if (strategy === 'BACKUP_RESTORE') haStatus = 'STANDBY';

  const replicationMode = strategy === 'HOT_STANDBY' ? 'SYNC' : strategy === 'WARM_STANDBY' ? 'ASYNC' : null;
  const replicationStatus = strategy === 'HOT_STANDBY' ? 'SOK' : strategy === 'WARM_STANDBY' ? (haStatus === 'DEGRADED' ? 'SFAIL' : 'SOK') : null;
  const replicationLag = replicationMode ? +(h.system?.healthScore ? (100 - h.system.healthScore) * (replicationMode === 'SYNC' ? 0.02 : 0.5) : 0).toFixed(1) : null;

  return {
    ...h,
    sid,
    systemName: h.system?.description || '',
    haStatus,
    haType: 'HANA_SR',
    dbType: h.system?.dbType || 'HANA',
    replicationMode,
    replicationStatus,
    replicationLag,
    networkStrategy: strategy === 'HOT_STANDBY' ? 'PACEMAKER_VIP' : strategy === 'CROSS_REGION_DR' ? 'ROUTE53' : 'EIP',
    primary,
    secondary,
    vip: strategy === 'HOT_STANDBY' ? `10.0.0.${100 + sidNum * 5}` : null,
    dnsEndpoint: strategy === 'CROSS_REGION_DR' ? `${sid.toLowerCase()}-db.sap.empresa.com` : null,
    lastCheck: h.lastFailoverAt || new Date().toISOString(),
    lastOp: h.lastFailoverAt ? { type: 'FAILOVER', status: 'SUCCESS', at: h.lastFailoverAt } : null,
    tier: env === 'PRD' ? 'production' : env === 'QAS' ? 'quality' : 'development',
    region: 'us-east-1',
    provider: 'AWS',
    warmStandbyDetails: strategy === 'WARM_STANDBY' ? {
      costSavingsPercent: 75,
      scaleUpRequired: true,
      estimatedScaleUpTime: '5-8 min',
      estimatedCatchUpTime: '3-5 min',
      preloadHint: false,
    } : undefined,
  };
}

// ── Public API ──

export const getHASystems = async () => {
  if (isDemoMode()) { await delay(); return mockHASystems; }
  const configs = await api.getHAConfigs() as Record<string, unknown>[];
  return configs.map(transformHAConfig);
};

export const getHAPrereqs = async (systemId?: string) => {
  if (isDemoMode()) { await delay(300); return mockHAPrereqs; }
  try { return await api.getHAPrereqs(systemId!); } catch (err: unknown) { log.error('Failed to fetch HA prereqs', { systemId, error: (err as Error).message }); return mockHAPrereqs; }
};

export const getHAOpsHistory = async (systemId?: string) => {
  if (isDemoMode()) { await delay(300); return mockHAOpsHistory; }
  try { return await api.getHAOpsHistory(systemId!); } catch (err: unknown) { log.error('Failed to fetch HA ops history', { systemId, error: (err as Error).message }); return mockHAOpsHistory; }
};

export const getHADrivers = async (systemId?: string) => {
  if (isDemoMode()) { await delay(300); return mockHADrivers; }
  try { return await api.getHADrivers(systemId!); } catch (err: unknown) { log.error('Failed to fetch HA drivers', { systemId, error: (err as Error).message }); return mockHADrivers; }
};
