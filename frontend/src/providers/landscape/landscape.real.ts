// ══════════════════════════════════════════════════════════════
// SAP Spektra — Landscape Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import { createLogger } from '../../lib/logger';
import type { ApiSystem, ApiHost, ApiRecord } from '../../types/api';
import { mockSIDLines, mockLandscapeValidation } from '../../lib/mockData';
import type { LandscapeProvider } from './landscape.contract';

const log = createLogger('LandscapeRealProvider');

export function transformDiscovery(systems: ApiSystem[]) {
  const instances = [];
  for (const sys of systems) {
    const sysInstances = (sys.instances || []) as ApiRecord[];
    const meta = (sys.systemMeta || {}) as ApiRecord;
    const ha = (sys.haConfig || {}) as ApiRecord;
    if (sysInstances.length) {
      for (const inst of sysInstances) {
        const host = sys.hosts?.find((h: ApiHost) => h.id === inst.hostId);
        instances.push({
          instanceId: `${sys.sid}_${inst.instanceNr}`,
          hostname: host?.hostname || inst.hostId || '',
          sid: sys.sid,
          role: inst.role || inst.type || '',
          product: sys.sapProduct || '',
          kernel: meta.kernelVersion || '',
          dbType: sys.dbType,
          os: host?.os || '',
          haEnabled: !!ha.haEnabled,
          haType: ha.haStrategy || null,
          haPeer: ha.secondaryNode || null,
          env: sys.environment,
          scanStatus: 'success',
          confidence: 'high',
          lastScan: sys.updatedAt || new Date().toISOString(),
        });
      }
    } else {
      const host = sys.hosts?.[0];
      instances.push({
        instanceId: `${sys.sid}_00`,
        hostname: host?.hostname || '',
        sid: sys.sid,
        role: sys.sapStackType || 'Application Server',
        product: sys.sapProduct || '',
        kernel: meta.kernelVersion || '',
        dbType: sys.dbType,
        os: host?.os || '',
        haEnabled: !!ha.haEnabled,
        haType: ha.haStrategy || null,
        haPeer: ha.secondaryNode || null,
        env: sys.environment,
        scanStatus: host ? 'success' : 'fail',
        confidence: host ? 'high' : 'low',
        lastScan: sys.updatedAt || new Date().toISOString(),
      });
    }
  }
  return instances;
}

export class LandscapeRealProvider implements LandscapeProvider {
  async getDiscovery() {
    const systems = await api.getSystems();
    return transformDiscovery(systems);
  }

  async getSIDLines() {
    try {
      const systems = await api.getSystems() as ApiRecord[];
      const byProduct: Record<string, ApiRecord> = {};
      for (const sys of systems) {
        let lineName = 'Other';
        const prod = (sys.sapProduct || '').toLowerCase();
        if (prod.includes('s/4hana')) lineName = 'ERP';
        else if (prod.includes('bw')) lineName = 'BW';
        else if (prod.includes('solman') || prod.includes('solution')) lineName = 'SOL';
        else if (prod.includes('po') || prod.includes('process')) lineName = 'PO';
        else if (prod.includes('crm')) lineName = 'CRM';
        else if (prod.includes('grc')) lineName = 'GRC';
        else lineName = sys.sapProduct || 'Other';

        if (!byProduct[lineName]) byProduct[lineName] = { ids: [], desc: sys.sapProduct || lineName };
        byProduct[lineName].ids.push(sys.id);
      }
      return Object.entries(byProduct).map(([line, data]: [string, ApiRecord]) => ({
        line,
        description: data.desc,
        systems: data.ids,
      }));
    } catch (err: unknown) {
      log.error('Failed to fetch SID lines, using mock data', { error: (err as Error).message });
      return mockSIDLines;
    }
  }

  async getLandscapeValidation() {
    try { return await api.getLandscapeValidation(); } catch (err: unknown) { log.error('Failed to fetch landscape validation', { error: (err as Error).message }); return mockLandscapeValidation; }
  }
}
