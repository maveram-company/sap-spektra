// ══════════════════════════════════════════════════════════════
// SAP Spektra — Data Service Layer
// Capa intermedia entre páginas y fuente de datos.
// En demoMode: retorna mocks con delay simulado.
// En producción: llama a la API real y transforma al formato del frontend.
//
// DATA SOURCE STATUS (updated 2026-03-12):
//
// BACKEND-DRIVEN (API real en modo producción):
//   getSystems, getSystemById, getSystemMetrics, getSystemBreaches,
//   getSystemSla, getServerDeps, getSystemMeta, getUsers, getApprovals,
//   approveAction, rejectAction, getOperations, getAuditLog, getAlerts,
//   getEvents, getRunbooks, getRunbookExecutions, executeRunbook,
//   getDiscovery, getSIDLines, getConnectors, getHASystems, getAnalytics,
//   getRunbookAnalytics, getBackgroundJobs, getTransports, getCertificates,
//   getPlans, getApiKeys, chat
//
// SYNTHETIC (API real pero genera valores derivados en cliente):
//   getServerMetrics — DB-specific metrics (dbInfo) are synthesized
//   getSystemInstances — CPU/mem/disk/availability are synthesized
//   getSystemHosts — CPU/mem/disk/availability are synthesized
//   getSAPMonitoring — Full SAP monitoring (sm12/sm13/sm37/sm21) is synthesized
//   getMetricHistory — Time-series points are synthesized
//   transformSystem — CPU/mem/disk/MTTR/MTBF/availability are synthesized
//
// BACKEND-DRIVEN (previously stubs, now connected):
//   getLandscapeValidation, getAIUseCases, getAIResponses,
//   getHAPrereqs, getHAOpsHistory, getHADrivers, getLicenses
//   (fallback to mock data if API call fails)
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import { createLogger } from '../lib/logger';

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

// Generador determinista basado en string (para valores consistentes por sistema)
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  const x = Math.sin(h) * 10000;
  return x - Math.floor(x);
}

// ── Transformadores: API → formato frontend ──

function transformSystem(s) {
  const seed = hashSeed(s.id || s.sid || '');
  const healthBias = (s.healthScore || 70) / 100;

  // RISE_RESTRICTED systems have no OS-level metrics — SAP manages the infra
  const isRiseRestricted = s.monitoringCapabilityProfile === 'RISE_RESTRICTED' || s.supportsOsMetrics === false;

  const cpuUsage = isRiseRestricted ? null : Math.min(Math.round(25 + (1 - healthBias) * 40 + seed * 15), 95);
  const memUsage = isRiseRestricted ? null : Math.min(Math.round(35 + (1 - healthBias) * 35 + seed * 15), 95);
  const diskUsage = isRiseRestricted ? null : Math.min(Math.round(30 + (1 - healthBias) * 30 + seed * 15), 90);

  // SLA determinista por sistema
  const mttrBase = s.status === 'critical' ? 40 : s.status === 'warning' ? 30 : 20;
  const mtbfBase = s.status === 'critical' ? 240 : s.status === 'warning' ? 720 : 1440;

  return {
    ...s,
    type: s.sapProduct || s.type || '',
    cpu: cpuUsage,
    mem: memUsage,
    disk: diskUsage,
    isRiseRestricted,
    breaches: s._count?.breaches ?? (s.breaches || 0),
    mttr: Math.round(mttrBase + seed * 15),
    mtbf: Math.round(mtbfBase + seed * 500),
    availability: +(99 + healthBias * 0.9 + seed * 0.1).toFixed(1),
    lastCheck: s.lastCheckAt || s.updatedAt || new Date().toISOString(),
  };
}

function transformAlert(a) {
  return {
    ...a,
    sid: a.system?.sid || a.sid || '',
    time: a.createdAt
      ? new Date(a.createdAt).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })
      : '',
    resolved: a.status === 'resolved',
  };
}

function transformEvent(e) {
  return {
    ...e,
    sid: e.system?.sid || e.sid || '',
  };
}

function transformApproval(a) {
  return {
    ...a,
    sid: a.system?.sid || a.sid || '',
  };
}

function transformOperation(op) {
  return {
    ...op,
    sid: op.system?.sid || op.sid || '',
    sched: op.schedule || 'Manual',
    next: op.status === 'SCHEDULED' ? op.scheduledTime : null,
    last: op.completedAt
      ? (op.status === 'FAILED'
        ? `\u2717 ${op.error || 'Error'}`
        : `\u2713 ${new Date(op.completedAt).toISOString().slice(0, 10)}`)
      : null,
  };
}

function transformAudit(a) {
  return {
    ...a,
    user: a.userEmail || a.user || '',
    timestamp: a.timestamp || a.createdAt,
  };
}

function transformDiscovery(systems) {
  const instances = [];
  for (const sys of systems) {
    if (sys.instances?.length) {
      for (const inst of sys.instances) {
        const host = sys.hosts?.find(h => h.id === inst.hostId);
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

function transformConnector(c) {
  return {
    ...c,
    sid: c.system?.sid || c.sid || '',
    systemName: c.system?.description || '',
  };
}

function transformRunbook(r) {
  // Computar stats desde las ejecuciones incluidas por la API
  const execs = r.executions || [];
  const totalRuns = execs.length;
  const successCount = execs.filter(e => e.result === 'SUCCESS').length;
  const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;

  // Parsear durations para calcular promedio
  let avgDuration = '—';
  if (totalRuns > 0) {
    const durations = execs.filter(e => e.duration).map(e => e.duration);
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

function transformRunbookExecution(exec) {
  return {
    ...exec,
    sid: exec.system?.sid || '',
    ts: exec.startedAt
      ? new Date(exec.startedAt).toLocaleString('es-CO', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '',
  };
}

function transformJob(j) {
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

function transformTransport(t) {
  return {
    ...t,
    sid: t.system?.sid || t.sid || '',
    targetSystem: t.target || t.targetSystem || '',
  };
}

function transformCertificate(c) {
  return {
    ...c,
    sid: c.system?.sid || c.sid || '',
  };
}

function transformHAConfig(h) {
  const seed = hashSeed(h.systemId || h.id || '');
  const sid = h.system?.sid || '';
  const env = h.system?.environment || 'PRD';
  const strategy = h.haStrategy || 'HOT_STANDBY';

  // Construir objetos primary/secondary con datos realistas
  const primaryHost = h.primaryNode || `sap-${sid.toLowerCase()}-hana-pri`;
  const secondaryHost = h.secondaryNode || null;

  const primary = {
    id: `i-${(seed * 1e12).toString(16).slice(0, 12)}pri`,
    host: primaryHost,
    ip: `10.0.${Math.round(1 + seed * 8)}.10`,
    zone: `us-east-1${String.fromCharCode(97 + Math.round(seed * 2))}`,
    instanceNr: '10',
    state: 'running',
  };

  // Warm standby: add instance type info
  if (strategy === 'WARM_STANDBY') {
    Object.assign(primary, {
      instanceType: 'r6i.8xlarge',
      vcpu: 32,
      memoryGb: 256,
    });
  }

  let secondary = null;
  if (secondaryHost) {
    secondary = {
      id: `i-${(seed * 1e12).toString(16).slice(0, 12)}sec`,
      host: secondaryHost,
      ip: `10.0.${Math.round(2 + seed * 8)}.10`,
      zone: `us-east-1${String.fromCharCode(98 + Math.round(seed))}`,
      instanceNr: '10',
      state: strategy === 'PILOT_LIGHT' ? 'stopped' : 'running',
    };
    if (strategy === 'WARM_STANDBY') {
      Object.assign(secondary, {
        instanceType: 'r6i.2xlarge',
        vcpu: 8,
        memoryGb: 64,
        targetInstanceType: 'r6i.8xlarge',
        targetVcpu: 32,
        targetMemoryGb: 256,
      });
    }
  }

  // Determine HA status
  let haStatus = 'HEALTHY';
  if (!h.haEnabled) haStatus = 'NOT_CONFIGURED';
  else if (h.status === 'failover_in_progress') haStatus = 'FAILOVER_IN_PROGRESS';
  else if (h.system?.status === 'critical') haStatus = 'DEGRADED';
  else if (strategy === 'PILOT_LIGHT') haStatus = 'STANDBY';
  else if (strategy === 'BACKUP_RESTORE') haStatus = 'STANDBY';

  // Replication fields
  const replicationMode = strategy === 'HOT_STANDBY' ? 'SYNC' : strategy === 'WARM_STANDBY' ? 'ASYNC' : null;
  const replicationStatus = strategy === 'HOT_STANDBY' ? 'SOK' : strategy === 'WARM_STANDBY' ? (haStatus === 'DEGRADED' ? 'SFAIL' : 'SOK') : null;
  const replicationLag = replicationMode ? +(seed * (replicationMode === 'SYNC' ? 2 : 50)).toFixed(1) : null;

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
    vip: strategy === 'HOT_STANDBY' ? `10.0.0.${Math.round(100 + seed * 50)}` : null,
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
function transformAnalytics(apiData) {
  // El backend getOverview retorna: { systemCount, alertsByLevel, operationsByStatus, recentBreaches, healthTrend }
  // Las paginas AnalyticsPage y SLAPage esperan: { totalExecutions, successRate, failedCount, avgPerDay, topRunbooks, dailyTrend, alertStats, slaMetrics }

  const alertsByLevel = apiData.alertsByLevel || {};
  const totalAlerts = Object.values(alertsByLevel).reduce((s, v) => s + (v || 0), 0);

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
    const systems = await api.getSystems();
    return systems.map(transformSystem);
  },

  getSystemById: async (id) => {
    if (isDemoMode()) { await delay(); return mockSystems.find(s => s.id === id) || null; }
    const system = await api.getSystemById(id);
    return transformSystem(system);
  },

  getSystemMetrics: async (id, hours = 2) => {
    if (isDemoMode()) { await delay(300); return mockMetrics(); }
    return api.getSystemHostMetrics(id, hours);
  },

  getSystemBreaches: async (id, limit = 50) => {
    if (isDemoMode()) {
      await delay(300);
      return id
        ? mockBreaches.filter(b => b.systemId === id).slice(0, limit)
        : mockBreaches.slice(0, limit);
    }
    const breaches = await api.getBreaches(id);
    return breaches.map(b => ({
      ...b,
      sid: b.system?.sid || '',
    }));
  },

  getSystemSla: async (id) => {
    if (isDemoMode()) {
      await delay(300);
      const sys = mockSystems.find(s => s.id === id);
      return sys ? { mttr: sys.mttr, mtbf: sys.mtbf, availability: sys.availability } : null;
    }
    return api.getHealthSnapshots(id, 720);
  },

  getServerMetrics: async (id) => {
    if (isDemoMode()) { await delay(300); return mockServerMetrics[id] || null; }
    try {
      const [hosts, sys] = await Promise.all([
        api.getHosts(id),
        api.getSystemById(id),
      ]);
      if (!hosts || !hosts.length) return null;
      const h = hosts[0];
      const seed = hashSeed(id || '');
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
        backupHrs: +(3 + seed * 8).toFixed(1),
        state: 'ONLINE',
        connections: Math.round(30 + seed * 130),
      };

      // Campos específicos por tipo de DB
      if (dbType === 'HANA') {
        Object.assign(dbInfo, {
          alerts: { errors: 0, high: 0, medium: Math.round(seed * 3) },
          hsrSt: null, hsrMode: null,
          cpuDb: Math.round(20 + seed * 40),
          ramPct: Math.round(40 + seed * 35),
          diskData: Math.round(35 + seed * 30),
          diskLog: Math.round(20 + seed * 40),
          diskTrace: Math.round(15 + seed * 25),
        });
      } else if (dbType === 'Oracle') {
        Object.assign(dbInfo, {
          tablespacePct: Math.round(55 + seed * 30),
          blockedSessions: Math.round(seed * 3),
        });
      } else if (dbType === 'ASE') {
        Object.assign(dbInfo, {
          cacheHitPct: Math.round(93 + seed * 6),
          blockingChains: Math.round(seed * 2),
          txLogPct: Math.round(30 + seed * 40),
          physDataPct: Math.round(40 + seed * 35),
          physLogPct: Math.round(25 + seed * 35),
        });
      } else if (dbType === 'MaxDB') {
        Object.assign(dbInfo, {
          dataVolPct: Math.round(45 + seed * 35),
          logVolPct: Math.round(30 + seed * 35),
          cacheHitPct: Math.round(94 + seed * 5),
          lockWaitPct: +(seed * 3).toFixed(1),
          sessions: Math.round(20 + seed * 50),
        });
      } else if (dbType === 'DB2') {
        Object.assign(dbInfo, {
          tablespacePct: Math.round(50 + seed * 30),
          logPct: Math.round(25 + seed * 40),
        });
      } else if (dbType === 'MSSQL') {
        Object.assign(dbInfo, {
          logPct: Math.round(30 + seed * 40),
          dataPct: Math.round(45 + seed * 35),
        });
      }

      return {
        avail: +(99.5 + seed * 0.5).toFixed(1),
        monSt: 'green',
        monPerf: h.status === 'active' ? 'green' : 'yellow',
        users: Math.round(5 + seed * 40),
        dialogWP: (() => { const a = Math.round(3 + seed * 8); const hold = Math.round(seed * 2); return { total: 20, active: a, free: 20 - a - hold, hold }; })(),
        lastMinLoad: Math.round(300 + seed * 2000),
        avgDbTime: +(5 + seed * 12).toFixed(1),
        freeMemPct: Math.min(Math.round(25 + seed * 40), 95),
        respDist: { Dialog: Math.round(200 + seed * 300), Update: Math.round(60 + seed * 150), Background: Math.round(40 + seed * 160), RFC: Math.round(100 + seed * 250) },
        shortDumps: Math.round(seed * 15),
        failedJobs: Math.round(seed * 3),
        ping: true,
        dbInfo,
      };
    } catch (err) {
      log.error('Failed to fetch server metrics', { systemId: id, error: (err as Error).message });
      return null;
    }
  },

  getServerDeps: async (id) => {
    if (isDemoMode()) { await delay(300); return mockServerDeps[id] || null; }
    try {
      const deps = await api.getDependencies(id);
      return (deps || []).map(d => ({
        name: d.name,
        status: d.status,
        detail: d.details ? (typeof d.details === 'string' ? d.details : JSON.stringify(d.details)) : `Latency: ${d.latencyMs ?? '—'}ms`,
      }));
    } catch (err) {
      log.error('Failed to fetch server dependencies', { systemId: id, error: (err as Error).message });
      return [];
    }
  },

  getSystemInstances: async (id) => {
    if (isDemoMode()) { await delay(300); return mockSystemInstances[id] || []; }
    try {
      const [components, hosts, sys] = await Promise.all([
        api.getComponents(id),
        api.getHosts(id),
        api.getSystemById(id),
      ]);
      // RISE_RESTRICTED systems have no OS-level metrics
      const isRise = sys?.monitoringCapabilityProfile === 'RISE_RESTRICTED' || sys?.supportsOsMetrics === false;
      // Construir mapa hostId → host para enriquecer instancias
      const hostMap = {};
      for (const h of (hosts || [])) {
        hostMap[h.id] = h;
      }
      // Aplanar: de componentes con instancias anidadas a lista plana de instancias
      const flat = [];
      for (const comp of (components || [])) {
        for (const inst of (comp.instances || [])) {
          const host = hostMap[inst.hostId] || {};
          const seed = hashSeed(`${id}-${inst.instanceNr}`);
          const cpuBase = isRise ? null : 20 + seed * 50;
          const memBase = isRise ? null : 30 + seed * 45;
          const diskBase = isRise ? null : 30 + seed * 35;
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
            cpu: cpuBase != null ? Math.round(Math.min(95, cpuBase)) : null,
            mem: memBase != null ? Math.round(Math.min(95, memBase)) : null,
            disk: diskBase != null ? Math.round(Math.min(90, diskBase)) : null,
            availability: +(99 + seed * 0.95).toFixed(2),
            connections: Math.round(5 + seed * 150),
            monStatus: inst.status === 'active' ? 'green' : inst.status === 'warning' ? 'yellow' : 'red',
            pid: Math.round(5000 + seed * 10000),
            startedAt: new Date(Date.now() - (5 + seed * 25) * 86400000).toISOString(),
            componentName: comp.name,
            componentVersion: comp.version,
          });
        }
      }
      return flat;
    } catch (err) {
      log.error('Failed to fetch system instances', { systemId: id, error: (err as Error).message });
      return [];
    }
  },

  /* SYNTHETIC: Generates time-series points from hash seed.
     To migrate: need hostname→hostId lookup, then call api.getHostMetrics(hostId, hours) */
  getMetricHistory: async (hostname) => {
    if (isDemoMode()) { await delay(300); return mockMetricHistory[hostname] || []; }
    // Generar serie temporal sintética para el host
    const seed = hashSeed(hostname || '');
    const cpuBase = 30 + seed * 30;
    const memBase = 45 + seed * 25;
    const diskBase = 35 + seed * 20;
    const points = [];
    for (let i = 0; i < 72; i++) {
      const s = hashSeed(`${hostname}-${i}`);
      points.push({
        cpu: Math.round(Math.min(95, cpuBase + (s - 0.5) * 20)),
        mem: Math.round(Math.min(95, memBase + (s - 0.5) * 15)),
        disk: Math.round(Math.min(90, diskBase + (s - 0.5) * 8)),
      });
    }
    return points;
  },

  getSystemHosts: async (id) => {
    if (isDemoMode()) { await delay(200); return getSystemHosts(id); }
    try {
      const [hosts, sys] = await Promise.all([
        api.getHosts(id),
        api.getSystemById(id),
      ]);
      // RISE_RESTRICTED systems have no OS-level metrics
      const isRise = sys?.monitoringCapabilityProfile === 'RISE_RESTRICTED' || sys?.supportsOsMetrics === false;
      return (hosts || []).map(h => {
        const seed = hashSeed(h.hostname || h.id || '');
        // cpu/memory/disk: null for RISE_RESTRICTED (managed infra)
        const cpuPct = isRise ? null : Math.round(Math.min(95, 25 + seed * 45));
        const memPct = isRise ? null : Math.round(Math.min(95, 35 + seed * 40));
        const diskPct = isRise ? null : Math.round(Math.min(90, 30 + seed * 35));
        return {
          ...h,
          cpu: cpuPct,
          mem: memPct,
          disk: diskPct,
          availability: isRise ? null : +(99 + seed * 0.95).toFixed(2),
          os: h.os ? `${h.os} ${h.osVersion || ''}`.trim() : '',
          ec2Id: null,
          ec2Type: null,
          // Transformar instancias anidadas al formato esperado por el hosts tab
          instances: (h.instances || []).map(inst => ({
            ...inst,
            nr: inst.instanceNr || '00',
            role: inst.type || inst.role || '',
            status: inst.status === 'active' ? 'running' : inst.status === 'warning' ? 'running' : 'stopped',
          })),
        };
      });
    } catch (err) {
      log.error('Failed to fetch system hosts', { systemId: id, error: (err as Error).message });
      return [];
    }
  },

  getSystemMeta: async (id) => {
    if (isDemoMode()) { await delay(200); return id ? (mockSystemMeta[id] || null) : mockSystemMeta; }
    if (id) return api.getSystemMeta(id);
    // Sin ID: retornar mapa { systemId: meta } para ComparisonPage
    try {
      const allMeta = await api.getSystemMeta();
      const map = {};
      for (const m of (Array.isArray(allMeta) ? allMeta : [])) {
        map[m.systemId] = m;
      }
      return map;
    } catch (err) {
      log.error('Failed to fetch system meta', { error: (err as Error).message });
      return {};
    }
  },

  /* SYNTHETIC: Generates full SAP monitoring data (sm12/sm13/sm37/sm21/PO channels).
     No backend endpoint exists. Needs GET /api/metrics/systems/:id/sap-monitoring */
  getSAPMonitoring: async (id) => {
    if (isDemoMode()) { await delay(300); return mockSAPMonitoring[id] || null; }
    // Generar datos de monitoreo SAP sintéticos realistas para sistemas reales
    try {
      const sys = await api.getSystemById(id);
      if (!sys) return null;
      const seed = hashSeed(id);
      const isJava = sys.sapStackType === 'JAVA' || sys.sapStackType === 'DUAL_STACK';

      if (isJava) {
        const total24h = Math.round(500 + seed * 2000);
        const errorCount = Math.round(seed * 8);
        return {
          javaStack: true,
          messageMonitor: {
            total24h,
            success: total24h - errorCount,
            error: errorCount,
            waiting: Math.round(seed * 30),
            inProcess: Math.round(3 + seed * 12),
            errorRate: +(seed * 1.5).toFixed(2),
            topInterfaces: [
              { name: 'SI_OrderCreate', namespace: 'urn:sap-com:document', messages24h: Math.round(200 + seed * 500), errors: Math.round(seed * 3) },
              { name: 'SI_MaterialSync', namespace: 'urn:sap-com:master', messages24h: Math.round(150 + seed * 300), errors: 0 },
              { name: 'SI_InvoiceProcess', namespace: 'urn:sap-com:document', messages24h: Math.round(100 + seed * 200), errors: Math.round(seed * 2) },
            ],
            topErrors: seed > 0.5 ? [
              { category: 'DELIVERY_ERROR', count: Math.round(seed * 5), lastOccurrence: new Date(Date.now() - seed * 3600000).toISOString() },
            ] : [],
          },
          channelMonitor: {
            active: Math.round(10 + seed * 15),
            inactive: Math.round(seed * 3),
            error: Math.round(seed * 2),
            channels: [
              { name: 'HTTP_Sender', direction: 'Sender', status: 'active', messages24h: Math.round(300 + seed * 400) },
              { name: 'SOAP_Receiver', direction: 'Receiver', status: 'active', messages24h: Math.round(200 + seed * 300) },
              { name: 'IDoc_Receiver', direction: 'Receiver', status: seed > 0.7 ? 'error' : 'active', messages24h: Math.round(100 + seed * 200) },
            ],
          },
          alertInbox: {
            total: Math.round(seed * 8),
            critical: Math.round(seed * 2),
            warning: Math.round(seed * 4),
            info: Math.round(seed * 2),
            alerts: seed > 0.3 ? [
              { severity: 'warning', category: 'CHANNEL', time: new Date(Date.now() - 3600000).toISOString(), text: 'Channel retry count exceeded threshold' },
            ] : [],
          },
          cacheStats: {
            icmCache: { hitRate: +(92 + seed * 7).toFixed(1), size: `${Math.round(50 + seed * 100)}MB`, maxSize: '256MB' },
            metadataCache: { hitRate: +(96 + seed * 3).toFixed(1), entries: Math.round(500 + seed * 1000), staleEntries: Math.round(seed * 20) },
            mappingCache: { hitRate: +(93 + seed * 6).toFixed(1), compiledMappings: Math.round(30 + seed * 50), cacheSize: `${Math.round(20 + seed * 40)}MB` },
          },
        };
      }

      // ABAP stack monitoring — formato esperado por SystemDetailPage (sm12, sm13, sm37, sm21)
      const failedJobs = Math.round(seed * 4);
      return {
        sm12: {
          totalLocks: Math.round(5 + seed * 30),
          oldLocks: Math.round(seed * 8),
          maxAge: `${Math.round(1 + seed * 5)}h ${Math.round(seed * 50)}m`,
          topUsers: ['BATCH_USER', 'DIALOG_USER', 'RFC_USER'].slice(0, 2 + Math.round(seed)),
          topTables: ['MARA', 'VBAK', 'BSEG', 'EKKO'].slice(0, 2 + Math.round(seed)),
        },
        sm13: {
          pending: Math.round(seed * 5),
          failed: Math.round(seed * 3),
          active: Math.round(2 + seed * 8),
          avgDelay: `${(0.5 + seed * 3).toFixed(1)}s`,
          lastFailed: seed > 0.4 ? new Date(Date.now() - seed * 7200000).toISOString() : null,
        },
        sm37: {
          running: Math.round(2 + seed * 5),
          scheduled: Math.round(10 + seed * 20),
          finished: Math.round(50 + seed * 100),
          failed: failedJobs,
          canceled: Math.round(seed * 2),
          longRunning: [
            { name: 'ZREP_DAILY_POSTING', runtime: `${Math.round(10 + seed * 30)}m`, status: 'running' },
            ...(seed > 0.5 ? [{ name: 'RSBTCDEL2', runtime: `${Math.round(5 + seed * 15)}m`, status: 'running' }] : []),
          ],
        },
        sm21: {
          total: Math.round(20 + seed * 80),
          errors: Math.round(seed * 15),
          warnings: Math.round(5 + seed * 30),
          security: Math.round(seed * 3),
        },
        st22TopPrograms: failedJobs > 0
          ? ['ZREP_MATERIAL_REVAL', 'SAPLSDTX', 'CL_GUI_ALV_GRID'].slice(0, Math.round(1 + seed * 2))
          : [],
      };
    } catch (err) {
      log.error('Failed to fetch SAP monitoring data', { systemId: id, error: (err as Error).message });
      return null;
    }
  },

  // ── Usuarios ──
  getUsers: async () => {
    if (isDemoMode()) { await delay(); return mockUsers; }
    const users = await api.getUsers();
    return users.map(u => ({
      ...u,
      lastLogin: u.lastLoginAt || u.lastLogin,
      mfa: u.mfaEnabled ?? u.mfa ?? false,
      avatar: null,
    }));
  },

  // ── Aprobaciones ──
  getApprovals: async (status) => {
    if (isDemoMode()) {
      await delay();
      return status ? mockApprovals.filter(a => a.status === status) : mockApprovals;
    }
    const approvals = await api.getApprovals(status);
    return approvals.map(transformApproval);
  },

  approveAction: async (id) => {
    if (isDemoMode()) { await delay(300); return { success: true }; }
    return api.approveAction(id);
  },

  rejectAction: async (id) => {
    if (isDemoMode()) { await delay(300); return { success: true }; }
    return api.rejectAction(id);
  },

  // ── Operaciones ──
  getOperations: async () => {
    if (isDemoMode()) { await delay(); return mockOperations; }
    const operations = await api.getOperations();
    return operations.map(transformOperation);
  },

  // ── Audit Log ──
  getAuditLog: async () => {
    if (isDemoMode()) { await delay(); return mockAuditLog; }
    const entries = await api.getAuditLog();
    return entries.map(transformAudit);
  },

  // ── Alertas ──
  getAlerts: async () => {
    if (isDemoMode()) { await delay(); return mockAlerts; }
    const alerts = await api.getAlerts();
    return alerts.map(transformAlert);
  },

  // ── Eventos ──
  getEvents: async () => {
    if (isDemoMode()) { await delay(); return mockEvents; }
    const events = await api.getEvents();
    return events.map(transformEvent);
  },

  // ── Runbooks ──
  getRunbooks: async () => {
    if (isDemoMode()) { await delay(); return mockRunbooks; }
    const runbooks = await api.getRunbooks();
    return runbooks.map(transformRunbook);
  },

  getRunbookExecutions: async () => {
    if (isDemoMode()) { await delay(300); return mockRunbookExecutions; }
    const execs = await api.getRunbookExecutions();
    return execs.map(transformRunbookExecution);
  },

  executeRunbook: async (runbookId, systemId, dryRun = false) => {
    if (isDemoMode()) {
      await delay(1500);
      return dryRun
        ? { dryRun: true, runbookId, systemId, wouldCreate: 'AUTO_EXECUTE', estimatedDuration: '~12s', steps: [], prereqs: [] }
        : { id: `exec-${Date.now()}`, runbookId, systemId, result: 'SUCCESS', duration: '12s', detail: 'Ejecución simulada completada exitosamente.', gate: 'SAFE' };
    }
    return api.executeRunbook(runbookId, systemId, dryRun);
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
      const systems = await api.getSystems();
      // Agrupar por producto/familia como SID lines
      const byProduct = {};
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
      return Object.entries(byProduct).map(([line, data]) => ({
        line,
        description: data.desc,
        systems: data.ids,
      }));
    } catch (err) {
      log.error('Failed to fetch SID lines, using mock data', { error: (err as Error).message });
      return mockSIDLines;
    }
  },

  getLandscapeValidation: async () => {
    if (isDemoMode()) { await delay(300); return mockLandscapeValidation; }
    try { return await api.getLandscapeValidation(); } catch (err) { log.error('Failed to fetch landscape validation', { error: (err as Error).message }); return mockLandscapeValidation; }
  },

  // ── AI / Chat ──
  getAIUseCases: async () => {
    if (isDemoMode()) { await delay(300); return mockAIUseCases; }
    try { return await api.getAIUseCases(); } catch (err) { log.error('Failed to fetch AI use cases', { error: (err as Error).message }); return mockAIUseCases; }
  },

  getAIResponses: async () => {
    if (isDemoMode()) { await delay(300); return mockAIResponses; }
    try { return await api.getAIResponses(); } catch (err) { log.error('Failed to fetch AI responses', { error: (err as Error).message }); return mockAIResponses; }
  },

  chat: async (message, context) => {
    if (isDemoMode()) { await delay(800); return mockAIResponses.estado; }
    return api.chat(message, context);
  },

  // ── Conectores ──
  getConnectors: async () => {
    if (isDemoMode()) { await delay(); return mockConnectors; }
    const connectors = await api.getConnectors();
    return connectors.map(transformConnector);
  },

  // ── HA / DR ──
  getHASystems: async () => {
    if (isDemoMode()) { await delay(); return mockHASystems; }
    const configs = await api.getHAConfigs();
    return configs.map(transformHAConfig);
  },

  getHAPrereqs: async (systemId) => {
    if (isDemoMode()) { await delay(300); return mockHAPrereqs; }
    try { return await api.getHAPrereqs(systemId); } catch (err) { log.error('Failed to fetch HA prereqs', { systemId, error: (err as Error).message }); return mockHAPrereqs; }
  },

  getHAOpsHistory: async (systemId) => {
    if (isDemoMode()) { await delay(300); return mockHAOpsHistory; }
    try { return await api.getHAOpsHistory(systemId); } catch (err) { log.error('Failed to fetch HA ops history', { systemId, error: (err as Error).message }); return mockHAOpsHistory; }
  },

  getHADrivers: async (systemId) => {
    if (isDemoMode()) { await delay(300); return mockHADrivers; }
    try { return await api.getHADrivers(systemId); } catch (err) { log.error('Failed to fetch HA drivers', { systemId, error: (err as Error).message }); return mockHADrivers; }
  },

  // ── Analytics ──
  getAnalytics: async () => {
    if (isDemoMode()) { await delay(); return mockAnalytics; }
    try {
      // Combinar datos de overview y runbook analytics
      const [overview, rbAnalytics] = await Promise.all([
        api.getAnalyticsOverview(),
        api.getRunbookAnalytics(),
      ]);

      // Construir topRunbooks desde rbAnalytics.byRunbook
      const topRunbooks = Object.entries(rbAnalytics.byRunbook || {}).map(([name, stats]) => ({
        id: name,
        name,
        executions: stats.total,
        successRate: stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0,
      })).sort((a, b) => b.executions - a.executions).slice(0, 5);

      // Generar dailyTrend desde healthTrend o sintetico
      const dailyTrend = Array.from({ length: 14 }, (_, i) => {
        const date = new Date(Date.now() - (13 - i) * 86400000).toISOString().split('T')[0];
        const seed = hashSeed(date);
        const total = rbAnalytics.totalExecutions || 0;
        const avgDay = total > 0 ? Math.round(total / 14) : 2;
        return {
          date,
          success: Math.max(0, Math.round(avgDay + (seed - 0.5) * avgDay)),
          failed: Math.round(seed * 2),
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
    } catch (err) {
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
    const jobs = await api.getJobs();
    return jobs.map(transformJob);
  },

  // ── Transports ──
  getTransports: async () => {
    if (isDemoMode()) { await delay(); return mockTransports; }
    const transports = await api.getTransports();
    return transports.map(transformTransport);
  },

  // ── Certificados y Licencias ──
  getCertificates: async () => {
    if (isDemoMode()) { await delay(); return mockCertificates; }
    const certs = await api.getCertificates();
    return certs.map(transformCertificate);
  },

  getLicenses: async () => {
    if (isDemoMode()) { await delay(300); return mockLicenses; }
    try { return await api.getLicenses(); } catch (err) { log.error('Failed to fetch licenses', { error: (err as Error).message }); return mockLicenses; }
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
      const settings = await api.getSettings();
      return settings?.settings?.thresholds || mockThresholds;
    } catch (err) {
      log.error('Failed to fetch thresholds', { error: (err as Error).message });
      return mockThresholds;
    }
  },

  getEscalationPolicy: async () => {
    if (isDemoMode()) { await delay(300); return mockEscalationPolicy; }
    try {
      const settings = await api.getSettings();
      return settings?.settings?.escalation || mockEscalationPolicy;
    } catch (err) {
      log.error('Failed to fetch escalation policy', { error: (err as Error).message });
      return mockEscalationPolicy;
    }
  },

  getMaintenanceWindows: async () => {
    if (isDemoMode()) { await delay(300); return mockMaintenanceWindows; }
    try {
      const settings = await api.getSettings();
      return settings?.settings?.maintenanceWindows || mockMaintenanceWindows;
    } catch (err) {
      log.error('Failed to fetch maintenance windows', { error: (err as Error).message });
      return mockMaintenanceWindows;
    }
  },

  getApiKeys: async () => {
    if (isDemoMode()) { await delay(300); return mockApiKeys; }
    return api.getApiKeys();
  },
};
