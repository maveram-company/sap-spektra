// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import { createLogger } from '../../lib/logger';
import type { ApiRecord } from '../../types/api';
import { mockHAPrereqs, mockHAOpsHistory, mockHADrivers } from '../../lib/mockData';
import type { HAProvider, HAConfigViewModel } from './ha.contract';
import { providerResult } from '../types';

const log = createLogger('HARealProvider');

export function transformHAConfig(h: ApiRecord): HAConfigViewModel {
  const sid = h.system?.sid || '';
  const env = h.system?.environment || 'PRD';
  const strategy = h.haStrategy || 'HOT_STANDBY';
  const sidNum = sid ? (sid.charCodeAt(0) + (sid.charCodeAt(1) || 0) + (sid.charCodeAt(2) || 0)) % 10 : 1;

  const primaryHost = h.primaryNode || `sap-${sid.toLowerCase()}-hana-pri`;
  const secondaryHost = h.secondaryNode || null;

  const primary: ApiRecord = {
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

  let secondary: ApiRecord | null = null;
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
    id: h.id || '',
    systemId: h.systemId || '',
    strategy,
    status: haStatus,
    primaryNode: primaryHost,
    secondaryNode: secondaryHost || '',
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

export class HARealProvider implements HAProvider {
  async getHASystems() {
    const configs = await api.getHAConfigs() as Record<string, unknown>[];
    return providerResult(configs.map(transformHAConfig), 'real');
  }

  async getHAPrereqs(systemId?: string) {
    try {
      const data = await api.getHAPrereqs(systemId!);
      return providerResult(data as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch HA prereqs', { systemId, error: (err as Error).message });
      return providerResult(mockHAPrereqs as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }

  async getHAOpsHistory(systemId?: string) {
    try {
      const data = await api.getHAOpsHistory(systemId!);
      return providerResult(data as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch HA ops history', { systemId, error: (err as Error).message });
      return providerResult(mockHAOpsHistory as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }

  async getHADrivers(systemId?: string) {
    try {
      const data = await api.getHADrivers(systemId!);
      return providerResult(data as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch HA drivers', { systemId, error: (err as Error).message });
      return providerResult(mockHADrivers as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }
}
