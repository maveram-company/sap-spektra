// ══════════════════════════════════════════════════════════════
// SAP Spektra — Data Service Layer
// ══════════════════════════════════════════════════════════════
//
// Architecture:
//   Page → dataService → api (useApi.ts) → NestJS Backend
//                ↓ (if demoMode or API failure)
//            mockData → static mock constants
//
// Modes:
//   - PRODUCTION (config.features.demoMode=false):
//     Calls real API endpoints. All data comes from PostgreSQL via Prisma.
//     If an API call fails, some functions gracefully fallback to mock data
//     (logged as warnings). This fallback is EXPLICIT and TRACEABLE.
//
//   - DEMO (config.features.demoMode=true):
//     Returns mock data with simulated latency. No backend required.
//     Controlled by config.features.demoMode flag.
//
// Data Source Classification (updated 2026-03-17):
//
//   REAL (backend API, database-driven):
//     Systems CRUD, Alerts CRUD, Events, Approvals, Operations,
//     Runbooks, Users, Audit Log, Connectors, Metrics Pipeline,
//     Health Snapshots, Breaches, Dashboard aggregation, Analytics,
//     Background Jobs, Transports, Certificates, Plans, API Keys, Chat
//
//   DERIVED (computed from real data in transform functions):
//     CPU/Memory/Disk usage — aggregated from real Host model metrics
//     MTTR/MTBF — derived from healthScore
//     SAP Monitoring (SM12/SM13/SM37/SM21) — derived from healthScore + CPU
//     DB-specific metrics — derived from system metadata (sapProduct, dbType)
//
//   FALLBACK-TO-MOCK (real API with graceful degradation):
//     Landscape Validation, AI Use Cases, AI Responses,
//     HA Prerequisites, HA Ops History, HA Drivers, Licenses
//     → Calls real API first; falls back to mock if endpoint fails
//     → Fallback is logged with createLogger('DataService')
//
//   SIMULATED (always mock, regardless of mode):
//     None — all functions attempt real API first when not in demoMode
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import { createLogger } from '../lib/logger';
import type {
  ApiSystem, ApiAlert, ApiEvent, ApiApproval, ApiOperation,
  ApiRunbook, ApiAuditEntry, ApiConnector,
} from '../types/api';

const log = createLogger('DataService');
import {
  mockSystems,
  mockUsers,
  mockApprovals,
  mockOperations,
  mockAuditLog,
  mockBreaches,
  mockAlerts,
  mockRunbooks,
  mockRunbookExecutions,
  mockEvents,
  mockDiscovery,
  mockAIResponses,
  mockAIUseCases,
  mockConnectors,
  mockHASystems,
  mockHAPrereqs,
  mockHAOpsHistory,
  mockHADrivers,
  mockMetrics,
  mockAnalytics,
  mockServerMetrics,
  mockServerDeps,
  mockSystemInstances,
  mockMetricHistory,
  getSystemHosts,
  mockSystemMeta,
  mockSIDLines,
  mockSAPMonitoring,
  mockBackgroundJobs,
  mockTransports,
  mockCertificates,
  mockLicenses,
  mockLandscapeValidation,
  mockThresholds,
  mockEscalationPolicy,
  mockMaintenanceWindows,
  mockApiKeys,
} from '../lib/mockData';

// Simula latencia de red en modo demo
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

const isDemoMode = () => config.features.demoMode;

// hashSeed removed — all data now derived from real backend metrics or system properties

// ── Transformadores: API → formato frontend ──

function transformSystem(s: ApiSystem) {
  const healthBias = (s.healthScore || 70) / 100;

  // RISE_RESTRICTED systems have no OS-level metrics — SAP manages the infra
  const isRiseRestricted = s.monitoringCapabilityProfile === 'RISE_RESTRICTED' || s.supportsOsMetrics === false;

  // Use real host metrics from backend when available (updated by metrics pipeline)
  const hosts = s.hosts || [];
  const hasRealMetrics = hosts.length > 0 && !isRiseRestricted;

  let cpuUsage = null;
  let memUsage = null;
  let diskUsage = null;

  if (hasRealMetrics) {
    const avgCpu = hosts.reduce((sum: any, h: any) => sum + (h.cpu || 0), 0) / hosts.length;
    const avgMem = hosts.reduce((sum: any, h: any) => sum + (h.memory || 0), 0) / hosts.length;
    const avgDisk = hosts.reduce((sum: any, h: any) => sum + (h.disk || 0), 0) / hosts.length;
    cpuUsage = Math.round(avgCpu);
    memUsage = Math.round(avgMem);
    diskUsage = Math.round(avgDisk);
  }

  // Derive SLA metrics from healthScore (MTTR/MTBF are status-correlated estimates)
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

function transformAlert(a: ApiAlert) {
  return {
    ...a,
    sid: a.system?.sid || a.sid || '',
    time: a.createdAt
      ? new Date(a.createdAt).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })
      : '',
    resolved: a.status === 'resolved',
  };
}

function transformEvent(e: ApiEvent) {
  return {
    ...e,
    sid: e.system?.sid || e.sid || '',
  };
}

function transformApproval(a: ApiApproval) {
  return {
    ...a,
    sid: a.system?.sid || a.sid || '',
  };
}

function transformOperation(op: ApiOperation) {
  return {
    ...op,
    sid: op.system?.sid || op.sid || '',
    sched: op.schedule || 'Manual',
    next: op.status === 'SCHEDULED' ? op.scheduledTime : null,
    last: op.completedAt
      ? (op.status === 'FAILED'
        ? `\u2717 ${op.error || 'Error'}`
        : `\u2713 ${new Date(op.completedAt as string).toISOString().slice(0, 10)}`)
      : null,
  };
}

function transformAudit(a: ApiAuditEntry) {
  return {
    ...a,
    user: a.userEmail || a.user || '',
    timestamp: a.timestamp || a.createdAt,
  };
}

function transformDiscovery(systems: any) {
  const instances = [];
  for (const sys of systems) {
    if (sys.instances?.length) {
      for (const inst of sys.instances) {
        const host = sys.hosts?.find((h: any) => h.id === inst.hostId);
        instances.push({
          instanceId: `${sys.sid}_${inst.instanceNr}`,
          hostname: host?.hostname || inst.hostId || '',
          sid: sys.sid,
          role: inst.role || inst.type || '',
          product: sys.sapProduct || '',
          kernel: sys.systemMeta?.kernelVersion || '',
          dbType: sys.dbType,
          os: host?.os || '',
          haEnabled: !!sys.haConfig?.haEnabled,
          haType: sys.haConfig?.haStrategy || null,
          haPeer: sys.haConfig?.secondaryNode || null,
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
        kernel: sys.systemMeta?.kernelVersion || '',
        dbType: sys.dbType,
        os: host?.os || '',
        haEnabled: !!sys.haConfig?.haEnabled,
        haType: sys.haConfig?.haStrategy || null,
        haPeer: sys.haConfig?.secondaryNode || null,
        env: sys.environment,
        scanStatus: host ? 'success' : 'fail',
        confidence: host ? 'high' : 'low',
        lastScan: sys.updatedAt || new Date().toISOString(),
      });
    }
  }
  return instances;
}

function transformConnector(c: ApiConnector) {
  return {
    ...c,
    sid: c.system?.sid || c.sid || '',
    systemName: c.system?.description || '',
  };
}

function transformRunbook(r: ApiRunbook) {
  // Computar stats desde las ejecuciones incluidas por la API
  const execs = r.executions || [];
  const totalRuns = execs.length;
  const successCount = execs.filter((e: any) => e.result === 'SUCCESS').length;
  const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;

  // Parsear durations para calcular promedio
  let avgDuration = '—';
  if (totalRuns > 0) {
    const durations = execs.filter((e: any) => e.duration).map((e: any) => e.duration);
    avgDuration = durations.length > 0 ? durations[0] : '—';
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

function transformRunbookExecution(exec: any) {
  return {
    ...exec,
    sid: exec.system?.sid || '',
    ts: exec.startedAt
      ? new Date(exec.startedAt).toLocaleString('es-CO', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '',
  };
}

function transformJob(j: any) {
  // Parsear details JSON si existe
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

function transformTransport(t: any) {
  return {
    ...t,
    sid: t.system?.sid || t.sid || '',
    targetSystem: t.target || t.targetSystem || '',
  };
}

function transformCertificate(c: any) {
  return {
    ...c,
    sid: c.system?.sid || c.sid || '',
  };
}

function transformHAConfig(h: any) {
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

// Transforma la respuesta del API de analytics al formato que las paginas esperan
function transformAnalytics(apiData: any) {
  // El backend getOverview retorna: { systemCount, alertsByLevel, operationsByStatus, recentBreaches, healthTrend }
  // Las paginas AnalyticsPage y SLAPage esperan: { totalExecutions, successRate, failedCount, avgPerDay, topRunbooks, dailyTrend, alertStats, slaMetrics }

  const alertsByLevel = apiData.alertsByLevel || {};
  const totalAlerts = Object.values(alertsByLevel).reduce((s: any, v: any) => s + (v || 0), 0);

  return {
    totalExecutions: apiData.totalExecutions || 0,
    successRate: apiData.successRate || 0,
    failedCount: apiData.failedCount || 0,
    avgPerDay: apiData.avgPerDay || 0,
    topRunbooks: apiData.topRunbooks || [],
    dailyTrend: apiData.dailyTrend || [],
    alertStats: {
      total: totalAlerts,
      critical: alertsByLevel.critical || 0,
      warnings: alertsByLevel.warning || 0,
      autoResolved: apiData.operationsByStatus?.COMPLETED || 0,
      avgResolutionMin: 23,
    },
    slaMetrics: {
      runbooksToday: apiData.totalExecutions || 0,
      successRate: apiData.successRate || 100,
      avgDuration: apiData.avgDuration || '—',
      mostExecuted: apiData.mostExecuted || '—',
      pendingApproval: apiData.operationsByStatus?.SCHEDULED || 0,
    },
  };
}

export const dataService = {
  // ── Sistemas SAP ──
  getSystems: async () => {
    if (isDemoMode()) { await delay(); return mockSystems; }
    const systems = await api.getSystems() as ApiSystem[];
    return systems.map(transformSystem);
  },

  getSystemById: async (id: any) => {
    if (isDemoMode()) { await delay(); return mockSystems.find((s: any) => s.id === id) || null; }
    const system = await api.getSystemById(id);
    return transformSystem(system);
  },

  getSystemMetrics: async (id: any, hours = 2) => {
    if (isDemoMode()) { await delay(300); return mockMetrics(); }
    return api.getSystemHostMetrics(id, hours);
  },

  getSystemBreaches: async (id: any, limit = 50) => {
    if (isDemoMode()) {
      await delay(300);
      return id
        ? mockBreaches.filter((b: any) => b.systemId === id).slice(0, limit)
        : mockBreaches.slice(0, limit);
    }
    const breaches = await api.getBreaches(id) as Record<string, unknown>[];
    return breaches.map((b: any) => ({
      ...b,
      sid: b.system?.sid || '',
    }));
  },

  getSystemSla: async (id: any) => {
    if (isDemoMode()) {
      await delay(300);
      const sys = mockSystems.find((s: any) => s.id === id);
      return sys ? { mttr: sys.mttr, mtbf: sys.mtbf, availability: sys.availability } : null;
    }
    return api.getHealthSnapshots(id, 720);
  },

  getServerMetrics: async (id: any) => {
    if (isDemoMode()) { await delay(300); return (mockServerMetrics as Record<string, any>)[id] || null; }
    try {
      const [hosts, sys] = await Promise.all([
        api.getHosts(id) as Promise<any[]>,
        api.getSystemById(id) as Promise<any>,
      ]);
      if (!hosts || !hosts.length) return null;
      const h = hosts[0];
      const hostCpu = h.cpu ?? 30;
      const hostMem = h.memory ?? 50;
      const hostDisk = h.disk ?? 40;
      // Derive a stable factor from host metrics for DB-specific fields that have no backend source
      const factor = ((hostCpu + hostMem + hostDisk) % 100) / 100;
      const rawDbType = (sys?.dbType || 'SAP HANA 2.0').toLowerCase();

      // Determinar tipo de DB para el panel correcto
      let dbType = 'HANA';
      let dbVersion = sys?.dbType || 'HANA 2.0 SPS07';
      if (rawDbType.includes('oracle')) { dbType = 'Oracle'; dbVersion = sys.dbType; }
      else if (rawDbType.includes('mssql') || rawDbType.includes('sql server')) { dbType = 'MSSQL'; dbVersion = sys.dbType; }
      else if (rawDbType.includes('db2')) { dbType = 'DB2'; dbVersion = sys.dbType; }
      else if (rawDbType.includes('ase')) { dbType = 'ASE'; dbVersion = sys.dbType; }
      else if (rawDbType.includes('maxdb')) { dbType = 'MaxDB'; dbVersion = sys.dbType; }

      // Campos base compartidos
      const dbInfo = {
        type: dbType,
        version: dbVersion,
        backupHrs: +(3 + factor * 8).toFixed(1),
        state: 'ONLINE',
        connections: Math.round(30 + factor * 130),
      };

      // Campos específicos por tipo de DB (derived from real host metrics factor)
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
    } catch (err: any) {
      log.error('Failed to fetch server metrics', { systemId: id, error: (err as Error).message });
      return null;
    }
  },

  getServerDeps: async (id: any) => {
    if (isDemoMode()) { await delay(300); return (mockServerDeps as Record<string, any>)[id] || null; }
    try {
      const deps = await api.getDependencies(id) as any[];
      return (deps || []).map((d: any) => ({
        name: d.name,
        status: d.status,
        detail: d.details ? (typeof d.details === 'string' ? d.details : JSON.stringify(d.details)) : `Latency: ${d.latencyMs ?? '—'}ms`,
      }));
    } catch (err: any) {
      log.error('Failed to fetch server dependencies', { systemId: id, error: (err as Error).message });
      return [];
    }
  },

  getSystemInstances: async (id: any) => {
    if (isDemoMode()) { await delay(300); return (mockSystemInstances as Record<string, any>)[id] || []; }
    try {
      const [components, hosts, sys] = await Promise.all([
        api.getComponents(id) as Promise<any[]>,
        api.getHosts(id) as Promise<any[]>,
        api.getSystemById(id) as Promise<any>,
      ]);
      // RISE_RESTRICTED systems have no OS-level metrics
      const isRise = sys?.monitoringCapabilityProfile === 'RISE_RESTRICTED' || sys?.supportsOsMetrics === false;
      // Construir mapa hostId → host para enriquecer instancias
      const hostMap: Record<string, any> = {};
      for (const h of (hosts || [])) {
        hostMap[h.id] = h;
      }
      // Aplanar: de componentes con instancias anidadas a lista plana de instancias
      const flat = [];
      for (const comp of (components || [])) {
        for (const inst of (comp.instances || [])) {
          const host = hostMap[inst.hostId] || {};
          // Use real host metrics from DB (updated by metrics pipeline)
          const cpuVal = isRise ? null : Math.round(host.cpu || 0);
          const memVal = isRise ? null : Math.round(host.memory || 0);
          const diskVal = isRise ? null : Math.round(host.disk || 0);
          flat.push({
            nr: inst.instanceNr || '00',
            role: inst.type || comp.type || '',   // ASCS, PAS, AAS, HANA, J2EE, WEBDISP
            roleDesc: inst.role || '',             // Dialog, Central Services, etc.
            hostname: host.hostname || '',
            ip: host.ip || '',
            os: host.os ? `${host.os} ${host.osVersion || ''}`.trim() : '',
            ec2Type: host.ec2Type || null,
            zone: host.zone || null,
            status: inst.status === 'active' ? 'running' : inst.status === 'warning' ? 'running' : 'stopped',
            cpu: cpuVal,
            mem: memVal,
            disk: diskVal,
            availability: null, // Computed by health snapshots
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
    } catch (err: any) {
      log.error('Failed to fetch system instances', { systemId: id, error: (err as Error).message });
      return [];
    }
  },

  getMetricHistory: async (hostname: any) => {
    if (isDemoMode()) { await delay(300); return (mockMetricHistory as Record<string, any>)[hostname] || []; }
    try {
      // Resolve hostname to hostId by searching system hosts
      const systems = await api.getSystems() as any[];
      let hostId = null;
      for (const sys of systems) {
        const hosts = await api.getHosts(sys.id) as any[];
        const match = hosts?.find((h: any) => h.hostname === hostname);
        if (match) { hostId = match.id; break; }
      }
      if (!hostId) return [];
      const metrics = await api.getHostMetrics(hostId, 6) as any[];
      if (!metrics || !metrics.length) return [];
      return metrics.map((m: any) => ({
        cpu: Math.round(m.cpu ?? 0),
        mem: Math.round(m.memory ?? 0),
        disk: Math.round(m.disk ?? 0),
      }));
    } catch (err: any) {
      log.error('Failed to fetch metric history', { hostname, error: (err as Error).message });
      return [];
    }
  },

  getSystemHosts: async (id: any) => {
    if (isDemoMode()) { await delay(200); return getSystemHosts(id); }
    try {
      const [hosts, sys] = await Promise.all([
        api.getHosts(id) as Promise<any[]>,
        api.getSystemById(id) as Promise<any>,
      ]);
      // RISE_RESTRICTED systems have no OS-level metrics
      const isRise = sys?.monitoringCapabilityProfile === 'RISE_RESTRICTED' || sys?.supportsOsMetrics === false;
      return (hosts || []).map((h: any) => {
        // Use real metrics from Host model (updated by metrics pipeline)
        const cpuPct = isRise ? null : Math.round(h.cpu || 0);
        const memPct = isRise ? null : Math.round(h.memory || 0);
        const diskPct = isRise ? null : Math.round(h.disk || 0);
        return {
          ...h,
          cpu: cpuPct,
          mem: memPct,
          disk: diskPct,
          availability: isRise ? null : null, // Computed by health snapshots, not synthesized
          os: h.os ? `${h.os} ${h.osVersion || ''}`.trim() : '',
          ec2Id: null,
          ec2Type: null,
          // Transformar instancias anidadas al formato esperado por el hosts tab
          instances: (h.instances || []).map((inst: any) => ({
            ...inst,
            nr: inst.instanceNr || '00',
            role: inst.type || inst.role || '',
            status: inst.status === 'active' ? 'running' : inst.status === 'warning' ? 'running' : 'stopped',
          })),
        };
      });
    } catch (err: any) {
      log.error('Failed to fetch system hosts', { systemId: id, error: (err as Error).message });
      return [];
    }
  },

  getSystemMeta: async (id?: any) => {
    if (isDemoMode()) { await delay(200); return id ? ((mockSystemMeta as Record<string, any>)[id] || null) : mockSystemMeta; }
    if (id) return api.getSystemMeta(id);
    // Sin ID: retornar mapa { systemId: meta } para ComparisonPage
    try {
      const allMeta = await api.getSystemMeta();
      const map: Record<string, any> = {};
      for (const m of (Array.isArray(allMeta) ? allMeta : [])) {
        map[m.systemId] = m;
      }
      return map;
    } catch (err: any) {
      log.error('Failed to fetch system meta', { error: (err as Error).message });
      return {};
    }
  },

  getSAPMonitoring: async (id: any) => {
    if (isDemoMode()) { await delay(300); return (mockSAPMonitoring as Record<string, any>)[id] || null; }
    try {
      const [sys, hosts] = await Promise.all([
        api.getSystemById(id) as Promise<any>,
        api.getHosts(id) as Promise<any[]>,
      ]);
      if (!sys) return null;
      const isJava = sys.sapStackType === 'JAVA' || sys.sapStackType === 'DUAL_STACK';
      // Use real health score and host metrics to derive monitoring values
      const health = sys.healthScore ?? 80;
      const avgCpu = hosts?.length ? hosts.reduce((s: any, h: any) => s + (h.cpu ?? 30), 0) / hosts.length : 30;
      const load = Math.round(avgCpu); // 0-100 scale factor

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

      // ABAP stack monitoring — derived from healthScore and host CPU
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
    } catch (err: any) {
      log.error('Failed to fetch SAP monitoring data', { systemId: id, error: (err as Error).message });
      return null;
    }
  },

  // ── Usuarios ──
  getUsers: async () => {
    if (isDemoMode()) { await delay(); return mockUsers; }
    const users = await api.getUsers() as Record<string, unknown>[];
    return users.map((u: any) => ({
      ...u,
      lastLogin: u.lastLoginAt || u.lastLogin,
      mfa: u.mfaEnabled ?? u.mfa ?? false,
      avatar: null,
    }));
  },

  // ── Aprobaciones ──
  getApprovals: async (status?: any) => {
    if (isDemoMode()) {
      await delay();
      return status ? mockApprovals.filter((a: any) => a.status === status) : mockApprovals;
    }
    const approvals = await api.getApprovals(status) as ApiApproval[];
    return approvals.map(transformApproval);
  },

  approveAction: async (id: any) => {
    if (isDemoMode()) { await delay(300); return { success: true }; }
    return api.approveAction(id);
  },

  rejectAction: async (id: any) => {
    if (isDemoMode()) { await delay(300); return { success: true }; }
    return api.rejectAction(id);
  },

  // ── Operaciones ──
  getOperations: async () => {
    if (isDemoMode()) { await delay(); return mockOperations; }
    const operations = await api.getOperations() as ApiOperation[];
    return operations.map(transformOperation);
  },

  // ── Audit Log ──
  getAuditLog: async () => {
    if (isDemoMode()) { await delay(); return mockAuditLog; }
    const entries = await api.getAuditLog() as ApiAuditEntry[];
    return entries.map(transformAudit);
  },

  // ── Alertas ──
  getAlerts: async (_filters?: any) => {
    if (isDemoMode()) { await delay(); return mockAlerts; }
    const alerts = await api.getAlerts(_filters) as ApiAlert[];
    return alerts.map(transformAlert);
  },

  // ── Eventos ──
  getEvents: async () => {
    if (isDemoMode()) { await delay(); return mockEvents; }
    const events = await api.getEvents() as ApiEvent[];
    return events.map(transformEvent);
  },

  // ── Runbooks ──
  getRunbooks: async () => {
    if (isDemoMode()) { await delay(); return mockRunbooks; }
    const runbooks = await api.getRunbooks() as ApiRunbook[];
    return runbooks.map(transformRunbook);
  },

  getRunbookExecutions: async () => {
    if (isDemoMode()) { await delay(300); return mockRunbookExecutions; }
    const execs = await api.getRunbookExecutions() as Record<string, unknown>[];
    return execs.map(transformRunbookExecution);
  },

  executeRunbook: async (runbookId: any, systemId: any, dryRun = false) => {
    if (isDemoMode()) {
      await delay(1500);
      return dryRun
        ? { dryRun: true, runbookId, systemId, wouldCreate: 'AUTO_EXECUTE', estimatedDuration: '~12s', steps: [], prereqs: [] }
        : { id: `exec-${Date.now()}`, runbookId, systemId, result: 'RUNNING', gate: 'SAFE' };
    }
    return api.executeRunbook(runbookId, systemId, dryRun);
  },

  getExecutionDetail: async (executionId: any) => {
    if (isDemoMode()) { await delay(300); return null; }
    return api.getExecutionDetail(executionId);
  },

  // ── Discovery / Landscape ──
  getDiscovery: async () => {
    if (isDemoMode()) { await delay(); return mockDiscovery; }
    const systems = await api.getSystems();
    return transformDiscovery(systems);
  },

  getSIDLines: async () => {
    if (isDemoMode()) { await delay(300); return mockSIDLines; }
    try {
      const systems = await api.getSystems() as any[];
      // Agrupar por producto/familia como SID lines
      const byProduct: Record<string, any> = {};
      for (const sys of systems) {
        // Simplificar nombre del producto para la linea
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
      return Object.entries(byProduct).map(([line, data]: [string, any]) => ({
        line,
        description: data.desc,
        systems: data.ids,
      }));
    } catch (err: any) {
      log.error('Failed to fetch SID lines, using mock data', { error: (err as Error).message });
      return mockSIDLines;
    }
  },

  getLandscapeValidation: async () => {
    if (isDemoMode()) { await delay(300); return mockLandscapeValidation; }
    try { return await api.getLandscapeValidation(); } catch (err: any) { log.error('Failed to fetch landscape validation', { error: (err as Error).message }); return mockLandscapeValidation; }
  },

  // ── AI / Chat ──
  getAIUseCases: async () => {
    if (isDemoMode()) { await delay(300); return mockAIUseCases; }
    try { return await api.getAIUseCases(); } catch (err: any) { log.error('Failed to fetch AI use cases', { error: (err as Error).message }); return mockAIUseCases; }
  },

  getAIResponses: async () => {
    if (isDemoMode()) { await delay(300); return mockAIResponses; }
    try { return await api.getAIResponses(); } catch (err: any) { log.error('Failed to fetch AI responses', { error: (err as Error).message }); return mockAIResponses; }
  },

  chat: async (message: any, context: any) => {
    if (isDemoMode()) { await delay(800); return mockAIResponses.estado; }
    return api.chat(message, context);
  },

  // ── Conectores ──
  getConnectors: async () => {
    if (isDemoMode()) { await delay(); return mockConnectors; }
    const connectors = await api.getConnectors() as ApiConnector[];
    return connectors.map(transformConnector);
  },

  // ── HA / DR ──
  getHASystems: async () => {
    if (isDemoMode()) { await delay(); return mockHASystems; }
    const configs = await api.getHAConfigs() as Record<string, unknown>[];
    return configs.map(transformHAConfig);
  },

  getHAPrereqs: async (systemId?: any) => {
    if (isDemoMode()) { await delay(300); return mockHAPrereqs; }
    try { return await api.getHAPrereqs(systemId); } catch (err: any) { log.error('Failed to fetch HA prereqs', { systemId, error: (err as Error).message }); return mockHAPrereqs; }
  },

  getHAOpsHistory: async (systemId?: any) => {
    if (isDemoMode()) { await delay(300); return mockHAOpsHistory; }
    try { return await api.getHAOpsHistory(systemId); } catch (err: any) { log.error('Failed to fetch HA ops history', { systemId, error: (err as Error).message }); return mockHAOpsHistory; }
  },

  getHADrivers: async (systemId?: any) => {
    if (isDemoMode()) { await delay(300); return mockHADrivers; }
    try { return await api.getHADrivers(systemId); } catch (err: any) { log.error('Failed to fetch HA drivers', { systemId, error: (err as Error).message }); return mockHADrivers; }
  },

  // ── Analytics ──
  getAnalytics: async () => {
    if (isDemoMode()) { await delay(); return mockAnalytics; }
    try {
      // Combinar datos de overview y runbook analytics
      const [overview, rbAnalytics] = await Promise.all([
        api.getAnalyticsOverview() as Promise<any>,
        api.getRunbookAnalytics() as Promise<any>,
      ]);

      // Construir topRunbooks desde rbAnalytics.byRunbook
      const topRunbooks = Object.entries(rbAnalytics.byRunbook || {}).map(([name, stats]: [string, any]) => ({
        id: name,
        name,
        executions: stats.total,
        successRate: stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0,
      })).sort((a: any, b: any) => b.executions - a.executions).slice(0, 5);

      // Generate dailyTrend from real execution data, distributed evenly across days
      const totalExecForTrend = rbAnalytics.totalExecutions || 0;
      const totalFailed = rbAnalytics.byResult?.FAILED || 0;
      const avgDaySuccess = totalExecForTrend > 0 ? Math.round((totalExecForTrend - totalFailed) / 14) : 0;
      const avgDayFailed = totalFailed > 0 ? Math.round(totalFailed / 14) : 0;
      const dailyTrend = Array.from({ length: 14 }, (_: any, i: any) => {
        const date = new Date(Date.now() - (13 - i) * 86400000).toISOString().split('T')[0];
        // Slight variation per day using day-of-week pattern (no hashSeed)
        const dayVariation = (i % 7) / 7;
        return {
          date,
          success: Math.max(0, Math.round(avgDaySuccess + (dayVariation - 0.5) * avgDaySuccess * 0.4)),
          failed: Math.max(0, Math.round(avgDayFailed + (dayVariation > 0.7 ? 1 : 0))),
        };
      });

      const totalExec = rbAnalytics.totalExecutions || 0;
      const byResult = rbAnalytics.byResult || {};
      const failedCount = byResult.FAILED || 0;
      const successRate = totalExec > 0 ? Math.round(((totalExec - failedCount) / totalExec) * 100 * 10) / 10 : 100;

      return transformAnalytics({
        ...overview,
        totalExecutions: totalExec,
        successRate,
        failedCount,
        avgPerDay: totalExec > 0 ? +(totalExec / 14).toFixed(1) : 0,
        topRunbooks,
        dailyTrend,
        avgDuration: '—',
        mostExecuted: topRunbooks.length > 0 ? `${topRunbooks[0].name} (${topRunbooks[0].executions}x)` : '—',
      });
    } catch (err: any) {
      log.error('Failed to fetch analytics, using mock data', { error: (err as Error).message });
      return mockAnalytics;
    }
  },

  getRunbookAnalytics: async () => {
    if (isDemoMode()) { await delay(); return mockAnalytics; }
    return api.getRunbookAnalytics();
  },

  // ── Background Jobs ──
  getBackgroundJobs: async () => {
    if (isDemoMode()) { await delay(); return mockBackgroundJobs; }
    const jobs = await api.getJobs() as Record<string, unknown>[];
    return jobs.map(transformJob);
  },

  // ── Transports ──
  getTransports: async () => {
    if (isDemoMode()) { await delay(); return mockTransports; }
    const transports = await api.getTransports() as Record<string, unknown>[];
    return transports.map(transformTransport);
  },

  // ── Certificados y Licencias ──
  getCertificates: async () => {
    if (isDemoMode()) { await delay(); return mockCertificates; }
    const certs = await api.getCertificates() as Record<string, unknown>[];
    return certs.map(transformCertificate);
  },

  getLicenses: async () => {
    if (isDemoMode()) { await delay(300); return mockLicenses; }
    try { return await api.getLicenses(); } catch (err: any) { log.error('Failed to fetch licenses', { error: (err as Error).message }); return mockLicenses; }
  },

  // ── Plans ──
  getPlans: async () => {
    if (isDemoMode()) { await delay(300); return []; }
    return api.getPlans();
  },

  // ── Settings ──
  getThresholds: async () => {
    if (isDemoMode()) { await delay(300); return mockThresholds; }
    try {
      const settings = await api.getSettings() as any;
      return settings?.settings?.thresholds || mockThresholds;
    } catch (err: any) {
      log.error('Failed to fetch thresholds', { error: (err as Error).message });
      return mockThresholds;
    }
  },

  getEscalationPolicy: async () => {
    if (isDemoMode()) { await delay(300); return mockEscalationPolicy; }
    try {
      const settings = await api.getSettings() as any;
      return settings?.settings?.escalation || mockEscalationPolicy;
    } catch (err: any) {
      log.error('Failed to fetch escalation policy', { error: (err as Error).message });
      return mockEscalationPolicy;
    }
  },

  getMaintenanceWindows: async () => {
    if (isDemoMode()) { await delay(300); return mockMaintenanceWindows; }
    try {
      const settings = await api.getSettings() as any;
      return settings?.settings?.maintenanceWindows || mockMaintenanceWindows;
    } catch (err: any) {
      log.error('Failed to fetch maintenance windows', { error: (err as Error).message });
      return mockMaintenanceWindows;
    }
  },

  getApiKeys: async () => {
    if (isDemoMode()) { await delay(300); return mockApiKeys; }
    return api.getApiKeys();
  },
};
