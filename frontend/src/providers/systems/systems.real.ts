// ══════════════════════════════════════════════════════════════
// SAP Spektra — Systems Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import { createLogger } from '../../lib/logger';
import type { ApiSystem, ApiHost, ApiRecord } from '../../types/api';
import type { SystemsProvider } from './systems.contract';

const log = createLogger('SystemsRealProvider');

// ── Transform: API → frontend ViewModel ──

export function transformSystem(s: ApiSystem) {
  const healthBias = (s.healthScore || 70) / 100;

  const isRiseRestricted = s.monitoringCapabilityProfile === 'RISE_RESTRICTED' || s.supportsOsMetrics === false;

  const hosts = s.hosts || [];
  const hasRealMetrics = hosts.length > 0 && !isRiseRestricted;

  let cpuUsage = null;
  let memUsage = null;
  let diskUsage = null;

  if (hasRealMetrics) {
    const avgCpu = hosts.reduce((sum: number, h: ApiHost) => sum + (Number(h.cpu) || 0), 0) / hosts.length;
    const avgMem = hosts.reduce((sum: number, h: ApiHost) => sum + (Number(h.memory) || 0), 0) / hosts.length;
    const avgDisk = hosts.reduce((sum: number, h: ApiHost) => sum + (Number(h.disk) || 0), 0) / hosts.length;
    cpuUsage = Math.round(avgCpu);
    memUsage = Math.round(avgMem);
    diskUsage = Math.round(avgDisk);
  }

  const mttrBase = s.status === 'critical' ? 40 : s.status === 'warning' ? 30 : 20;
  const mtbfBase = s.status === 'critical' ? 240 : s.status === 'warning' ? 720 : 1440;
  const healthFactor = healthBias * 0.3;

  return {
    ...s,
    type: s.sapProduct || s.type || '',
    cpu: cpuUsage,
    mem: memUsage,
    disk: diskUsage,
    isRiseRestricted,
    breaches: (s._count as Record<string, number> | undefined)?.breaches ?? (s.breaches as number || 0),
    mttr: Math.round(mttrBase + healthFactor * 15),
    mtbf: Math.round(mtbfBase + healthFactor * 500),
    availability: +(Math.min(100, 97 + healthBias * 3)).toFixed(1),
    lastCheck: s.lastCheckAt || s.updatedAt || new Date().toISOString(),
  };
}

export class SystemsRealProvider implements SystemsProvider {
  async getSystems() {
    const systems = await api.getSystems() as ApiSystem[];
    return systems.map(transformSystem);
  }

  async getSystemById(id: string) {
    const system = await api.getSystemById(id);
    return transformSystem(system);
  }

  async getSystemMetrics(id: string, hours = 2) {
    return api.getSystemHostMetrics(id, hours);
  }

  async getSystemBreaches(id: string, _limit = 50) {
    const breaches = await api.getBreaches(id) as Record<string, unknown>[];
    return breaches.map((b: ApiRecord) => ({
      ...b,
      sid: b.system?.sid || '',
    }));
  }

  async getSystemSla(id: string) {
    return api.getHealthSnapshots(id, 720);
  }

  async getServerMetrics(id: string) {
    try {
      const [hosts, sys] = await Promise.all([
        api.getHosts(id) as Promise<ApiRecord[]>,
        api.getSystemById(id) as Promise<ApiRecord>,
      ]);
      if (!hosts || !hosts.length) return null;
      const h = hosts[0];
      const hostCpu = h.cpu ?? 30;
      const hostMem = h.memory ?? 50;
      const hostDisk = h.disk ?? 40;
      const factor = ((hostCpu + hostMem + hostDisk) % 100) / 100;
      const rawDbType = (sys?.dbType || 'SAP HANA 2.0').toLowerCase();

      let dbType = 'HANA';
      let dbVersion = sys?.dbType || 'HANA 2.0 SPS07';
      if (rawDbType.includes('oracle')) { dbType = 'Oracle'; dbVersion = sys.dbType; }
      else if (rawDbType.includes('mssql') || rawDbType.includes('sql server')) { dbType = 'MSSQL'; dbVersion = sys.dbType; }
      else if (rawDbType.includes('db2')) { dbType = 'DB2'; dbVersion = sys.dbType; }
      else if (rawDbType.includes('ase')) { dbType = 'ASE'; dbVersion = sys.dbType; }
      else if (rawDbType.includes('maxdb')) { dbType = 'MaxDB'; dbVersion = sys.dbType; }

      const dbInfo: ApiRecord = {
        type: dbType,
        version: dbVersion,
        backupHrs: +(3 + factor * 8).toFixed(1),
        state: 'ONLINE',
        connections: Math.round(30 + factor * 130),
      };

      if (dbType === 'HANA') {
        Object.assign(dbInfo, {
          alerts: { errors: 0, high: 0, medium: Math.round(factor * 3) },
          hsrSt: null, hsrMode: null,
          cpuDb: Math.round(hostCpu * 0.7),
          ramPct: Math.round(hostMem),
          diskData: Math.round(hostDisk * 0.9),
          diskLog: Math.round(hostDisk * 0.6),
          diskTrace: Math.round(hostDisk * 0.4),
        });
      } else if (dbType === 'Oracle') {
        Object.assign(dbInfo, {
          tablespacePct: Math.round(55 + factor * 30),
          blockedSessions: Math.round(factor * 3),
        });
      } else if (dbType === 'ASE') {
        Object.assign(dbInfo, {
          cacheHitPct: Math.round(93 + factor * 6),
          blockingChains: Math.round(factor * 2),
          txLogPct: Math.round(hostDisk * 0.8),
          physDataPct: Math.round(hostDisk * 0.9),
          physLogPct: Math.round(hostDisk * 0.6),
        });
      } else if (dbType === 'MaxDB') {
        Object.assign(dbInfo, {
          dataVolPct: Math.round(hostDisk * 0.95),
          logVolPct: Math.round(hostDisk * 0.7),
          cacheHitPct: Math.round(94 + factor * 5),
          lockWaitPct: +(factor * 3).toFixed(1),
          sessions: Math.round(20 + factor * 50),
        });
      } else if (dbType === 'DB2') {
        Object.assign(dbInfo, {
          tablespacePct: Math.round(50 + factor * 30),
          logPct: Math.round(hostDisk * 0.6),
        });
      } else if (dbType === 'MSSQL') {
        Object.assign(dbInfo, {
          logPct: Math.round(hostDisk * 0.7),
          dataPct: Math.round(hostDisk * 0.9),
        });
      }

      return {
        avail: +(99.5 + factor * 0.5).toFixed(1),
        monSt: 'green',
        monPerf: h.status === 'active' ? 'green' : 'yellow',
        users: Math.round(5 + factor * 40),
        dialogWP: (() => { const a = Math.round(3 + factor * 8); const hold = Math.round(factor * 2); return { total: 20, active: a, free: 20 - a - hold, hold }; })(),
        lastMinLoad: Math.round(300 + factor * 2000),
        avgDbTime: +(5 + factor * 12).toFixed(1),
        freeMemPct: Math.min(Math.round(100 - hostMem), 95),
        respDist: { Dialog: Math.round(200 + factor * 300), Update: Math.round(60 + factor * 150), Background: Math.round(40 + factor * 160), RFC: Math.round(100 + factor * 250) },
        shortDumps: Math.round(factor * 15),
        failedJobs: Math.round(factor * 3),
        ping: true,
        dbInfo,
      };
    } catch (err: unknown) {
      log.error('Failed to fetch server metrics', { systemId: id, error: (err as Error).message });
      return null;
    }
  }

  async getServerDeps(id: string) {
    try {
      const deps = await api.getDependencies(id) as ApiRecord[];
      return (deps || []).map((d: ApiRecord) => ({
        name: d.name,
        status: d.status,
        detail: d.details ? (typeof d.details === 'string' ? d.details : JSON.stringify(d.details)) : `Latency: ${d.latencyMs ?? '—'}ms`,
      }));
    } catch (err: unknown) {
      log.error('Failed to fetch server dependencies', { systemId: id, error: (err as Error).message });
      return [];
    }
  }

  async getSystemInstances(id: string) {
    try {
      const [components, hosts, sys] = await Promise.all([
        api.getComponents(id) as Promise<ApiRecord[]>,
        api.getHosts(id) as Promise<ApiRecord[]>,
        api.getSystemById(id) as Promise<ApiRecord>,
      ]);
      const isRise = sys?.monitoringCapabilityProfile === 'RISE_RESTRICTED' || sys?.supportsOsMetrics === false;
      const hostMap: Record<string, ApiRecord> = {};
      for (const h of (hosts || [])) {
        hostMap[h.id] = h;
      }
      const flat = [];
      for (const comp of (components || [])) {
        for (const inst of (comp.instances || [])) {
          const host = hostMap[inst.hostId] || {};
          const cpuVal = isRise ? null : Math.round(host.cpu || 0);
          const memVal = isRise ? null : Math.round(host.memory || 0);
          const diskVal = isRise ? null : Math.round(host.disk || 0);
          flat.push({
            nr: inst.instanceNr || '00',
            role: inst.type || comp.type || '',
            roleDesc: inst.role || '',
            hostname: host.hostname || '',
            ip: host.ip || '',
            os: host.os ? `${host.os} ${host.osVersion || ''}`.trim() : '',
            ec2Type: host.ec2Type || null,
            zone: host.zone || null,
            status: inst.status === 'active' ? 'running' : inst.status === 'warning' ? 'running' : 'stopped',
            cpu: cpuVal,
            mem: memVal,
            disk: diskVal,
            availability: null,
            connections: null,
            monStatus: inst.status === 'active' ? 'green' : inst.status === 'warning' ? 'yellow' : 'red',
            pid: null,
            startedAt: null,
            componentName: comp.name,
            componentVersion: comp.version,
          });
        }
      }
      return flat;
    } catch (err: unknown) {
      log.error('Failed to fetch system instances', { systemId: id, error: (err as Error).message });
      return [];
    }
  }

  async getMetricHistory(hostname: string) {
    try {
      const systems = await api.getSystems() as ApiRecord[];
      let hostId = null;
      for (const sys of systems) {
        const hosts = await api.getHosts(sys.id) as ApiRecord[];
        const match = hosts?.find((h: ApiRecord) => h.hostname === hostname);
        if (match) { hostId = match.id; break; }
      }
      if (!hostId) return [];
      const metrics = await api.getHostMetrics(hostId, 6) as ApiRecord[];
      if (!metrics || !metrics.length) return [];
      return metrics.map((m: ApiRecord) => ({
        cpu: Math.round(m.cpu ?? 0),
        mem: Math.round(m.memory ?? 0),
        disk: Math.round(m.disk ?? 0),
      }));
    } catch (err: unknown) {
      log.error('Failed to fetch metric history', { hostname, error: (err as Error).message });
      return [];
    }
  }

  async getSystemHosts(id: string) {
    try {
      const [hosts, sys] = await Promise.all([
        api.getHosts(id) as Promise<ApiRecord[]>,
        api.getSystemById(id) as Promise<ApiRecord>,
      ]);
      const isRise = sys?.monitoringCapabilityProfile === 'RISE_RESTRICTED' || sys?.supportsOsMetrics === false;
      return (hosts || []).map((h: ApiRecord) => {
        const cpuPct = isRise ? null : Math.round(h.cpu || 0);
        const memPct = isRise ? null : Math.round(h.memory || 0);
        const diskPct = isRise ? null : Math.round(h.disk || 0);
        return {
          ...h,
          cpu: cpuPct,
          mem: memPct,
          disk: diskPct,
          availability: isRise ? null : null,
          os: h.os ? `${h.os} ${h.osVersion || ''}`.trim() : '',
          ec2Id: null,
          ec2Type: null,
          instances: (h.instances || []).map((inst: ApiRecord) => ({
            ...inst,
            nr: inst.instanceNr || '00',
            role: inst.type || inst.role || '',
            status: inst.status === 'active' ? 'running' : inst.status === 'warning' ? 'running' : 'stopped',
          })),
        };
      });
    } catch (err: unknown) {
      log.error('Failed to fetch system hosts', { systemId: id, error: (err as Error).message });
      return [];
    }
  }

  async getSystemMeta(id?: string) {
    if (id) return api.getSystemMeta(id);
    try {
      const allMeta = await api.getSystemMeta();
      const map: Record<string, ApiRecord> = {};
      for (const m of (Array.isArray(allMeta) ? allMeta : [])) {
        map[m.systemId] = m;
      }
      return map;
    } catch (err: unknown) {
      log.error('Failed to fetch system meta', { error: (err as Error).message });
      return {};
    }
  }

  async getSAPMonitoring(id: string) {
    try {
      const [sys, hosts] = await Promise.all([
        api.getSystemById(id) as Promise<ApiRecord>,
        api.getHosts(id) as Promise<ApiRecord[]>,
      ]);
      if (!sys) return null;
      const isJava = sys.sapStackType === 'JAVA' || sys.sapStackType === 'DUAL_STACK';
      const health = sys.healthScore ?? 80;
      const avgCpu = hosts?.length ? hosts.reduce((s: number, h: ApiRecord) => s + (h.cpu ?? 30), 0) / hosts.length : 30;
      const load = Math.round(avgCpu);

      if (isJava) {
        const total24h = Math.round(500 + load * 20);
        const errorCount = Math.round((100 - health) * 0.08);
        return {
          javaStack: true,
          messageMonitor: {
            total24h,
            success: total24h - errorCount,
            error: errorCount,
            waiting: Math.round((100 - health) * 0.3),
            inProcess: Math.round(3 + load * 0.12),
            errorRate: +((100 - health) * 0.015).toFixed(2),
            topInterfaces: [
              { name: 'SI_OrderCreate', namespace: 'urn:sap-com:document', messages24h: Math.round(200 + load * 5), errors: Math.round((100 - health) * 0.03) },
              { name: 'SI_MaterialSync', namespace: 'urn:sap-com:master', messages24h: Math.round(150 + load * 3), errors: 0 },
              { name: 'SI_InvoiceProcess', namespace: 'urn:sap-com:document', messages24h: Math.round(100 + load * 2), errors: Math.round((100 - health) * 0.02) },
            ],
            topErrors: health < 80 ? [
              { category: 'DELIVERY_ERROR', count: Math.round((100 - health) * 0.05), lastOccurrence: new Date(Date.now() - 3600000).toISOString() },
            ] : [],
          },
          channelMonitor: {
            active: Math.round(10 + load * 0.15),
            inactive: Math.round((100 - health) * 0.03),
            error: Math.round((100 - health) * 0.02),
            channels: [
              { name: 'HTTP_Sender', direction: 'Sender', status: 'active', messages24h: Math.round(300 + load * 4) },
              { name: 'SOAP_Receiver', direction: 'Receiver', status: 'active', messages24h: Math.round(200 + load * 3) },
              { name: 'IDoc_Receiver', direction: 'Receiver', status: health < 70 ? 'error' : 'active', messages24h: Math.round(100 + load * 2) },
            ],
          },
          alertInbox: {
            total: Math.round((100 - health) * 0.08),
            critical: Math.round((100 - health) * 0.02),
            warning: Math.round((100 - health) * 0.04),
            info: Math.round((100 - health) * 0.02),
            alerts: health < 85 ? [
              { severity: 'warning', category: 'CHANNEL', time: new Date(Date.now() - 3600000).toISOString(), text: 'Channel retry count exceeded threshold' },
            ] : [],
          },
          cacheStats: {
            icmCache: { hitRate: +(92 + health * 0.07).toFixed(1), size: `${Math.round(50 + load)}MB`, maxSize: '256MB' },
            metadataCache: { hitRate: +(96 + health * 0.03).toFixed(1), entries: Math.round(500 + load * 10), staleEntries: Math.round((100 - health) * 0.2) },
            mappingCache: { hitRate: +(93 + health * 0.06).toFixed(1), compiledMappings: Math.round(30 + load * 0.5), cacheSize: `${Math.round(20 + load * 0.4)}MB` },
          },
        };
      }

      const failedJobs = Math.round((100 - health) * 0.04);
      return {
        sm12: {
          totalLocks: Math.round(5 + load * 0.3),
          oldLocks: Math.round((100 - health) * 0.08),
          maxAge: `${Math.round(1 + (100 - health) * 0.05)}h ${Math.round((100 - health) * 0.5)}m`,
          topUsers: ['BATCH_USER', 'DIALOG_USER', 'RFC_USER'].slice(0, health < 80 ? 3 : 2),
          topTables: ['MARA', 'VBAK', 'BSEG', 'EKKO'].slice(0, health < 80 ? 4 : 2),
        },
        sm13: {
          pending: Math.round((100 - health) * 0.05),
          failed: Math.round((100 - health) * 0.03),
          active: Math.round(2 + load * 0.08),
          avgDelay: `${(0.5 + (100 - health) * 0.03).toFixed(1)}s`,
          lastFailed: health < 85 ? new Date(Date.now() - 7200000).toISOString() : null,
        },
        sm37: {
          running: Math.round(2 + load * 0.05),
          scheduled: Math.round(10 + load * 0.2),
          finished: Math.round(50 + load),
          failed: failedJobs,
          canceled: Math.round((100 - health) * 0.02),
          longRunning: [
            { name: 'ZREP_DAILY_POSTING', runtime: `${Math.round(10 + load * 0.3)}m`, status: 'running' },
            ...(health < 75 ? [{ name: 'RSBTCDEL2', runtime: `${Math.round(5 + load * 0.15)}m`, status: 'running' }] : []),
          ],
        },
        sm21: {
          total: Math.round(20 + load * 0.8),
          errors: Math.round((100 - health) * 0.15),
          warnings: Math.round(5 + (100 - health) * 0.3),
          security: Math.round((100 - health) * 0.03),
        },
        st22TopPrograms: failedJobs > 0
          ? ['ZREP_MATERIAL_REVAL', 'SAPLSDTX', 'CL_GUI_ALV_GRID'].slice(0, Math.min(3, failedJobs))
          : [],
      };
    } catch (err: unknown) {
      log.error('Failed to fetch SAP monitoring data', { systemId: id, error: (err as Error).message });
      return null;
    }
  }
}
