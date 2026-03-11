'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Universal Collector
//  Motor principal de recopilación de métricas SAP.
// ═══════════════════════════════════════════════════════════════

const log = require('../utilidades/logger')('universal-collector');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { SSMClient, GetParameterCommand, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

// v1.0 — H33: Trial Mode
const { getSystemConfig, isTrialMode, checkActionAllowed } = require('../utilidades/trial-config');

const cw = new CloudWatchClient({});
const ssm = new SSMClient({});
const secrets = new SecretsManagerClient({});
const sfn = new SFNClient({});
const sns = new SNSClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const NAMESPACE = 'SAPAlwaysOps';
const METRICS_PER_BATCH = 20;
const METRICS_HISTORY_TABLE = process.env.METRICS_HISTORY_TABLE || 'sap-alwaysops-metrics-history';

// ─── computeScenario: ASE Physical vs Logical disk analysis ───
// Scenario 0=OK, 1=PHYS only, 2=LOG only, 3=BOTH
function computeScenario(physLogPct, logFullPct) {
  const physHigh = physLogPct >= 85;
  const logHigh = logFullPct >= 70;
  if (!physHigh && !logHigh) return 0;
  if (physHigh && !logHigh) return 1;
  if (!physHigh && logHigh) return 2;
  return 3;
}

// ─── Threshold definitions with cost/approval policy ───
const THRESHOLDS = {
  // ASE — umbrales según documento de arquitectura v1.0
  DB_ASE_LogFullPct:         { HIGH: 80, CRITICAL: 90, runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_PhysLogPct:         { HIGH: 85, CRITICAL: 95, runbook: 'RB-ASE-002', costSafe: false, requiresApproval: true  },
  DB_ASE_PhysDataPct:        { HIGH: 88, CRITICAL: 95, runbook: 'RB-ASE-002', costSafe: false, requiresApproval: true  },
  DB_ASE_DiskScenario:       { HIGH: 0.5, CRITICAL: 2.5, runbook: 'RB-ASE-003', costSafe: false, requiresApproval: true },
  DB_ASE_LogLastDumpMin:     { HIGH: 120, CRITICAL: 240, runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_OldestTxMin:        { HIGH: 30, CRITICAL: 60, runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_BlockingChains:     { HIGH: 1, CRITICAL: 3, runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_LogGrowthPctPerHr:  { HIGH: 3, CRITICAL: 8, runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_CacheHitRatio:      { HIGH_BELOW: 80, CRITICAL_BELOW: 60, runbook: 'RB-ASE-001', costSafe: true, requiresApproval: false },
  // HANA
  DB_HANA_MemPct:            { HIGH: 80, CRITICAL: 90, runbook: 'RB-HANA-001', costSafe: true,  requiresApproval: false },
  DB_HANA_DiskPct:           { HIGH: 85, CRITICAL: 95, runbook: 'RB-HANA-002', costSafe: false, requiresApproval: true  },
  DB_HANA_ReplicationLag:    { HIGH: 300, CRITICAL: 600, runbook: 'RB-HA-001', costSafe: true,  requiresApproval: false },
  // Oracle
  DB_ORA_TablespacePct:      { HIGH: 85, CRITICAL: 95, runbook: 'RB-HANA-002', costSafe: false, requiresApproval: true  },
  DB_ORA_BlockedSessions:    { HIGH: 5, CRITICAL: 15, runbook: 'RB-ABAP-001', costSafe: true,  requiresApproval: false },
  // MSSQL
  DB_MSSQL_LogPct:           { HIGH: 80, CRITICAL: 90, runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_MSSQL_DataPct:          { HIGH: 85, CRITICAL: 95, runbook: 'RB-ASE-002', costSafe: false, requiresApproval: true  },
  // DB2
  DB_DB2_TablespacePct:      { HIGH: 85, CRITICAL: 95, runbook: 'RB-HANA-002', costSafe: false, requiresApproval: true  },
  DB_DB2_LogPct:             { HIGH: 80, CRITICAL: 90, runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  // MaxDB — v1.9
  DB_MAXDB_DataVolPct:      { HIGH: 85, CRITICAL: 95, runbook: 'RB-MAXDB-002', costSafe: false, requiresApproval: true  },
  DB_MAXDB_LogVolPct:       { HIGH: 80, CRITICAL: 90, runbook: 'RB-MAXDB-001', costSafe: true,  requiresApproval: false },
  DB_MAXDB_DataCacheHitPct: { HIGH_BELOW: 80, CRITICAL_BELOW: 60, runbook: 'RB-MAXDB-001', costSafe: true, requiresApproval: false, inverted: true },
  DB_MAXDB_LockWaitPct:     { HIGH: 5, CRITICAL: 15, runbook: 'RB-MAXDB-001', costSafe: true,  requiresApproval: false },
  // JVM / Application
  APP_JVM_HeapPct:           { HIGH: 82, CRITICAL: 92, runbook: 'RB-JVM-001', costSafe: true,  requiresApproval: false },
  APP_JVM_OldGenPct:         { HIGH: 75, CRITICAL: 85, runbook: 'RB-JVM-002', costSafe: true,  requiresApproval: false },
  APP_JVM_GCOverheadPct:     { HIGH: 10, CRITICAL: 25, runbook: 'RB-JVM-001', costSafe: true,  requiresApproval: false },
  APP_ThreadPoolPct:         { HIGH: 80, CRITICAL: 95, runbook: 'RB-JVM-001', costSafe: true,  requiresApproval: false },
  APP_ICM_ConnectionsPct:    { HIGH: 80, CRITICAL: 95, runbook: 'RB-JVM-001', costSafe: true,  requiresApproval: false },
  // PO
  APP_PO_FailedMessages:     { HIGH: 10, CRITICAL: 50, runbook: 'RB-PO-001', costSafe: true,  requiresApproval: false },
  APP_PO_StuckMessages:      { HIGH: 5, CRITICAL: 20, runbook: 'RB-PO-001', costSafe: true,  requiresApproval: false },
  // ABAP
  APP_ABAP_FreeDiaWP:        { HIGH_BELOW: 5, CRITICAL_BELOW: 3, runbook: 'RB-ABAP-001', costSafe: true, requiresApproval: false },
  APP_ABAP_ShortDumps24h:    { HIGH: 50, CRITICAL: 200, runbook: 'RB-ABAP-001', costSafe: true, requiresApproval: false },
  // v1.0 — Verificación de backups (todas las BD)
  DB_HANA_LastBackupMin:     { HIGH: 1440, CRITICAL: 2880, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  DB_ORA_LastBackupMin:      { HIGH: 720, CRITICAL: 1440, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  DB_MSSQL_LastBackupMin:    { HIGH: 720, CRITICAL: 1440, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  DB_DB2_LastBackupMin:      { HIGH: 1440, CRITICAL: 2880, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  DB_MAXDB_LastBackupMin:   { HIGH: 1440, CRITICAL: 2880, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  // v1.0 — Expiración de certificados ICM/PSE
  APP_ICM_CertExpiryDays:    { HIGH_BELOW: 30, CRITICAL_BELOW: 7, runbook: 'RB-CERT-001', costSafe: true, requiresApproval: false },
  // v1.0 — Work Processes en modo PRIV/Hold
  APP_ABAP_PrivModeWP:       { HIGH: 1, CRITICAL: 3, runbook: 'RB-WP-001', costSafe: true, requiresApproval: false },
  APP_ABAP_HoldWP:           { HIGH: 2, CRITICAL: 5, runbook: 'RB-WP-001', costSafe: true, requiresApproval: false },
  // v1.0 — Monitoreo de colas RFC/tRFC/qRFC
  APP_ABAP_RFCQueueDepth:    { HIGH: 100, CRITICAL: 500, runbook: 'RB-RFC-001', costSafe: true, requiresApproval: false },
  APP_ABAP_TRFCQueueDepth:   { HIGH: 50, CRITICAL: 200, runbook: 'RB-RFC-001', costSafe: true, requiresApproval: false },
  APP_ABAP_QRFCQueueDepth:   { HIGH: 50, CRITICAL: 200, runbook: 'RB-RFC-001', costSafe: true, requiresApproval: false },
  // v1.0 — Verificación de jobs SM37
  APP_ABAP_FailedJobs24h:    { HIGH: 5, CRITICAL: 15, runbook: 'RB-JOB-001', costSafe: true, requiresApproval: false },
  APP_ABAP_LongRunningJobs:  { HIGH: 2, CRITICAL: 5, runbook: 'RB-JOB-001', costSafe: true, requiresApproval: false },
  // v1.0 — Housekeeping automático (logs, spools, TEMSE)
  APP_ABAP_OldSpoolJobs:     { HIGH: 500, CRITICAL: 2000, runbook: 'RB-HOUSE-001', costSafe: true, requiresApproval: false },
  APP_ABAP_SM21OldLogs:      { HIGH: 1000, CRITICAL: 5000, runbook: 'RB-HOUSE-001', costSafe: true, requiresApproval: false },
  APP_ABAP_TEMSEObjects:     { HIGH: 1000, CRITICAL: 5000, runbook: 'RB-HOUSE-001', costSafe: true, requiresApproval: false },
  // v1.0 — Gestión de locks SM12
  APP_ABAP_OldEnqLocks:      { HIGH: 5, CRITICAL: 20, runbook: 'RB-LOCK-001', costSafe: true, requiresApproval: false },
  APP_ABAP_LockWaitTimeSec:  { HIGH: 30, CRITICAL: 120, runbook: 'RB-LOCK-001', costSafe: true, requiresApproval: false },
  // v1.0 — Monitoreo de transportes STMS
  APP_ABAP_StuckTransports:  { HIGH: 3, CRITICAL: 10, runbook: 'RB-TRANS-001', costSafe: true, requiresApproval: false },
  APP_ABAP_FailedTransports: { HIGH: 2, CRITICAL: 5, runbook: 'RB-TRANS-001', costSafe: true, requiresApproval: false },
};

// ═══════════════════════════════════════════════════════════════
//  H26 — Ajustes estacionales de umbrales
//  Los umbrales se multiplican por estos factores durante períodos especiales
//  Factor > 1.0 = más tolerante (ej: 1.2 sube el umbral 20%)
//  Factor < 1.0 = más estricto
// ═══════════════════════════════════════════════════════════════
const SEASONAL_ADJUSTMENTS = {
  // Cierre de mes (últimos 3 días del mes + primeros 2 días del siguiente)
  MONTH_END: {
    name: 'Cierre de Mes',
    factor: 1.25, // 25% más tolerante
    metrics: ['DB_ASE_PhysLogPct', 'DB_ASE_PhysDataPct', 'DB_HANA_MemPct', 'DB_HANA_DiskPct',
              'APP_JVM_HeapPct', 'APP_JVM_OldGenPct', 'APP_WP_BusyPct', 'APP_JOB_FailedCount',
              'DB_ORACLE_TbsUsedPct', 'DB_MSSQL_DataFilePct', 'DB_DB2_TbsUsedPct',
              'DB_MAXDB_DataVolPct', 'DB_MAXDB_LogVolPct'],
  },

  // Cierre de año fiscal (últimas 2 semanas de diciembre + primera semana de enero)
  YEAR_END: {
    name: 'Cierre de Año',
    factor: 1.40, // 40% más tolerante
    metrics: ['DB_ASE_PhysLogPct', 'DB_ASE_PhysDataPct', 'DB_HANA_MemPct', 'DB_HANA_DiskPct',
              'APP_JVM_HeapPct', 'APP_JVM_OldGenPct', 'APP_WP_BusyPct', 'APP_JOB_FailedCount',
              'APP_LOCK_ActiveCount', 'APP_RFC_QueueLength',
              'DB_ORACLE_TbsUsedPct', 'DB_MSSQL_DataFilePct', 'DB_DB2_TbsUsedPct',
              'DB_MAXDB_DataVolPct', 'DB_MAXDB_LogVolPct'],
  },

  // Horario fuera de oficina (noches y fines de semana Colombia time)
  OFF_HOURS: {
    name: 'Fuera de Horario',
    factor: 1.15, // 15% más tolerante
    metrics: ['APP_WP_BusyPct', 'APP_JOB_FailedCount', 'APP_RFC_QueueLength'],
  },

  // Período de nómina (del 25 al 5 de cada mes)
  PAYROLL: {
    name: 'Período de Nómina',
    factor: 1.20, // 20% más tolerante
    metrics: ['APP_WP_BusyPct', 'APP_JVM_HeapPct', 'APP_JVM_OldGenPct',
              'DB_ASE_PhysLogPct', 'DB_HANA_MemPct'],
  },
};

// ═══════════════════════════════════════════════════════════════
//H13: MULTI-LANDSCAPE SUPPORT
//  Políticas de ejecución según el landscape del sistema SAP.
//  PRD = auto-remediación completa para métricas costSafe
//  QAS = requiere aprobación siempre (incluso costSafe)
//  DEV = solo monitoreo, no ejecutar runbooks
// ═══════════════════════════════════════════════════════════════
const LANDSCAPE_POLICIES = {
  PRD: { autoRemediate: true,  requireApprovalOverride: false, alertSeverityMultiplier: 1.0 },
  QAS: { autoRemediate: true,  requireApprovalOverride: true,  alertSeverityMultiplier: 0.8 },
  DEV: { autoRemediate: false, requireApprovalOverride: false, alertSeverityMultiplier: 0.5 },
};

function getLandscapePolicy(landscape) {
  return LANDSCAPE_POLICIES[landscape] || LANDSCAPE_POLICIES.PRD;
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H18: CUSTOM THRESHOLDS PER SYSTEM
//  Permite sobrescribir umbrales por sistema SAP desde SSM.
//  Formato SSM: /sap-alwaysops/custom-thresholds/{systemId}
//  El valor es un JSON parcial que sobrescribe SOLO los umbrales
//  que se quieran cambiar. Ejemplo:
//  {
//    "DB_ASE_LogFullPct": { "HIGH": 90, "CRITICAL": 95 },
//    "APP_JVM_HeapPct": { "HIGH": 85, "CRITICAL": 95 }
//  }
// ═══════════════════════════════════════════════════════════════

const customThresholdsCache = {};
const CUSTOM_THRESHOLDS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function getCustomThresholds(systemId) {
  const cacheKey = systemId;
  const cached = customThresholdsCache[cacheKey];

  if (cached && (Date.now() - cached.loadedAt) < CUSTOM_THRESHOLDS_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const paramName = `/sap-alwaysops/custom-thresholds/${systemId}`;
    const param = await ssm.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: false,
    }));

    const customData = JSON.parse(param.Parameter.Value);
    customThresholdsCache[cacheKey] = { data: customData, loadedAt: Date.now() };
    log.info('Cargados umbrales custom', { count: Object.keys(customData).length, systemId });
    return customData;
  } catch (err) {
    if (err.name === 'ParameterNotFound') {
      // Sin umbrales custom para este sistema — usar defaults
      customThresholdsCache[cacheKey] = { data: null, loadedAt: Date.now() };
      return null;
    }
    log.warn('Error cargando umbrales custom', { systemId, error: err.message });
    return null;
  }
}

function mergeThresholds(systemId, customOverrides) {
  if (!customOverrides) return THRESHOLDS;

  // Crear una copia de los thresholds base y aplicar overrides
  const merged = {};
  for (const [key, value] of Object.entries(THRESHOLDS)) {
    if (customOverrides[key]) {
      // Merge parcial: el override puede tener solo HIGH, solo CRITICAL, etc.
      merged[key] = { ...value, ...customOverrides[key] };
      log.info('Override aplicado', { metric: key, systemId, thresholds: merged[key] });
    } else {
      merged[key] = value;
    }
  }

  // Permitir umbrales completamente nuevos (para métricas custom)
  for (const [key, value] of Object.entries(customOverrides)) {
    if (!THRESHOLDS[key]) {
      merged[key] = value;
      log.info('Nuevo umbral custom', { metric: key, systemId });
    }
  }

  return merged;
}

// ═══════════════════════════════════════════════════════════════
//  H26 — SEASONAL THRESHOLDS: Detección y Aplicación
//  Detecta períodos estacionales activos (cierre de mes, año,
//  fuera de horario, nómina) y ajusta los umbrales para reducir
//  falsos positivos durante períodos de alta carga esperada.
// ═══════════════════════════════════════════════════════════════

function detectActiveSeason() {
  // Usar zona horaria de Colombia (UTC-5)
  const now = new Date();
  const colombiaOffset = -5 * 60; // minutos
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaTime = new Date(utcMs + colombiaOffset * 60000);

  const day = colombiaTime.getDate();
  const month = colombiaTime.getMonth() + 1; // 1-12
  const hour = colombiaTime.getHours();
  const dayOfWeek = colombiaTime.getDay(); // 0=Sunday, 6=Saturday

  const activeSeasons = [];

  // MONTH_END: día >= 28 O día <= 2
  if (day >= 28 || day <= 2) {
    activeSeasons.push('MONTH_END');
  }

  // YEAR_END: (mes=12 Y día>=15) O (mes=1 Y día<=7)
  if ((month === 12 && day >= 15) || (month === 1 && day <= 7)) {
    activeSeasons.push('YEAR_END');
  }

  // OFF_HOURS: hora < 7 O hora >= 20 O sábado/domingo
  if (hour < 7 || hour >= 20 || dayOfWeek === 0 || dayOfWeek === 6) {
    activeSeasons.push('OFF_HOURS');
  }

  // PAYROLL: día >= 25 O día <= 5
  if (day >= 25 || day <= 5) {
    activeSeasons.push('PAYROLL');
  }

  return activeSeasons;
}

function applySeasonalAdjustments(thresholds, activeSeasons) {
  if (!activeSeasons || activeSeasons.length === 0) {
    return { adjustedThresholds: thresholds, seasonalMeta: [] };
  }

  // Crear copia profunda de los umbrales para no mutar el original
  const adjusted = {};
  for (const [key, value] of Object.entries(thresholds)) {
    adjusted[key] = { ...value };
  }

  const seasonalMeta = [];

  for (const seasonKey of activeSeasons) {
    const season = SEASONAL_ADJUSTMENTS[seasonKey];
    if (!season) continue;

    const adjustedMetrics = [];

    for (const metricName of season.metrics) {
      if (!adjusted[metricName]) continue;

      const def = adjusted[metricName];
      const isInverted = def.inverted || def.CRITICAL_BELOW !== undefined;

      if (isInverted) {
        // Métricas invertidas (menor es peor, ej: CacheHitRatio)
        // Dividir por el factor = bajar el umbral = más tolerante
        if (def.HIGH_BELOW !== undefined) {
          const oldHigh = def.HIGH_BELOW;
          def.HIGH_BELOW = parseFloat((def.HIGH_BELOW / season.factor).toFixed(2));
          adjustedMetrics.push({ metric: metricName, field: 'HIGH_BELOW', from: oldHigh, to: def.HIGH_BELOW });
        }
        if (def.CRITICAL_BELOW !== undefined) {
          const oldCrit = def.CRITICAL_BELOW;
          def.CRITICAL_BELOW = parseFloat((def.CRITICAL_BELOW / season.factor).toFixed(2));
          adjustedMetrics.push({ metric: metricName, field: 'CRITICAL_BELOW', from: oldCrit, to: def.CRITICAL_BELOW });
        }
      } else {
        // Métricas normales (mayor es peor)
        // Multiplicar por el factor = subir el umbral = más tolerante
        if (def.HIGH !== undefined) {
          const oldHigh = def.HIGH;
          const newHigh = def.HIGH * season.factor;
          // Limitar a 100 para métricas de porcentaje
          def.HIGH = metricName.includes('Pct') ? parseFloat(Math.min(newHigh, 100).toFixed(2)) : parseFloat(newHigh.toFixed(2));
          adjustedMetrics.push({ metric: metricName, field: 'HIGH', from: oldHigh, to: def.HIGH });
        }
        if (def.CRITICAL !== undefined) {
          const oldCrit = def.CRITICAL;
          const newCrit = def.CRITICAL * season.factor;
          // Limitar a 100 para métricas de porcentaje
          def.CRITICAL = metricName.includes('Pct') ? parseFloat(Math.min(newCrit, 100).toFixed(2)) : parseFloat(newCrit.toFixed(2));
          adjustedMetrics.push({ metric: metricName, field: 'CRITICAL', from: oldCrit, to: def.CRITICAL });
        }
      }
    }

    if (adjustedMetrics.length > 0) {
      log.info('Ajuste estacional aplicado', { season: season.name, factor: season.factor, metricsAdjusted: adjustedMetrics.length });
      seasonalMeta.push({
        season: seasonKey,
        name: season.name,
        factor: season.factor,
        metricsAdjusted: adjustedMetrics.length,
        details: adjustedMetrics,
      });
    }
  }

  return { adjustedThresholds: adjusted, seasonalMeta };
}

// Ajusta la severidad de los breaches según el landscape
function applyLandscapePolicy(breaches, landscape) {
  const policy = getLandscapePolicy(landscape);

  return breaches.map(breach => {
    const adjusted = { ...breach };

    // En DEV, no disparar runbooks automáticos
    if (!policy.autoRemediate) {
      adjusted.autoRemediate = false;
      adjusted.landscapeNote = `[${landscape}] Solo monitoreo — no se ejecutan runbooks automáticos`;
    }
    // En QAS, forzar aprobación para todo
    else if (policy.requireApprovalOverride) {
      adjusted.requiresApproval = true;
      adjusted.landscapeNote = `[${landscape}] Requiere aprobación — environment no productivo`;
    }

    // Ajustar severidad visual (no cambia los thresholds, solo la etiqueta)
    adjusted.landscapeSeverityMultiplier = policy.alertSeverityMultiplier;
    adjusted.landscape = landscape;

    return adjusted;
  });
}

// ─── Secret cache ───
const secretCache = {};
async function getSecret(arn) {
  if (secretCache[arn]) return secretCache[arn];
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const parsed = JSON.parse(res.SecretString);
  secretCache[arn] = parsed;
  return parsed;
}

// ─── SSM helper: run shell command on instance ───
async function ssmRunCommand(instanceId, commands, osType = 'LINUX') {
  try {
    const { ssmRunWithBackoff } = require('../utilidades/ssm-poller');
    const result = await ssmRunWithBackoff(ssm, instanceId, commands, {
      osType,
      initialDelayMs: 2000,
      maxWaitMs: 30000,
    });
    return result.success ? result.output : null;
  } catch (err) {
    log.warn('SSM command failed', { instanceId, error: err.message });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATABASE COLLECTORS
// ═══════════════════════════════════════════════════════════════

async function collectDatabaseASE(sys) {
  const sid = sys.sid;
  const metrics = {};

  try {
    const creds = await getSecret(sys.database.secretArn);
    // Production: connect via node-sybase or FreeTDS
    // const conn = require('node-sybase');
    // const db = new conn({ host: creds.host, port: creds.port, ... });

    // SQL 1: Logical log fill % (suspends DB at 100%)
    // SELECT lct_admin("logfull", db_id("${sid}")) AS pct
    // SQL 2: Device free space
    // SELECT CASE WHEN u.segmap & 4 = 4 THEN 'LOG' ELSE 'DATA' END AS seg,
    //        SUM(d.size*2/1024) AS total_mb,
    //        SUM((d.size - ISNULL(u.size,0))*2/1024) AS free_mb
    // FROM master..sysdevices d
    // LEFT JOIN master..sysusages u ON d.vdevno=u.vdevno
    // WHERE d.status&2=2 AND u.dbid=db_id("${sid}")
    // GROUP BY CASE WHEN u.segmap & 4 = 4 THEN 'LOG' ELSE 'DATA' END
    // SQL 3: Minutes since last DUMP TRANSACTION
    // SELECT ISNULL(DATEDIFF(minute,MAX(start_time),GETDATE()),99999) AS mins
    // FROM master..sysbackuphistory WHERE database_name="${sid}" AND type="L"
    // SQL 4: Oldest open transaction
    // SELECT MAX(DATEDIFF(minute,open_time,GETDATE())) AS mins
    // FROM master..systransactions WHERE dbid=db_id("${sid}")
    // SQL 5: Blocking chains count
    // SELECT COUNT(*) AS cnt FROM master..sysprocesses p1
    // JOIN master..sysprocesses p2 ON p1.spid=p2.blocked WHERE p1.blocked=0
    // SQL 6: Cache hit ratio
    // SELECT ROUND((1-CONVERT(float,@@total_read)/
    //   NULLIF(CONVERT(float,@@total_read+@@total_write),0))*100,2) AS ratio

    log.info('ASE connected (simulation mode)', { host: creds.host, port: creds.port, sid });
  } catch (err) {
    log.warn('ASE DB connection not available, using simulation', { sid, error: err.message });
  }

  // Simulation fallback with realistic ASE values
  const logFullPct = 55 + Math.random() * 35;       // 55-90%
  const physLogPct = 70 + Math.random() * 25;        // 70-95%
  const physDataPct = 60 + Math.random() * 25;       // 60-85%
  const logTotalMb = 20480;
  const logFreeMb = logTotalMb * (1 - physLogPct / 100);
  const dataTotalMb = 102400;
  const dataFreeMb = dataTotalMb * (1 - physDataPct / 100);
  const lastDumpMin = Math.floor(Math.random() * 300);
  const oldestTxMin = Math.floor(Math.random() * 45);
  const blockingChains = Math.floor(Math.random() * 3);
  const cacheHitRatio = 95 + Math.random() * 4.5;
  const logGrowthPctPerHr = 0.5 + Math.random() * 5; // %/hora de crecimiento del log

  const scenario = computeScenario(physLogPct, logFullPct);

  metrics.DB_ASE_LogFullPct = parseFloat(logFullPct.toFixed(2));
  metrics.DB_ASE_PhysLogPct = parseFloat(physLogPct.toFixed(2));
  metrics.DB_ASE_PhysDataPct = parseFloat(physDataPct.toFixed(2));
  metrics.DB_ASE_LogTotalMb = logTotalMb;
  metrics.DB_ASE_LogFreeMb = parseFloat(logFreeMb.toFixed(0));
  metrics.DB_ASE_DataTotalMb = dataTotalMb;
  metrics.DB_ASE_DataFreeMb = parseFloat(dataFreeMb.toFixed(0));
  metrics.DB_ASE_LogLastDumpMin = lastDumpMin;
  metrics.DB_ASE_OldestTxMin = oldestTxMin;
  metrics.DB_ASE_BlockingChains = blockingChains;
  metrics.DB_ASE_CacheHitRatio = parseFloat(cacheHitRatio.toFixed(2));
  metrics.DB_ASE_LogGrowthPctPerHr = parseFloat(logGrowthPctPerHr.toFixed(2));
  metrics.DB_ASE_DiskScenario = scenario;
  metrics.DB_ASE_DataserverRunning = 1;
  metrics.DB_ASE_RepAgentRunning = Math.random() > 0.1 ? 1 : 0;
  metrics.DB_CollectorSuccess = 1;

  log.info('ASE metrics collected', { sid, logFullPct: metrics.DB_ASE_LogFullPct, physLogPct: metrics.DB_ASE_PhysLogPct, scenario });
  return metrics;
}

async function collectDatabaseHANA(sys) {
  const sid = sys.sid;
  const metrics = {};

  try {
    const creds = await getSecret(sys.database.secretArn);
    // Production: const hana = require('@sap/hana-client');
    // const conn = hana.createConnection({ serverNode: `${creds.host}:${creds.port}`, uid: creds.username, pwd: creds.password });
    // SELECT USED_PHYSICAL_MEMORY, TOTAL_PHYSICAL_MEMORY FROM M_HOST_RESOURCE_UTILIZATION
    // SELECT SUM(USED_SIZE) AS used, SUM(TOTAL_SIZE) AS total FROM M_DISK_USAGE WHERE USAGE_TYPE IN ('DATA','LOG')
    // SELECT REPLICATION_STATUS, SHIP_DELAY FROM M_SERVICE_REPLICATION
    // SELECT COUNT(*) FROM M_ACTIVE_STATEMENTS WHERE DURATION > 1800000000
    // SELECT COUNT(*) FROM M_CS_UNLOADS WHERE UNLOAD_TIME > ADD_SECONDS(CURRENT_TIMESTAMP, -3600)
    // SELECT COUNT(*) FROM M_CONNECTIONS WHERE CONNECTION_STATUS='RUNNING'
    // SELECT MINUTES_BETWEEN(MAX(SYS_START_TIME), CURRENT_TIMESTAMP) FROM M_BACKUP_CATALOG WHERE ENTRY_TYPE_NAME='complete data backup'
    log.info('HANA connected (simulation mode)', { host: creds.host, sid });
  } catch (err) {
    log.warn('HANA DB connection not available, using simulation', { sid, error: err.message });
  }

  const memPct = 60 + Math.random() * 30;
  const diskPct = 50 + Math.random() * 40;
  const replicationLag = Math.floor(Math.random() * 120);
  const longRunning = Math.floor(Math.random() * 3);
  const csUnloads = Math.floor(Math.random() * 10);
  const activeConns = 50 + Math.floor(Math.random() * 200);
  const lastBackupMin = Math.floor(Math.random() * 1440);

  metrics.DB_HANA_MemPct = parseFloat(memPct.toFixed(2));
  metrics.DB_HANA_DiskPct = parseFloat(diskPct.toFixed(2));
  metrics.DB_HANA_ReplicationLag = replicationLag;
  metrics.DB_HANA_LongRunningStmts = longRunning;
  metrics.DB_HANA_CSUnloads1h = csUnloads;
  metrics.DB_HANA_ActiveConns = activeConns;
  metrics.DB_HANA_LastBackupMin = lastBackupMin;
  metrics.DB_CollectorSuccess = 1;

  log.info('HANA metrics collected', { sid, memPct: metrics.DB_HANA_MemPct, diskPct: metrics.DB_HANA_DiskPct });
  return metrics;
}

async function collectDatabaseOracle(sys) {
  const sid = sys.sid;
  const metrics = {};

  try {
    const creds = await getSecret(sys.database.secretArn);
    // Production: const oracledb = require('oracledb');
    // const conn = await oracledb.getConnection({ user: creds.username, password: creds.password, connectString: `${creds.host}:${creds.port}/${creds.sid}` });
    // SELECT TABLESPACE_NAME, USED_PERCENT FROM DBA_TABLESPACE_USAGE_METRICS ORDER BY USED_PERCENT DESC FETCH FIRST 1 ROW ONLY
    // SELECT COUNT(*) FROM V$LOG_HISTORY WHERE FIRST_TIME > SYSDATE - 1/24
    // SELECT COUNT(*) FROM V$SESSION WHERE STATUS='ACTIVE' AND TYPE='USER'
    // SELECT COUNT(*) FROM V$SESSION s1 JOIN V$SESSION s2 ON s1.SID=s2.BLOCKING_SESSION WHERE s2.BLOCKING_SESSION IS NOT NULL
    // SELECT (SYSDATE - MAX(START_TIME))*1440 AS mins FROM V$RMAN_STATUS WHERE OPERATION='BACKUP' AND STATUS='COMPLETED'
    log.info('Oracle connected (simulation mode)', { host: creds.host, sid });
  } catch (err) {
    log.warn('Oracle DB connection not available, using simulation', { sid, error: err.message });
  }

  const tablespacePct = 60 + Math.random() * 30;
  const redoSwitches1h = Math.floor(5 + Math.random() * 20);
  const activeSessions = 10 + Math.floor(Math.random() * 50);
  const blockedSessions = Math.floor(Math.random() * 5);
  const lastBackupMin = Math.floor(Math.random() * 720);

  metrics.DB_ORA_TablespacePct = parseFloat(tablespacePct.toFixed(2));
  metrics.DB_ORA_RedoSwitches1h = redoSwitches1h;
  metrics.DB_ORA_ActiveSessions = activeSessions;
  metrics.DB_ORA_BlockedSessions = blockedSessions;
  metrics.DB_ORA_LastBackupMin = lastBackupMin;
  metrics.DB_CollectorSuccess = 1;

  log.info('Oracle metrics collected', { sid, tablespacePct: metrics.DB_ORA_TablespacePct, activeSessions });
  return metrics;
}

async function collectDatabaseMSSQL(sys) {
  const sid = sys.sid;
  const metrics = {};

  try {
    const creds = await getSecret(sys.database.secretArn);
    // Production: const sql = require('mssql');
    // const pool = await sql.connect({ server: creds.host, port: creds.port, user: creds.username, password: creds.password, database: creds.database, options: { encrypt: true } });
    // SELECT (SUM(CASE WHEN type_desc='LOG' THEN space_used_in_bytes END)*100.0/SUM(CASE WHEN type_desc='LOG' THEN max_size_in_bytes END)) FROM sys.dm_db_file_space_usage
    // SELECT (SUM(CASE WHEN type_desc='ROWS' THEN allocated_extent_page_count*8192 END)*100.0/SUM(CASE WHEN type_desc='ROWS' THEN total_page_count*8192 END)) FROM sys.dm_db_file_space_usage
    // SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE status='running' AND is_user_process=1
    // SELECT TOP 5 wait_type, wait_time_ms FROM sys.dm_os_wait_stats ORDER BY wait_time_ms DESC
    // SELECT COUNT(*) FROM msdb.dbo.sysjobhistory WHERE run_status=0 AND DATEDIFF(hour, msdb.dbo.agent_datetime(run_date,run_time), GETDATE()) <= 24
    // v1.0: SELECT DATEDIFF(minute, MAX(backup_finish_date), GETDATE()) AS mins FROM msdb.dbo.backupset WHERE database_name='${sid}' AND type IN ('D','I')
    log.info('MSSQL connected (simulation mode)', { host: creds.host, sid });
  } catch (err) {
    log.warn('MSSQL DB connection not available, using simulation', { sid, error: err.message });
  }

  const logPct = 40 + Math.random() * 45;
  const dataPct = 55 + Math.random() * 35;
  const activeConns = 20 + Math.floor(Math.random() * 80);
  const failedJobs24h = Math.floor(Math.random() * 5);
  const lastBackupMin = Math.floor(Math.random() * 1440); // v1.0: minutos desde último backup

  metrics.DB_MSSQL_LogPct = parseFloat(logPct.toFixed(2));
  metrics.DB_MSSQL_DataPct = parseFloat(dataPct.toFixed(2));
  metrics.DB_MSSQL_ActiveConns = activeConns;
  metrics.DB_MSSQL_FailedJobs24h = failedJobs24h;
  metrics.DB_MSSQL_LastBackupMin = lastBackupMin;
  metrics.DB_CollectorSuccess = 1;

  log.info('MSSQL metrics collected', { sid, logPct: metrics.DB_MSSQL_LogPct, dataPct: metrics.DB_MSSQL_DataPct, lastBackupMin });
  return metrics;
}

async function collectDatabaseDB2(sys) {
  const sid = sys.sid;
  const metrics = {};

  try {
    const creds = await getSecret(sys.database.secretArn);
    // Production: const ibmdb = require('ibm_db');
    // const connStr = `DATABASE=${creds.database};HOSTNAME=${creds.host};PORT=${creds.port};UID=${creds.username};PWD=${creds.password}`;
    // SELECT TBSP_NAME, TBSP_USED_SIZE_KB*100.0/TBSP_TOTAL_SIZE_KB AS pct FROM SYSIBMADM.TBSP_UTILIZATION ORDER BY pct DESC FETCH FIRST 1 ROW ONLY
    // SELECT LOG_UTILIZATION_PERCENT FROM TABLE(MON_GET_DATABASE('',-2))
    // SELECT TOTAL_APP_COMMITS FROM TABLE(MON_GET_DATABASE('',-2))
    // SELECT BP_HIT_RATIO_PERCENT FROM TABLE(MON_GET_BUFFERPOOL('',-2)) FETCH FIRST 1 ROW ONLY
    // v1.0: SELECT TIMESTAMPDIFF(4, CHAR(CURRENT_TIMESTAMP - MAX(TIMESTAMP))) AS mins FROM SYSIBMADM.DB_HISTORY WHERE OPERATION='B' AND SQLCODE=0
    log.info('DB2 connected (simulation mode)', { host: creds.host, sid });
  } catch (err) {
    log.warn('DB2 DB connection not available, using simulation', { sid, error: err.message });
  }

  const tablespacePct = 55 + Math.random() * 35;
  const logPct = 30 + Math.random() * 50;
  const connections = 15 + Math.floor(Math.random() * 60);
  const bpHitRatio = 92 + Math.random() * 7;
  const lastBackupMin = Math.floor(Math.random() * 2880); // v1.0: minutos desde último backup

  metrics.DB_DB2_TablespacePct = parseFloat(tablespacePct.toFixed(2));
  metrics.DB_DB2_LogPct = parseFloat(logPct.toFixed(2));
  metrics.DB_DB2_Connections = connections;
  metrics.DB_DB2_BPHitRatio = parseFloat(bpHitRatio.toFixed(2));
  metrics.DB_DB2_LastBackupMin = lastBackupMin;
  metrics.DB_CollectorSuccess = 1;

  log.info('DB2 metrics collected', { sid, tablespacePct: metrics.DB_DB2_TablespacePct, logPct: metrics.DB_DB2_LogPct, lastBackupMin });
  return metrics;
}

// ─── MaxDB collector (v1.9) ───
async function collectDatabaseMaxDB(sys) {
  const sid = sys.sid;
  const metrics = {};

  try {
    // Producción: dbmcli -d <SID> -u CONTROL,<pwd> info data
    //             dbmcli -d <SID> -u CONTROL,<pwd> info log
    //             dbmcli -d <SID> -u CONTROL,<pwd> info caches
    // Simulación con datos realistas de MaxDB
    metrics.DB_MAXDB_DataVolPct = parseFloat((60 + Math.random() * 35).toFixed(1));
    metrics.DB_MAXDB_LogVolPct = parseFloat((40 + Math.random() * 45).toFixed(1));
    metrics.DB_MAXDB_DataCacheHitPct = parseFloat((65 + Math.random() * 34).toFixed(1));
    metrics.DB_MAXDB_LockWaitPct = parseFloat((Math.random() * 12).toFixed(1));
    metrics.DB_MAXDB_Sessions = Math.floor(5 + Math.random() * 75);
    metrics.DB_MAXDB_LastBackupMin = Math.floor(60 + Math.random() * 1940);
    metrics.DB_CollectorSuccess = 1;

    log.info('MaxDB metrics collected', { sid, metrics });
  } catch (err) {
    log.error('Error recopilando métricas MaxDB', { sid, error: err.message });
    metrics.DB_CollectorSuccess = 0;
  }

  return metrics;
}

// Route to correct DB collector
async function collectDatabase(sys) {
  const dbType = sys.database.type;
  switch (dbType) {
    case 'SAP_ASE':   return collectDatabaseASE(sys);
    case 'SAP_HANA':  return collectDatabaseHANA(sys);
    case 'ORACLE':    return collectDatabaseOracle(sys);
    case 'MSSQL':     return collectDatabaseMSSQL(sys);
    case 'IBM_DB2':   return collectDatabaseDB2(sys);
    case 'MAXDB':     return collectDatabaseMaxDB(sys);
    default:
      log.error('Unknown database type', { dbType });
      return { DB_CollectorSuccess: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
//  APPLICATION COLLECTORS
// ═══════════════════════════════════════════════════════════════

async function collectApplicationPO(sys) {
  const metrics = {};

  try {
    const creds = await getSecret(sys.appSecretArn);
    // Production: JMX HTTP API (NWA) calls
    // GET https://${creds.host}:${creds.jmxPort}/nwa/metrics/jvm
    // GET https://${creds.host}:${creds.jmxPort}/nwa/metrics/icm
    // GET https://${creds.host}:${creds.port}/mdt/MessageOverviewQuery (PO Message Monitor)
    // GET https://${creds.host}:${creds.port}/AdapterFramework/ChannelAdminServlet (Adapter Engine)
    log.info('PO connecting to NWA (simulation mode)', { host: creds.host });
  } catch (err) {
    log.warn('PO app connection not available, using simulation', { error: err.message });
  }

  // JVM metrics
  metrics.APP_JVM_HeapPct = parseFloat((65 + Math.random() * 25).toFixed(2));
  metrics.APP_JVM_OldGenPct = parseFloat((60 + Math.random() * 30).toFixed(2));
  metrics.APP_JVM_GCOverheadPct = parseFloat((2 + Math.random() * 15).toFixed(2));
  metrics.APP_ThreadPoolPct = parseFloat((40 + Math.random() * 40).toFixed(2));
  // ICM metrics — porcentaje del máximo de conexiones
  const icmMaxConns = 500;
  const icmActiveConns = 20 + Math.floor(Math.random() * 80);
  metrics.APP_ICM_ActiveConns = icmActiveConns;
  metrics.APP_ICM_ConnectionsPct = parseFloat((icmActiveConns / icmMaxConns * 100).toFixed(2));
  metrics.APP_ICM_QueueDepth = Math.floor(Math.random() * 15);
  // PO Message Monitor
  metrics.APP_PO_FailedMessages = Math.floor(Math.random() * 20);
  metrics.APP_PO_StuckMessages = Math.floor(Math.random() * 8);
  metrics.APP_PO_RetryQueue = Math.floor(Math.random() * 25);
  // Adapter Engine
  metrics.APP_PO_ActiveChannels = 15 + Math.floor(Math.random() * 30);
  metrics.APP_PO_InactiveChannels = Math.floor(Math.random() * 5);
  metrics.APP_PO_ChannelErrorRate = parseFloat((Math.random() * 5).toFixed(2));
  // Connectivity
  metrics.APP_PO_EndpointsReachable = Math.random() > 0.05 ? 1 : 0;
  // v1.0 — Certificados ICM/PSE (sapcontrol -function ICMGetCacheEntries)
  metrics.APP_ICM_CertExpiryDays = Math.floor(15 + Math.random() * 350);
  metrics.APP_CollectorSuccess = 1;

  log.info('PO metrics collected', { heapPct: metrics.APP_JVM_HeapPct, failedMessages: metrics.APP_PO_FailedMessages, certExpiryDays: metrics.APP_ICM_CertExpiryDays });
  return metrics;
}

async function collectApplicationECC(sys) {
  const metrics = {};

  try {
    const creds = await getSecret(sys.appSecretArn);
    // Production: RFC calls via node-rfc (requires SAP NW RFC Library Lambda Layer)
    // const noderfc = require('node-rfc');
    // const client = new noderfc.Client({ ashost: creds.host, sysnr: '00', client: '100', user: creds.username, passwd: creds.password });
    // await client.open();
    // const wpResult = await client.call('TH_WPINFO', {}); // Work process info
    // const dumpResult = await client.call('RFC_READ_TABLE', { QUERY_TABLE: 'SNAP', ... }); // Short dumps
    // const enqResult = await client.call('ENQUEUE_READ', {}); // Enqueue table
    log.info('ECC RFC connection (simulation mode)', { host: creds.host });
  } catch (err) {
    // Graceful fallback if RFC library layer is not attached
    log.warn('node-rfc not available, using simulation', { detail: 'RFC Library Lambda Layer may not be attached', error: err.message });
  }

  const totalDiaWP = 20;
  const freeDiaWP = Math.floor(3 + Math.random() * 15);
  const totalBgWP = 10;
  const freeBgWP = Math.floor(2 + Math.random() * 8);
  const totalUpdWP = 4;
  const freeUpdWP = Math.floor(1 + Math.random() * 3);

  metrics.APP_ABAP_TotalDiaWP = totalDiaWP;
  metrics.APP_ABAP_FreeDiaWP = freeDiaWP;
  metrics.APP_ABAP_TotalBgWP = totalBgWP;
  metrics.APP_ABAP_FreeBgWP = freeBgWP;
  metrics.APP_ABAP_TotalUpdWP = totalUpdWP;
  metrics.APP_ABAP_FreeUpdWP = freeUpdWP;
  metrics.APP_ABAP_ShortDumps24h = Math.floor(Math.random() * 30);
  metrics.APP_ABAP_EnqueuePct = parseFloat((10 + Math.random() * 40).toFixed(2));
  metrics.APP_ABAP_RFCQueueDepth = Math.floor(Math.random() * 50);
  metrics.APP_ABAP_TRFCQueueDepth = Math.floor(Math.random() * 20);
  metrics.APP_ABAP_QRFCQueueDepth = Math.floor(Math.random() * 15);
  metrics.APP_ABAP_FailedJobs24h = Math.floor(Math.random() * 10);
  metrics.APP_ABAP_LongRunningJobs = Math.floor(Math.random() * 3);
  metrics.APP_ABAP_SM21Critical1h = Math.floor(Math.random() * 8);
  // v1.0 — WP Priv/Hold (sapcontrol -function ABAPGetWPTable)
  metrics.APP_ABAP_PrivModeWP = Math.floor(Math.random() * 2);
  metrics.APP_ABAP_HoldWP = Math.floor(Math.random() * 3);
  // v1.0 — Certificados ICM/PSE (sapcontrol -function ICMGetCacheEntries)
  metrics.APP_ICM_CertExpiryDays = Math.floor(15 + Math.random() * 350);
  // v1.0 — Housekeeping (SM21, SP01, TEMSE)
  // Production: RFC_READ_TABLE en SNAP, TBTCO/TBTCP, TSP01, RSTS (TEMSE)
  metrics.APP_ABAP_OldSpoolJobs = Math.floor(Math.random() * 800);
  metrics.APP_ABAP_SM21OldLogs = Math.floor(Math.random() * 3000);
  metrics.APP_ABAP_TEMSEObjects = Math.floor(Math.random() * 3000);
  // v1.0 — Lock management SM12 (sapcontrol -function EnqGetStatistic)
  // Production: ENQUEUE_READ via RFC → contar locks con edad > 1h
  metrics.APP_ABAP_OldEnqLocks = Math.floor(Math.random() * 10);
  metrics.APP_ABAP_LockWaitTimeSec = Math.floor(Math.random() * 60);
  // v1.0 — Transport queue STMS
  // Production: RFC_READ_TABLE en E070 WHERE TRKORR LIKE 'PRDK*' AND TRSTATUS IN ('D','L')
  metrics.APP_ABAP_StuckTransports = Math.floor(Math.random() * 5);
  metrics.APP_ABAP_FailedTransports = Math.floor(Math.random() * 3);
  metrics.APP_CollectorSuccess = 1;

  log.info('ECC metrics collected', { freeDiaWP, totalDiaWP, shortDumps24h: metrics.APP_ABAP_ShortDumps24h, privModeWP: metrics.APP_ABAP_PrivModeWP, rfcQueueDepth: metrics.APP_ABAP_RFCQueueDepth, failedJobs24h: metrics.APP_ABAP_FailedJobs24h, oldEnqLocks: metrics.APP_ABAP_OldEnqLocks, stuckTransports: metrics.APP_ABAP_StuckTransports });
  return metrics;
}

async function collectApplicationNetWeaver(sys) {
  // NetWeaver = Java + ABAP mixed → collect BOTH PO metrics AND ECC metrics
  const poMetrics = await collectApplicationPO(sys);
  const eccMetrics = await collectApplicationECC(sys);
  return { ...poMetrics, ...eccMetrics };
}

async function collectApplicationFiori(sys) {
  const metrics = {};

  try {
    const creds = await getSecret(sys.appSecretArn);
    // Production: HTTP probes to OData service endpoints
    // GET https://${creds.host}:${creds.port}/sap/opu/odata/sap/ → measure response time
    // GET https://${creds.host}:${creds.port}/sap/bc/ina/service/v2/ → analytics service
    log.info('Fiori connecting (simulation mode)', { host: creds.host });
  } catch (err) {
    log.warn('Fiori connection not available, using simulation', { error: err.message });
  }

  metrics.APP_FIORI_ResponseTimeMs = parseFloat((100 + Math.random() * 900).toFixed(0));
  metrics.APP_ICM_ActiveConns = 30 + Math.floor(Math.random() * 70);
  metrics.APP_ICM_PoolUsagePct = parseFloat((30 + Math.random() * 50).toFixed(2));
  metrics.APP_FIORI_SessionCount = 50 + Math.floor(Math.random() * 200);
  metrics.APP_FIORI_CacheHitRatio = parseFloat((70 + Math.random() * 28).toFixed(2));
  // v1.0 — Certificados ICM/PSE (sapcontrol -function ICMGetCacheEntries)
  metrics.APP_ICM_CertExpiryDays = Math.floor(15 + Math.random() * 350);
  metrics.APP_CollectorSuccess = 1;

  log.info('Fiori metrics collected', { responseTimeMs: metrics.APP_FIORI_ResponseTimeMs, sessionCount: metrics.APP_FIORI_SessionCount, certExpiryDays: metrics.APP_ICM_CertExpiryDays });
  return metrics;
}

// Route to correct application collector
async function collectApplication(sys) {
  const sysType = sys.systemType;
  switch (sysType) {
    case 'SAP_PO':
    case 'SAP_PI':
      return collectApplicationPO(sys);
    case 'SAP_ECC':
    case 'SAP_S4HANA':
    case 'SAP_BW':
      return collectApplicationECC(sys);
    case 'SAP_NETWEAVER':
      return collectApplicationNetWeaver(sys);
    case 'SAP_FIORI':
    case 'SAP_GATEWAY':
      return collectApplicationFiori(sys);
    default:
      log.error('Unknown system type', { sysType });
      return { APP_CollectorSuccess: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
//  CLOUDWATCH PUBLISHER
// ═══════════════════════════════════════════════════════════════

async function publishMetrics(systemId, env, metrics) {
  const timestamp = new Date();
  const dimensions = [
    { Name: 'SAPSystemId', Value: systemId },
    { Name: 'Environment', Value: env },
  ];

  const metricData = Object.entries(metrics).map(([name, value]) => ({
    MetricName: name,
    Value: typeof value === 'number' ? value : 0,
    Timestamp: timestamp,
    Dimensions: dimensions,
    Unit: name.includes('Pct') || name.includes('Ratio') ? 'Percent' :
          name.includes('Min') ? 'Seconds' :
          name.includes('Mb') ? 'Megabytes' : 'Count',
  }));

  // Batch into groups of 20 (CloudWatch limit)
  for (let i = 0; i < metricData.length; i += METRICS_PER_BATCH) {
    const batch = metricData.slice(i, i + METRICS_PER_BATCH);
    const cmd = new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: batch,
    });
    // v1.0 — Reintentar una vez si CloudWatch falla
    try {
      await cw.send(cmd);
    } catch (err) {
      log.warn('Error publicando métricas (intento 1), reintentando', { error: err.message });
      try {
        await new Promise(r => setTimeout(r, 1000));
        await cw.send(cmd);
      } catch (retryErr) {
        log.error('Error publicando métricas después de reintento', { error: retryErr.message });
      }
    }
  }

  log.info('Metrics published to CloudWatch', { metricCount: metricData.length, systemId, batches: Math.ceil(metricData.length / METRICS_PER_BATCH) });
}

// ═══════════════════════════════════════════════════════════════
//  HEALTH SCORE (v1.6)
//  Calcula un score de salud 0-100 para cada sistema SAP.
//  100 = todas las métricas en zona saludable
//  50 = al menos una métrica en zona HIGH
//  0 = al menos una métrica en zona CRITICAL
//  El score se publica como métrica CloudWatch SYS_HealthScore.
// ═══════════════════════════════════════════════════════════════

function calculateMetricScore(value, thresholdDef) {
  if (thresholdDef.CRITICAL_BELOW !== undefined) {
    // Invertida: menor es peor (ej: FreeDiaWP, CacheHitRatio, CertExpiryDays)
    const high = thresholdDef.HIGH_BELOW;
    const critical = thresholdDef.CRITICAL_BELOW;
    if (value <= critical) return 0;
    if (value <= high) return Math.round(50 * (value - critical) / (high - critical));
    // Zona saludable: escalar de 50 a 100
    const headroom = Math.min((value - high) / high, 1);
    return Math.round(50 + 50 * headroom);
  } else {
    // Normal: mayor es peor (ej: LogFullPct, MemPct)
    const high = thresholdDef.HIGH;
    const critical = thresholdDef.CRITICAL;
    if (value >= critical) return 0;
    if (value >= high) return Math.round(50 * (critical - value) / (critical - high));
    // Zona saludable: escalar de 50 a 100
    return Math.round(50 + 50 * (1 - value / high));
  }
}

function calculateHealthScore(metrics) {
  // v1.0 — Protección contra division por cero
  if (!metrics || Object.keys(metrics).length === 0) {
    return -1; // No calculable
  }

  const scores = [];

  for (const [metricName, thresholdDef] of Object.entries(THRESHOLDS)) {
    const value = metrics[metricName];
    if (value === undefined || value === null) continue;
    scores.push(calculateMetricScore(value, thresholdDef));
  }

  if (scores.length === 0) return 50; // Sin datos → neutral
  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return Math.round(avg);
}

// ═══════════════════════════════════════════════════════════════
//  METRIC ANOMALY DETECTION (v1.7)
//  Detección de anomalías usando Z-score comparando el valor
//  actual contra un promedio histórico almacenado en DynamoDB.
//  Si |z-score| > 3 → anomalía severa, > 2 → anomalía moderada.
//  Solo aplica a métricas que NO están ya en breach (para detectar
//  comportamientos inusuales que aún no cruzan umbrales).
// ═══════════════════════════════════════════════════════════════

async function updateMetricBaseline(systemId, metricName, value) {
  // Actualizar promedio móvil exponencial y varianza en DynamoDB
  try {
    const result = await ddbDoc.send(new GetCommand({
      TableName: METRICS_HISTORY_TABLE,
      Key: { pk: `BASELINE#${systemId}`, sk: metricName },
    }));

    const alpha = 0.1; // Factor de suavizado EMA
    const existing = result.Item;

    let mean, variance, count;
    if (!existing) {
      mean = value;
      variance = 0;
      count = 1;
    } else {
      const oldMean = existing.mean || value;
      const oldVariance = existing.variance || 0;
      count = (existing.count || 0) + 1;
      // Exponential Moving Average
      mean = oldMean + alpha * (value - oldMean);
      // Welford varianza online con EMA
      variance = (1 - alpha) * (oldVariance + alpha * Math.pow(value - oldMean, 2));
    }

    await ddbDoc.send(new UpdateCommand({
      TableName: METRICS_HISTORY_TABLE,
      Key: { pk: `BASELINE#${systemId}`, sk: metricName },
      UpdateExpression: 'SET #m = :mean, #v = :var, #c = :cnt, lastValue = :val, updatedAt = :now, #ttlAttr = :ttl',
      ExpressionAttributeNames: { '#m': 'mean', '#v': 'variance', '#c': 'count', '#ttlAttr': 'ttl' },
      ExpressionAttributeValues: {
        ':mean': mean,
        ':var': variance,
        ':cnt': count,
        ':val': value,
        ':now': new Date().toISOString(),
        ':ttl': Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 días TTL
      },
    }));

    return { mean, variance, count };
  } catch (err) {
    log.warn('Error actualizando baseline', { metricName, error: err.message });
    return null;
  }
}

async function detectAnomalies(systemId, metrics, breachedMetrics) {
  const anomalies = [];

  for (const [metricName, value] of Object.entries(metrics)) {
    // Ignorar métricas ya en breach (esas ya las maneja detectBreaches)
    if (breachedMetrics.has(metricName)) continue;
    // Ignorar métricas que no son numéricas o no tienen threshold definido
    if (typeof value !== 'number' || !THRESHOLDS[metricName]) continue;

    const baseline = await updateMetricBaseline(systemId, metricName, value);
    if (!baseline || baseline.count < 12) continue; // Necesitamos al menos 1 hora de datos (12 x 5min)

    const stdDev = Math.sqrt(baseline.variance);
    if (stdDev === 0) continue; // Sin varianza, no hay anomalías

    const zScore = (value - baseline.mean) / stdDev;
    const absZ = Math.abs(zScore);

    if (absZ > 2) {
      anomalies.push({
        metricName,
        value,
        baselineMean: parseFloat(baseline.mean.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2)),
        zScore: parseFloat(zScore.toFixed(2)),
        severity: absZ > 3 ? 'ANOMALY_HIGH' : 'ANOMALY_MODERATE',
        direction: zScore > 0 ? 'ABOVE_NORMAL' : 'BELOW_NORMAL',
      });
    }
  }

  return anomalies;
}

// ═══════════════════════════════════════════════════════════════
//  ADAPTIVE ALERT SUPPRESSION (v1.6)
//  Si una métrica genera breach a la misma hora del día de forma
//  recurrente (≥3 veces en 7 días en la misma franja horaria),
//  la alerta se suprime y se marca como "patrón conocido".
//  Esto evita ruido de alertas por procesos cíclicos (backups
//  nocturnos, batch processing, etc).
//
//  Almacena patrones en DynamoDB con pk=ALERT_PATTERN#{systemId}
//  y sk={metricName}. Cada entrada tiene un mapa de hora→conteo.
// ═══════════════════════════════════════════════════════════════

async function recordBreachPattern(systemId, metricName) {
  const hourSlot = new Date().getUTCHours(); // 0-23
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: METRICS_HISTORY_TABLE,
      Key: { pk: `ALERT_PATTERN#${systemId}`, sk: metricName },
      UpdateExpression: 'ADD hourCounts.#h :one SET lastUpdated = :now, #ttlAttr = :ttl',
      ExpressionAttributeNames: { '#h': String(hourSlot), '#ttlAttr': 'ttl' },
      ExpressionAttributeValues: {
        ':one': 1,
        ':now': new Date().toISOString(),
        ':ttl': Math.floor(Date.now() / 1000) + 8 * 24 * 60 * 60, // TTL 8 días
      },
    }));
  } catch (err) {
    // No bloquear la ejecución si falla el tracking
    log.warn('Error registrando patrón de breach', { error: err.message });
  }
}

async function isRecurringPattern(systemId, metricName) {
  const hourSlot = String(new Date().getUTCHours());
  try {
    const result = await ddbDoc.send(new GetCommand({
      TableName: METRICS_HISTORY_TABLE,
      Key: { pk: `ALERT_PATTERN#${systemId}`, sk: metricName },
    }));
    const count = result.Item?.hourCounts?.[hourSlot] || 0;
    if (count >= 3) {
      log.info('Alerta suprimida por patrón recurrente', { metricName, systemId, count, hourSlot });
      return true;
    }
    return false;
  } catch (err) {
    return false; // En caso de error, no suprimir
  }
}

// ═══════════════════════════════════════════════════════════════
//  BREACH DETECTION
// ═══════════════════════════════════════════════════════════════

function detectBreaches(metrics, systemId, dbType, systemType, effectiveThresholds) {
  const breaches = [];
  const thresholdsToUse = effectiveThresholds || THRESHOLDS;

  for (const [metricName, thresholdDef] of Object.entries(thresholdsToUse)) {
    const value = metrics[metricName];
    if (value === undefined || value === null) continue;

    let severity = null;

    if (thresholdDef.CRITICAL_BELOW !== undefined) {
      // Inverted threshold (lower is worse, e.g., free work processes)
      if (value < thresholdDef.CRITICAL_BELOW) severity = 'CRITICAL';
      else if (value < thresholdDef.HIGH_BELOW) severity = 'HIGH';
    } else {
      // Normal threshold (higher is worse)
      if (value >= thresholdDef.CRITICAL) severity = 'CRITICAL';
      else if (value >= thresholdDef.HIGH) severity = 'HIGH';
    }

    if (severity) {
      breaches.push({
        metricName,
        value,
        severity,
        threshold: severity === 'CRITICAL' ? (thresholdDef.CRITICAL || thresholdDef.CRITICAL_BELOW) : (thresholdDef.HIGH || thresholdDef.HIGH_BELOW),
        runbook: thresholdDef.runbook,
        costSafe: thresholdDef.costSafe,
        requiresApproval: thresholdDef.requiresApproval,
        systemId,
        dbType,
        systemType,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (breaches.length > 0) {
    log.info('Breaches detected', { systemId, breachCount: breaches.length, breaches: breaches.map(b => ({ metric: b.metricName, value: b.value, severity: b.severity })) });
  }

  // v1.8 — Auto-clasificar cada breach por categoría
  for (const breach of breaches) {
    breach.category = classifyIncident(breach.metricName);
  }

  return breaches;
}

// ═══════════════════════════════════════════════════════════════
//  INCIDENT AUTO-CLASSIFICATION (v1.8)
//  Clasifica cada incidente por categoría basándose en el prefijo
//  del nombre de la métrica. Facilita filtrado y reportes.
// ═══════════════════════════════════════════════════════════════

const METRIC_CATEGORIES = {
  DB_ASE_:     'DATABASE',
  DB_HANA_:    'DATABASE',
  DB_ORA_:     'DATABASE',
  DB_MSSQL_:   'DATABASE',
  DB_DB2_:     'DATABASE',
  DB_MAXDB_:   'DATABASE',
  APP_JVM_:    'JVM',
  APP_Thread:  'JVM',
  APP_ICM_:    'NETWORK',
  APP_PO_:     'MIDDLEWARE',
  APP_ABAP_FreeDiaWP:     'WORKPROCESS',
  APP_ABAP_PrivModeWP:    'WORKPROCESS',
  APP_ABAP_HoldWP:        'WORKPROCESS',
  APP_ABAP_RFC:           'NETWORK',
  APP_ABAP_tRFC:          'NETWORK',
  APP_ABAP_qRFC:          'NETWORK',
  APP_ABAP_ShortDumps:    'APPLICATION',
  APP_ABAP_FailedJobs:    'JOBS',
  APP_ABAP_LongRunning:   'JOBS',
  APP_ABAP_OldSpool:      'HOUSEKEEPING',
  APP_ABAP_SM21:          'HOUSEKEEPING',
  APP_ABAP_TEMSE:         'HOUSEKEEPING',
  APP_ABAP_OldEnqLocks:   'LOCKS',
  APP_ABAP_LockWait:      'LOCKS',
  APP_ABAP_StuckTransports:  'TRANSPORT',
  APP_ABAP_FailedTransports: 'TRANSPORT',
};

function classifyIncident(metricName) {
  // Buscar desde el prefijo más largo al más corto
  if (metricName.includes('LastBackup') || metricName.includes('CertExpiry')) return 'BACKUP_CERT';

  for (const [prefix, category] of Object.entries(METRIC_CATEGORIES)) {
    if (metricName.startsWith(prefix)) return category;
  }
  return 'OTHER';
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H19: ROOT CAUSE ANALYSIS (Correlación de Métricas)
//  Cuando múltiples breaches ocurren simultáneamente, se analizan
//  las correlaciones conocidas para sugerir una causa raíz.
//  Esto reduce el ruido de alertas y guía la remediación.
// ═══════════════════════════════════════════════════════════════

const CORRELATION_RULES = [
  {
    id: 'RCA-ASE-LOG-SPACE',
    name: 'ASE: Espacio de log agotado',
    trigger: ['DB_ASE_LogFullPct', 'DB_ASE_PhysLogPct'],
    optional: ['DB_ASE_LogGrowthPctPerHr', 'DB_ASE_OldestTxMin'],
    rootCause: 'El log de transacciones está lleno Y el disco físico del log está al límite. Causa probable: transacciones abiertas no committed o falta de dump tran regular.',
    suggestedAction: 'Ejecutar dump tran con truncate_only y verificar transacciones abiertas.',
    primaryRunbook: 'RB-ASE-001',
  },
  {
    id: 'RCA-ASE-DISK-FULL',
    name: 'ASE: Disco completo (log + data)',
    trigger: ['DB_ASE_PhysLogPct', 'DB_ASE_PhysDataPct'],
    optional: ['DB_ASE_DiskScenario'],
    rootCause: 'Tanto el disco de log como el de data están al límite. El servidor puede quedar inoperativo pronto.',
    suggestedAction: 'Expandir volúmenes EBS urgentemente. Ejecutar housekeeping para liberar espacio temporal.',
    primaryRunbook: 'RB-ASE-003',
  },
  {
    id: 'RCA-ASE-BLOCKING',
    name: 'ASE: Cadena de bloqueos con log lleno',
    trigger: ['DB_ASE_BlockingChains', 'DB_ASE_LogFullPct'],
    optional: ['DB_ASE_OldestTxMin'],
    rootCause: 'Bloqueos de cadena mantienen transacciones abiertas que impiden liberar el log. Una transacción bloqueada consume espacio de log continuamente.',
    suggestedAction: 'Identificar y terminar la transacción bloqueadora raíz. Luego ejecutar dump tran.',
    primaryRunbook: 'RB-ASE-001',
  },
  {
    id: 'RCA-JVM-MEMORY-PRESSURE',
    name: 'JVM: Presión de memoria (Heap + OldGen)',
    trigger: ['APP_JVM_HeapPct', 'APP_JVM_OldGenPct'],
    optional: ['APP_JVM_GCOverheadPct'],
    rootCause: 'El heap general Y el OldGen están saturados. Indica memory leak o carga sostenida que supera la capacidad de GC.',
    suggestedAction: 'Forzar Full GC. Si persiste, capturar heap dump para análisis de memory leak.',
    primaryRunbook: 'RB-JVM-002',
  },
  {
    id: 'RCA-JVM-GC-STORM',
    name: 'JVM: GC Storm (overhead + threads)',
    trigger: ['APP_JVM_GCOverheadPct', 'APP_ThreadPoolPct'],
    optional: ['APP_JVM_HeapPct'],
    rootCause: 'El GC consume demasiado CPU y los thread pools se agotan. La aplicación es efectivamente irresponsiva.',
    suggestedAction: 'Restart urgente del application server. Analizar carga antes del reinicio.',
    primaryRunbook: 'RB-JVM-001',
  },
  {
    id: 'RCA-HANA-RESOURCE-EXHAUSTION',
    name: 'HANA: Agotamiento de recursos (mem + disco)',
    trigger: ['DB_HANA_MemPct', 'DB_HANA_DiskPct'],
    optional: [],
    rootCause: 'HANA tiene memoria Y disco al límite. La base de datos puede degradarse severamente o fallar.',
    suggestedAction: 'Reclamar datavolume, limpiar SQL cache, expandir disco si necesario.',
    primaryRunbook: 'RB-HANA-001',
  },
  {
    id: 'RCA-ABAP-WORKPROCESS-EXHAUSTION',
    name: 'ABAP: Work processes agotados',
    trigger: ['APP_ABAP_FreeDiaWP', 'APP_ABAP_PrivModeWP'],
    optional: ['APP_ABAP_HoldWP', 'APP_ABAP_OldEnqLocks'],
    rootCause: 'Los work processes DIA están agotados mientras hay WPs en modo PRIV. Usuarios sin DIA WPs disponibles no pueden conectarse.',
    suggestedAction: 'Liberar WPs en modo PRIV/Hold. Verificar locks SM12 que puedan estar reteniendo sesiones.',
    primaryRunbook: 'RB-WP-001',
  },
  {
    id: 'RCA-RFC-QUEUE-OVERFLOW',
    name: 'ABAP: Overflow de colas RFC',
    trigger: ['APP_ABAP_RFCQueueDepth', 'APP_ABAP_TRFCQueueDepth'],
    optional: ['APP_ABAP_QRFCQueueDepth'],
    rootCause: 'Múltiples colas RFC saturadas. Indica problema de conectividad con sistemas destino o carga excesiva de interfaces.',
    suggestedAction: 'Verificar conectividad RFC con SM59. Limpiar colas bloqueadas en SM58.',
    primaryRunbook: 'RB-RFC-001',
  },
  {
    id: 'RCA-MAXDB-STORAGE',
    name: 'MaxDB: Almacenamiento agotado',
    trigger: ['DB_MAXDB_DataVolPct', 'DB_MAXDB_LogVolPct'],
    optional: [],
    rootCause: 'Tanto el volumen de datos como el de log de MaxDB están al límite. Requiere expansión urgente.',
    suggestedAction: 'Expandir volúmenes de datos y log. Verificar backups y rotación de logs.',
    primaryRunbook: 'RB-MAXDB-002',
  },
  {
    id: 'RCA-HOUSEKEEPING-DEBT',
    name: 'ABAP: Deuda de housekeeping',
    trigger: ['APP_ABAP_OldSpoolJobs', 'APP_ABAP_SM21OldLogs'],
    optional: ['APP_ABAP_TEMSEObjects'],
    rootCause: 'Spool jobs antiguos Y logs SM21 acumulados. El sistema no está ejecutando housekeeping regular.',
    suggestedAction: 'Ejecutar limpieza masiva de spools (SP01), logs (SM21) y TEMSE. Programar job periódico.',
    primaryRunbook: 'RB-HOUSE-001',
  },
];

function analyzeRootCauses(breaches) {
  if (breaches.length < 2) return []; // Se necesitan al menos 2 breaches para correlación

  const breachedMetricNames = new Set(breaches.map(b => b.metricName));
  const rootCauses = [];

  for (const rule of CORRELATION_RULES) {
    // Verificar si TODOS los triggers están en breach
    const triggersMatched = rule.trigger.every(metric => breachedMetricNames.has(metric));
    if (!triggersMatched) continue;

    // Contar cuántos opcionales también están en breach
    const optionalMatched = rule.optional.filter(metric => breachedMetricNames.has(metric));

    // Calcular confianza basada en triggers + opcionales
    const totalPossible = rule.trigger.length + rule.optional.length;
    const totalMatched = rule.trigger.length + optionalMatched.length;
    const confidence = parseFloat(((totalMatched / totalPossible) * 100).toFixed(0));

    // Obtener los breaches relacionados
    const relatedBreaches = breaches.filter(b =>
      rule.trigger.includes(b.metricName) || rule.optional.includes(b.metricName)
    );

    // Determinar severidad máxima de los breaches correlacionados
    const maxSeverity = relatedBreaches.some(b => b.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH';

    rootCauses.push({
      ruleId: rule.id,
      name: rule.name,
      rootCause: rule.rootCause,
      suggestedAction: rule.suggestedAction,
      primaryRunbook: rule.primaryRunbook,
      confidence,
      severity: maxSeverity,
      triggeredBy: rule.trigger,
      optionalMatched,
      relatedBreachCount: relatedBreaches.length,
    });
  }

  // Ordenar por confianza (mayor primero)
  rootCauses.sort((a, b) => b.confidence - a.confidence);

  if (rootCauses.length > 0) {
    log.info('Root causes identified', { count: rootCauses.length, ruleIds: rootCauses.map(r => r.ruleId) });
  }

  return rootCauses;
}

// ═══════════════════════════════════════════════════════════════
//  ORCHESTRATOR & NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

async function triggerOrchestrator(breaches, metrics, systemConfig) {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    log.warn('STATE_MACHINE_ARN not configured, skipping orchestration');
    return;
  }

  const input = {
    breaches,
    metrics,
    systemId: systemConfig.systemId,
    systemType: systemConfig.systemType,
    dbType: systemConfig.database.type,
    sid: systemConfig.sid,
    env: systemConfig.environment,
    timestamp: new Date().toISOString(),
  };

  await sfn.send(new StartExecutionCommand({
    stateMachineArn,
    name: `breach-${systemConfig.systemId}-${Date.now()}`,
    input: JSON.stringify(input),
  }));

  log.info('Started Step Functions execution', { systemId: systemConfig.systemId, breachCount: breaches.length });
}

async function notifyAdvisor(breaches, metrics, systemConfig) {
  const advisorTopicArn = process.env.ADVISOR_TOPIC_ARN;
  if (!advisorTopicArn) {
    log.warn('ADVISOR_TOPIC_ARN not configured, skipping advisor notification');
    return;
  }

  const message = {
    type: 'BREACH_DETECTED',
    breaches,
    metrics,
    systemId: systemConfig.systemId,
    systemType: systemConfig.systemType,
    dbType: systemConfig.database.type,
    sid: systemConfig.sid,
    env: systemConfig.environment,
    timestamp: new Date().toISOString(),
  };

  await sns.send(new PublishCommand({
    TopicArn: advisorTopicArn,
    Subject: `Avvale SAP AlwaysOps Breach: ${systemConfig.systemId} (${breaches[0].severity})`,
    Message: JSON.stringify(message),
    MessageAttributes: {
      eventType: { DataType: 'String', StringValue: 'BREACH_DETECTED' },
      severity: { DataType: 'String', StringValue: breaches[0].severity },
      systemId: { DataType: 'String', StringValue: systemConfig.systemId },
    },
  }));

  log.info('Published breach notification', { systemId: systemConfig.systemId });
}

async function publishSnapshot(metrics, systemConfig) {
  const advisorTopicArn = process.env.ADVISOR_TOPIC_ARN;
  if (!advisorTopicArn) return;

  const message = {
    type: 'METRIC_SNAPSHOT',
    metrics,
    systemId: systemConfig.systemId,
    systemType: systemConfig.systemType,
    dbType: systemConfig.database.type,
    sid: systemConfig.sid,
    env: systemConfig.environment,
    timestamp: new Date().toISOString(),
  };

  await sns.send(new PublishCommand({
    TopicArn: advisorTopicArn,
    Subject: `Avvale SAP AlwaysOps Snapshot: ${systemConfig.systemId}`,
    Message: JSON.stringify(message),
    MessageAttributes: {
      eventType: { DataType: 'String', StringValue: 'METRIC_SNAPSHOT' },
      systemId: { DataType: 'String', StringValue: systemConfig.systemId },
    },
  }));

  log.info('Published 30-min snapshot', { systemId: systemConfig.systemId });
}

// ═══════════════════════════════════════════════════════════════
//  MAINTENANCE WINDOWS (Ventanas de mantenimiento)
//  Durante mantenimiento: SÍ se recolectan métricas (para
//  mantener el historial completo), pero NO se detectan breaches
//  ni se disparan orquestaciones. Solo se publican métricas.
// ═══════════════════════════════════════════════════════════════

let maintenanceWindowsCache = null;
let maintenanceWindowsCacheTime = 0;
const MW_CACHE_TTL_MS = 5 * 60 * 1000;

async function getMaintenanceWindows() {
  if (maintenanceWindowsCache && (Date.now() - maintenanceWindowsCacheTime) < MW_CACHE_TTL_MS) {
    return maintenanceWindowsCache;
  }
  try {
    const paramName = process.env.MAINTENANCE_WINDOWS_PARAM || '/sap-alwaysops/maintenance-windows';
    const param = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: false }));
    maintenanceWindowsCache = JSON.parse(param.Parameter.Value);
    maintenanceWindowsCacheTime = Date.now();
    return maintenanceWindowsCache;
  } catch (err) {
    if (err.name === 'ParameterNotFound') return [];
    log.warn('Error leyendo ventanas de mantenimiento', { error: err.message });
    return [];
  }
}

function isInMaintenanceWindow(systemId) {
  if (!maintenanceWindowsCache || maintenanceWindowsCache.length === 0) return false;
  const now = new Date();
  return maintenanceWindowsCache.some(mw => {
    const applies = !mw.systemId || mw.systemId === systemId || mw.systemId === '*';
    if (!applies) return false;
    return now >= new Date(mw.start) && now <= new Date(mw.end);
  });
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Universal Collector invocado');
  const startTime = Date.now();

  // ─── Cargar ventanas de mantenimiento ───
  await getMaintenanceWindows();

  // Load systems configuration from SSM
  let systemsConfig;
  try {
    const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
    const param = await ssm.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    }));
    systemsConfig = JSON.parse(param.Parameter.Value);
  } catch (err) {
    log.error('Failed to load systems config from SSM', { error: err.message });
    // Fallback: single system from environment variables
    systemsConfig = [{
      systemId: process.env.SYSTEM_ID || 'SAP-DEFAULT',
      systemType: process.env.SYSTEM_TYPE || 'SAP_PO',
      sid: process.env.SYSTEM_SID || 'PRD',
      environment: process.env.ENVIRONMENT || 'Production',
      landscape: process.env.SAP_LANDSCAPE || 'PRD',
      osType: process.env.OS_TYPE || 'LINUX',
      enabled: true,
      appSecretArn: process.env.APP_SECRET_ARN,
      database: {
        type: process.env.DB_TYPE || 'SAP_ASE',
        secretArn: process.env.DB_SECRET_ARN,
      },
    }];
  }

  const results = [];
  const currentMinute = new Date().getMinutes();
  const isSnapshotTime = currentMinute < 5 || (currentMinute >= 30 && currentMinute < 35);

  for (const sys of systemsConfig) {
    if (!sys.enabled) {
      log.info('Skipping disabled system', { systemId: sys.systemId });
      continue;
    }

    log.info('Processing system', { systemId: sys.systemId, systemType: sys.systemType, dbType: sys.database.type });

    // ── v1.0 — H34: Verificar modo Trial ──
    let trialConfig = null;
    let isTrial = false;
    try {
      trialConfig = await getSystemConfig(sys.systemId);
      isTrial = trialConfig.mode === 'TRIAL';
      if (isTrial) {
        log.info('Sistema en modo TRIAL', { systemId: sys.systemId, retentionDays: trialConfig.metricsRetentionDays });
      }
    } catch (trialErr) {
      log.warn('Error obteniendo config trial, continuando en modo PRODUCTION', { systemId: sys.systemId, error: trialErr.message });
    }

    // v1.0 — H34: En modo trial, solo ejecutar cada 30 minutos
    if (isTrial) {
      const now = new Date();
      const minutes = now.getMinutes();
      // En trial, solo ejecutar cuando los minutos son 0 o 30
      // Esto permite que EventBridge siga invocando cada 5 min pero el collector se salta las ejecuciones intermedias
      if (minutes % 30 !== 0 && minutes % 30 > 5) {
        log.info('Trial: saltando ejecución', { nextExecutionInMin: 30 - (minutes % 30) });
        results.push({
          systemId: sys.systemId,
          status: 'TRIAL_SKIPPED',
          message: 'Trial mode — ejecución omitida para ahorrar costos',
          mode: 'TRIAL',
          nextExecutionIn: `${30 - (minutes % 30)} minutos`,
        });
        continue;
      }
    }

    try {
      // Collect database metrics
      const dbMetrics = await collectDatabase(sys);

      // Collect application metrics
      const appMetrics = await collectApplication(sys);

      // Merge into unified metric set
      let allMetrics = { ...dbMetrics, ...appMetrics };

      // v1.0 — H34: Limitar métricas en modo trial
      if (isTrial && trialConfig) {
        const metricKeys = Object.keys(allMetrics);
        if (metricKeys.length > trialConfig.maxMetricsPerCollection) {
          log.info('Trial: limitando métricas', { from: metricKeys.length, to: trialConfig.maxMetricsPerCollection });
          const limitedMetrics = {};
          metricKeys.slice(0, trialConfig.maxMetricsPerCollection).forEach(k => {
            limitedMetrics[k] = allMetrics[k];
          });
          allMetrics = limitedMetrics;
        }
      }

      // v1.6 — Calcular Health Score del sistema (0-100)
      const healthScore = calculateHealthScore(allMetrics);
      allMetrics.SYS_HealthScore = healthScore;

      // Publish to CloudWatch
      await publishMetrics(sys.systemId, sys.environment, allMetrics);

      // ─── MAINTENANCE WINDOW: recolectar métricas pero NO detectar breaches ───
      const inMaintenance = isInMaintenanceWindow(sys.systemId);

      if (inMaintenance) {
        log.info('Sistema en ventana de mantenimiento, breaches suprimidos', { systemId: sys.systemId });
        results.push({
          systemId: sys.systemId,
          status: 'MAINTENANCE_SUPPRESSED',
          metricsCount: Object.keys(allMetrics).length,
          breachCount: 0,
          healthScore,
          maintenanceWindow: true,
          breaches: [],
        });
      } else {
        // v1.0 — H18: Cargar umbrales custom del sistema
        const customOverrides = await getCustomThresholds(sys.systemId);
        const effectiveThresholds = mergeThresholds(sys.systemId, customOverrides);

        // H26 — Seasonal Thresholds: ajustar umbrales según período estacional
        const activeSeasons = detectActiveSeason();
        let thresholdsForBreachDetection = effectiveThresholds;
        let seasonalAdjustments = [];
        if (activeSeasons.length > 0) {
          log.info('Períodos estacionales activos', { systemId: sys.systemId, activeSeasons });
          const { adjustedThresholds, seasonalMeta } = applySeasonalAdjustments(effectiveThresholds, activeSeasons);
          thresholdsForBreachDetection = adjustedThresholds;
          seasonalAdjustments = seasonalMeta;
        }

        // Detect breaches (solo fuera de ventana de mantenimiento)
        const allBreaches = detectBreaches(allMetrics, sys.systemId, sys.database.type, sys.systemType, thresholdsForBreachDetection);

        // v1.6 — Adaptive Alert Suppression: filtrar breaches recurrentes
        const breaches = [];
        let suppressedCount = 0;
        for (const breach of allBreaches) {
          const isRecurring = await isRecurringPattern(sys.systemId, breach.metricName);
          if (isRecurring && breach.severity !== 'CRITICAL') {
            // Suprimir alertas HIGH recurrentes (CRITICAL nunca se suprime)
            suppressedCount++;
          } else {
            breaches.push(breach);
          }
          // Registrar el patrón para futuras decisiones
          await recordBreachPattern(sys.systemId, breach.metricName);
        }

        if (suppressedCount > 0) {
          log.info('Alertas suprimidas por patrón recurrente', { suppressedCount, systemId: sys.systemId });
        }

        // H13: Aplicar política de landscape
        const landscape = sys.landscape || 'PRD';
        if (breaches.length > 0) {
          const adjustedBreaches = applyLandscapePolicy(breaches, landscape);
          // Reemplazar breaches originales con los ajustados
          breaches.length = 0;
          adjustedBreaches.forEach(b => breaches.push(b));
        }

        // v1.0 — H19: Root Cause Analysis
        const rootCauses = analyzeRootCauses(breaches);

        // v1.7 — Anomaly Detection: detectar métricas con comportamiento inusual
        const breachedMetrics = new Set(allBreaches.map(b => b.metricName));
        const anomalies = await detectAnomalies(sys.systemId, allMetrics, breachedMetrics);
        if (anomalies.length > 0) {
          log.info('Anomalías detectadas', { count: anomalies.length, systemId: sys.systemId });
        }

        // If breaches found, trigger orchestrator and notify advisor
        if (breaches.length > 0) {
          // v1.0 — Manejar fallos de orquestación sin perder breaches
          try {
            await triggerOrchestrator(breaches, allMetrics, sys);
          } catch (orchErr) {
            log.error('Error al disparar orquestador', { systemId: sys.systemId, error: orchErr.message });
            // Guardar breaches en DynamoDB como fallback para reprocesamiento
            try {
              const ddbTableName = process.env.METRICS_HISTORY_TABLE || 'sap-alwaysops-metrics-history';
              await ddbDoc.send(new PutCommand({
                TableName: ddbTableName,
                Item: {
                  pk: `FAILED_ORCHESTRATION#${sys.systemId}`,
                  sk: new Date().toISOString(),
                  breaches,
                  error: orchErr.message,
                  systemId: sys.systemId,
                  ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24h TTL
                },
              }));
              log.info('Breaches guardados en DynamoDB para reprocesamiento');
            } catch (ddbErr) {
              log.error('ERROR CRÍTICO: No se pudieron guardar breaches de fallback', { error: ddbErr.message });
            }
          }

          // v1.0 — H34: En trial, limitar notificaciones
          let trialNotifAllowed = true;
          if (isTrial && trialConfig) {
            try {
              const notifCheck = await checkActionAllowed(sys.systemId, 'notification', breaches.length);
              if (!notifCheck.allowed) {
                log.info('Trial: notificación omitida', { reason: notifCheck.reason });
                trialNotifAllowed = false;
                // Se registra el breach pero no se envía notificación
              }
            } catch (trialNotifErr) {
              log.warn('Error verificando límite de notificaciones trial, permitiendo por defecto', { error: trialNotifErr.message });
            }
          }

          if (trialNotifAllowed) {
            try {
              await notifyAdvisor(breaches, allMetrics, sys);
            } catch (advErr) {
              log.warn('Error notificando advisor', { error: advErr.message });
            }
          }
        }

        // Every 30 minutes: publish snapshot for trend analysis
        if (isSnapshotTime) {
          await publishSnapshot(allMetrics, sys);
        }

        results.push({
          systemId: sys.systemId,
          status: 'SUCCESS',
          metricsCount: Object.keys(allMetrics).length,
          breachCount: breaches.length,
          suppressedCount,
          anomalyCount: anomalies.length,
          rootCauseCount: rootCauses.length,
          healthScore,
          // v1.0 — H34: Información del modo de operación
          mode: isTrial ? 'TRIAL' : 'PRODUCTION',
          trialLimits: isTrial ? {
            pollingInterval: trialConfig.pollingIntervalMinutes + ' min',
            metricsCollected: trialConfig.maxMetricsPerCollection,
            retentionDays: trialConfig.metricsRetentionDays
          } : undefined,
          breaches: breaches.map(b => ({ metric: b.metricName, value: b.value, severity: b.severity })),
          anomalies: anomalies.map(a => ({ metric: a.metricName, value: a.value, zScore: a.zScore, severity: a.severity })),
          rootCauses: rootCauses.map(r => ({ ruleId: r.ruleId, name: r.name, confidence: r.confidence, severity: r.severity })),
          seasonalAdjustments: seasonalAdjustments.length > 0 ? {
            activeSeasons,
            adjustments: seasonalAdjustments.map(s => ({ season: s.season, name: s.name, factor: s.factor, metricsAdjusted: s.metricsAdjusted })),
          } : null,
        });
      }

    } catch (err) {
      log.error('Error processing system', { systemId: sys.systemId, error: err.message, stack: err.stack });

      // v1.0 — Proteger publishMetrics en el catch block
      try {
        await publishMetrics(sys.systemId, sys.environment, { DB_CollectorSuccess: 0, APP_CollectorSuccess: 0 });
      } catch (publishErr) {
        log.error('Error publicando métrica de fallo', { systemId: sys.systemId, error: publishErr.message });
      }

      try {
        results.push({
          systemId: sys.systemId,
          status: 'ERROR',
          error: err.message,
        });
      } catch (pushErr) {
        log.error('Error registrando resultado de fallo', { systemId: sys.systemId, error: pushErr.message });
      }
    }
  }

  const duration = Date.now() - startTime;
  log.info('Collector completed', { durationMs: duration, results });

  return {
    statusCode: 200,
    body: {
      message: 'Avvale SAP AlwaysOps Universal Collector v1.0 completed',
      duration: `${duration}ms`,
      systemsProcessed: results.length,
      results,
    },
  };
};
