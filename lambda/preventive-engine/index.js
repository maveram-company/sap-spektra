'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Preventive Engine
//  Motor preventivo que analiza tendencias y predice breaches.
//
//  ¿Qué hace este Lambda?
//  Se ejecuta cada 30 minutos via CloudWatch Events (EventBridge).
//  Lee las métricas recientes de CloudWatch, calcula la tendencia
//  usando regresión lineal, y predice si alguna métrica va a
//  superar su umbral en los próximos 60 minutos. Si la predicción
//  es preocupante, dispara acciones preventivas automáticamente
//  (solo para métricas seguras) o envía alertas tempranas.
// ═══════════════════════════════════════════════════════════════

const { CloudWatchClient, GetMetricStatisticsCommand, GetMetricDataCommand, PutMetricDataCommand, DescribeAlarmsCommand } = require('@aws-sdk/client-cloudwatch');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const log = require('../utilidades/logger')('preventive-engine');

// Clientes de AWS
const cw = new CloudWatchClient({});
const ssm = new SSMClient({});
const sfn = new SFNClient({});
const sns = new SNSClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ─── Deduplicación: no alertar la misma predicción cada 30 min ───
const DEDUP_TABLE = process.env.METRICS_HISTORY_TABLE || 'sap-alwaysops-metrics-history';
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hora: no re-alertar la misma métrica

async function shouldAlert(systemId, metricName) {
  const dedupKey = `PREVENTIVE_DEDUP#${systemId}#${metricName}`;
  try {
    const result = await ddbDoc.send(new GetCommand({
      TableName: DEDUP_TABLE,
      Key: { pk: dedupKey, sk: 'LATEST' },
    }));
    const lastAlert = result.Item?.timestamp;
    if (lastAlert && (Date.now() - new Date(lastAlert).getTime()) < DEDUP_WINDOW_MS) {
      return false; // Ya alertamos recientemente
    }
  } catch (err) { /* Si falla, alertar de todos modos */ }

  // Marcar como alertado
  try {
    const ttl = Math.floor(Date.now() / 1000) + 2 * 60 * 60; // 2 horas TTL
    await ddbDoc.send(new PutCommand({
      TableName: DEDUP_TABLE,
      Item: { pk: dedupKey, sk: 'LATEST', timestamp: new Date().toISOString(), systemId, metricName, ttl },
    }));
  } catch (err) { /* no-op */ }
  return true;
}

// Configuración
const NAMESPACE = process.env.CW_NAMESPACE || 'SAPAlwaysOps';
const PREDICTION_WINDOW_MIN = parseInt(process.env.PREDICTION_WINDOW_MINUTES || '60');
const LOOKBACK_DATAPOINTS = parseInt(process.env.LOOKBACK_DATAPOINTS || '6');
const LOOKBACK_MINUTES = LOOKBACK_DATAPOINTS * 5; // Cada datapoint = 5 minutos

// ═══════════════════════════════════════════════════════════════
//  MAINTENANCE WINDOWS (Ventanas de mantenimiento)
//  Durante mantenimiento: se recolectan métricas pero NO se
//  generan predicciones ni alertas. Evita falsos positivos.
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
//  v1.7 — SMART MAINTENANCE WINDOWS
//  Aprende de patrones históricos de alertas suprimidas para
//  sugerir ventanas de mantenimiento automáticas. Consulta la
//  tabla ALERT_PATTERN de universal-collector para encontrar
//  horarios recurrentes con muchos breaches HIGH.
// ═══════════════════════════════════════════════════════════════

async function detectSmartMaintenanceWindows(systemId) {
  try {
    // Consultar TODOS los patrones de alerta del sistema (una fila por métrica)
    // Universal-collector escribe: pk=ALERT_PATTERN#SYS, sk=metricName, hourCounts={h: count}
    const result = await ddbDoc.send(new QueryCommand({
      TableName: DEDUP_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `ALERT_PATTERN#${systemId}` },
    }));

    const items = result.Items || [];
    if (items.length === 0) return null;

    // Agregar hourCounts de todas las métricas en un mapa global
    const globalHourCounts = {};
    for (const item of items) {
      if (!item.hourCounts) continue;
      for (const [hour, count] of Object.entries(item.hourCounts)) {
        globalHourCounts[hour] = (globalHourCounts[hour] || 0) + count;
      }
    }

    const suggestions = [];

    // Buscar franjas horarias con >= 5 alertas recurrentes (patrón fuerte)
    for (const [hour, count] of Object.entries(globalHourCounts)) {
      if (count >= 5) {
        const h = parseInt(hour);
        suggestions.push({
          utcHour: h,
          localDescription: `${String(h).padStart(2, '0')}:00-${String((h + 1) % 24).padStart(2, '0')}:00 UTC`,
          alertCount: count,
          confidence: count >= 10 ? 'ALTA' : 'MEDIA',
        });
      }
    }

    if (suggestions.length === 0) return null;

    return {
      systemId,
      suggestedWindows: suggestions.sort((a, b) => b.alertCount - a.alertCount),
      learnedFrom: 'ALERT_PATTERN analysis',
      metricsAnalyzed: items.length,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    // Si no hay datos aún, retornar null silenciosamente
    return null;
  }
}

async function publishSmartWindowSuggestions(suggestions) {
  if (!suggestions || suggestions.suggestedWindows.length === 0) return;

  const topicArn = process.env.ALERTS_TOPIC_ARN;
  if (!topicArn) return;

  const windowsList = suggestions.suggestedWindows
    .map(w => `  - ${w.localDescription} (${w.alertCount} alertas, confianza: ${w.confidence})`)
    .join('\n');

  const message = `[Avvale SAP AlwaysOps] Sugerencia de Ventana de Mantenimiento

Sistema: ${suggestions.systemId}

Basado en el análisis de patrones de alertas recurrentes, se sugieren las siguientes ventanas de mantenimiento:

${windowsList}

Estas franjas horarias muestran alertas HIGH recurrentes que probablemente corresponden a procesos batch o mantenimiento programado.

Para configurar: actualice el parámetro SSM /sap-alwaysops/maintenance-windows`;

  try {
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: `[AlwaysOps] Ventana de mantenimiento sugerida: ${suggestions.systemId}`,
      Message: message,
    }));
  } catch (err) {
    log.warn('Error publicando sugerencia de ventana inteligente', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  CORRELACIÓN DE MÉTRICAS
//  Detecta patrones multi-métrica que indican problemas complejos.
//  Cada patrón combina 2-3 métricas para generar una alerta
//  más inteligente y específica que las alertas individuales.
// ═══════════════════════════════════════════════════════════════

const CORRELATION_PATTERNS = [
  {
    id: 'MEMORY_LEAK',
    name: 'Memory Leak Detectado',
    description: 'Heap alto + GC overhead alto + OldGen creciendo indica fuga de memoria',
    metrics: ['APP_JVM_HeapPct', 'APP_JVM_GCOverheadPct', 'APP_JVM_OldGenPct'],
    // Función que evalúa si el patrón coincide con los datos actuales
    evaluate: (values, trends) => {
      const heapHigh = values.APP_JVM_HeapPct > 75;
      const gcHigh = values.APP_JVM_GCOverheadPct > 8;
      const oldGenRising = trends.APP_JVM_OldGenPct?.slope > 0.5;
      return heapHigh && gcHigh && oldGenRising;
    },
    severity: 'CRITICAL',
    recommendation: 'Posible memory leak. Revisar heap dump, verificar conexiones DB no cerradas, y considerar reinicio planificado del JVM.',
    runbook: 'RB-JVM-001',
  },
  {
    id: 'DEADLOCK_PROBABLE',
    name: 'Deadlock Probable',
    description: 'Cadenas de bloqueo + transacciones viejas indica posible deadlock en la DB',
    metrics: ['DB_ASE_BlockingChains', 'DB_ASE_OldestTxMin'],
    evaluate: (values) => {
      return values.DB_ASE_BlockingChains >= 1 && values.DB_ASE_OldestTxMin > 20;
    },
    severity: 'CRITICAL',
    recommendation: 'Deadlock probable. Revisar sp_who2, identificar SPIDs bloqueadores, y escalar a DBA si persiste más de 30 minutos.',
    runbook: 'RB-ASE-001',
  },
  {
    id: 'LOG_RUNAWAY',
    name: 'Log Runaway',
    description: 'Disco de log llenándose rápido + crecimiento acelerado del log indica transacción fuera de control',
    metrics: ['DB_ASE_LogFullPct', 'DB_ASE_LogGrowthPctPerHr'],
    evaluate: (values, trends) => {
      const logHigh = values.DB_ASE_LogFullPct > 70;
      const growthFast = values.DB_ASE_LogGrowthPctPerHr > 5;
      const logRising = trends.DB_ASE_LogFullPct?.slope > 1;
      return logHigh && (growthFast || logRising);
    },
    severity: 'HIGH',
    recommendation: 'Log creciendo fuera de control. Ejecutar dump tran urgente y buscar transacciones abiertas que estén generando log excesivo.',
    runbook: 'RB-ASE-001',
  },
  {
    id: 'DISK_PRESSURE_COMBINED',
    name: 'Presión de Disco Combinada',
    description: 'Disco HANA y memoria subiendo juntos indica carga excesiva',
    metrics: ['DB_HANA_DiskPct', 'DB_HANA_MemPct'],
    evaluate: (values, trends) => {
      const diskHigh = values.DB_HANA_DiskPct > 80;
      const memHigh = values.DB_HANA_MemPct > 75;
      const diskRising = trends.DB_HANA_DiskPct?.slope > 0.3;
      return diskHigh && memHigh && diskRising;
    },
    severity: 'HIGH',
    recommendation: 'HANA bajo presión de disco Y memoria. Reclamar datavolume primero, considerar expansión de disco si persiste.',
    runbook: 'RB-HANA-001',
  },
  {
    id: 'PO_CHANNEL_STORM',
    name: 'Tormenta de Canales PO',
    description: 'Muchos mensajes fallidos + mensajes atascados indica problema sistémico en PO',
    metrics: ['APP_PO_FailedMessages', 'APP_PO_StuckMessages'],
    evaluate: (values) => {
      return values.APP_PO_FailedMessages > 8 && values.APP_PO_StuckMessages > 3;
    },
    severity: 'HIGH',
    recommendation: 'Múltiples canales PO fallando simultáneamente. Verificar conectividad con sistemas backend, revisar logs de Adapter Framework.',
    runbook: 'RB-PO-001',
  },
  {
    id: 'THREAD_EXHAUSTION',
    name: 'Agotamiento de Threads',
    description: 'Pool de threads alto + conexiones ICM altas indica saturación del servidor',
    metrics: ['APP_ThreadPoolPct', 'APP_ICM_ConnectionsPct'],
    evaluate: (values, trends) => {
      const threadHigh = values.APP_ThreadPoolPct > 75;
      const icmHigh = values.APP_ICM_ConnectionsPct > 70;
      const threadRising = trends.APP_ThreadPoolPct?.slope > 0.5;
      return threadHigh && icmHigh && threadRising;
    },
    severity: 'HIGH',
    recommendation: 'Servidor SAP saturándose. Verificar si hay procesos batch pesados corriendo, considerar reinicio de work processes.',
    runbook: 'RB-JVM-001',
  },
  // v1.0 — Nuevos patrones de correlación
  {
    id: 'WP_PRESSURE',
    name: 'Presión de Work Processes',
    description: 'WPs en PRIV + pocos WPs DIA libres indica agotamiento inminente de work processes',
    metrics: ['APP_ABAP_PrivModeWP', 'APP_ABAP_FreeDiaWP'],
    evaluate: (values) => {
      const privExists = values.APP_ABAP_PrivModeWP >= 1;
      const fewFree = values.APP_ABAP_FreeDiaWP < 5;
      return privExists && fewFree;
    },
    severity: 'CRITICAL',
    recommendation: 'Work Processes bajo presión: hay WPs retenidos en PRIV mode y quedan pocos DIA libres. Ejecutar ABAPCleanOldSessions y verificar SM50. Si persiste, considerar reinicio de la instancia.',
    runbook: 'RB-WP-001',
  },
  {
    id: 'RFC_STORM',
    name: 'Tormenta RFC',
    description: 'Colas RFC + tRFC altas simultáneamente indica problema de conectividad con sistemas remotos',
    metrics: ['APP_ABAP_RFCQueueDepth', 'APP_ABAP_TRFCQueueDepth'],
    evaluate: (values) => {
      return values.APP_ABAP_RFCQueueDepth > 80 && values.APP_ABAP_TRFCQueueDepth > 30;
    },
    severity: 'HIGH',
    recommendation: 'Acumulación en colas RFC y tRFC. Verificar conectividad con sistemas remotos (SM59), revisar schedulers en SMQS y SMQR, y verificar si hay destinos RFC caídos.',
    runbook: 'RB-RFC-001',
  },
  {
    id: 'HOUSEKEEPING_DEBT',
    name: 'Deuda de Housekeeping',
    description: 'Spool alto + TEMSE alto + logs SM21 altos indica falta de mantenimiento preventivo',
    metrics: ['APP_ABAP_OldSpoolJobs', 'APP_ABAP_TEMSEObjects', 'APP_ABAP_SM21OldLogs'],
    evaluate: (values) => {
      const spoolHigh = values.APP_ABAP_OldSpoolJobs > 400;
      const temseHigh = values.APP_ABAP_TEMSEObjects > 800;
      const logsHigh = values.APP_ABAP_SM21OldLogs > 800;
      return (spoolHigh && temseHigh) || (spoolHigh && logsHigh) || (temseHigh && logsHigh);
    },
    severity: 'HIGH',
    recommendation: 'Múltiples indicadores de falta de housekeeping. Ejecutar limpieza de spool (RSPO0041), reorganizar SM21 (RSSYSLGD), y limpiar TEMSE huérfanos (RSPO1043).',
    runbook: 'RB-HOUSE-001',
  },
  {
    id: 'TRANSPORT_LOCKOUT',
    name: 'Bloqueo de Transportes',
    description: 'Transportes atorados + transportes fallidos indica problema en el pipeline de despliegue',
    metrics: ['APP_ABAP_StuckTransports', 'APP_ABAP_FailedTransports'],
    evaluate: (values) => {
      return values.APP_ABAP_StuckTransports >= 2 && values.APP_ABAP_FailedTransports >= 1;
    },
    severity: 'HIGH',
    recommendation: 'Pipeline de transportes bloqueado. Verificar STMS cola de importación, revisar tp logs en /usr/sap/trans/log/, y verificar conectividad entre sistemas del landscape.',
    runbook: 'RB-TRANS-001',
  },
];

async function evaluateCorrelations(systemId) {
  const correlationAlerts = [];

  // Recolectar valores actuales y tendencias de todas las métricas usadas en patrones
  const allMetrics = new Set();
  CORRELATION_PATTERNS.forEach(p => p.metrics.forEach(m => allMetrics.add(m)));

  const values = {};
  const trends = {};

  for (const metricName of allMetrics) {
    const datapoints = await getRecentMetrics(systemId, metricName);
    if (datapoints.length === 0) continue;
    const trend = calculateTrend(datapoints);
    values[metricName] = trend.currentValue;
    trends[metricName] = trend;
  }

  // Evaluar cada patrón de correlación
  for (const pattern of CORRELATION_PATTERNS) {
    // Verificar que tenemos datos para todas las métricas del patrón
    const hasAllMetrics = pattern.metrics.every(m => values[m] !== undefined);
    if (!hasAllMetrics) continue;

    try {
      const matches = pattern.evaluate(values, trends);
      if (matches) {
        // Verificar deduplicación
        const isNew = await shouldAlert(systemId, `CORR_${pattern.id}`);
        if (!isNew) {
          log.info('Patrón de correlación ya alertado recientemente', { patternId: pattern.id, systemId });
          continue;
        }

        correlationAlerts.push({
          correlationId: pattern.id,
          name: pattern.name,
          description: pattern.description,
          severity: pattern.severity,
          recommendation: pattern.recommendation,
          runbook: pattern.runbook,
          metricsInvolved: pattern.metrics.map(m => ({ metric: m, value: values[m], slope: trends[m]?.slope })),
          timestamp: new Date().toISOString(),
        });

        log.info('Patrón de correlación detectado', { patternId: pattern.id, systemId });
      }
    } catch (err) {
      log.warn('Error evaluando patrón de correlación', { patternId: pattern.id, error: err.message });
    }
  }

  return correlationAlerts;
}

async function publishCorrelationAlerts(correlations, systemId) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn || correlations.length === 0) return;

  const message = {
    type: 'CORRELATION_ALERT',
    systemId,
    correlations,
    timestamp: new Date().toISOString(),
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: alertsTopicArn,
      Subject: `Avvale SAP AlwaysOps Correlación: ${systemId} (${correlations.length} patrones detectados)`,
      Message: JSON.stringify(message),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'CORRELATION_ALERT' },
        systemId: { DataType: 'String', StringValue: systemId },
      },
    }));
    log.info('Alerta de correlación publicada', { systemId });
  } catch (err) {
    log.warn('Error publicando alerta de correlación', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  UMBRALES (mismos que usa el universal-collector)
//  Necesitamos conocer los umbrales para predecir cuándo se
//  van a superar. También necesitamos saber qué es costSafe
//  para decidir si actuar automáticamente o solo alertar.
// ═══════════════════════════════════════════════════════════════

const THRESHOLDS = {
  // ASE — valores corregidos según documento de arquitectura
  DB_ASE_LogFullPct:         { HIGH: 80,  CRITICAL: 90,  runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_PhysLogPct:         { HIGH: 85,  CRITICAL: 95,  runbook: 'RB-ASE-002', costSafe: false, requiresApproval: true  },
  DB_ASE_PhysDataPct:        { HIGH: 88,  CRITICAL: 95,  runbook: 'RB-ASE-002', costSafe: false, requiresApproval: true  },
  DB_ASE_LogLastDumpMin:     { HIGH: 120, CRITICAL: 240, runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_OldestTxMin:        { HIGH: 30,  CRITICAL: 60,  runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_BlockingChains:     { HIGH: 1,   CRITICAL: 3,   runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_DiskScenario:       { HIGH: 0.5, CRITICAL: 2.5, runbook: 'RB-ASE-003', costSafe: false, requiresApproval: true  },
  DB_ASE_LogGrowthPctPerHr:  { HIGH: 3,   CRITICAL: 8,   runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_ASE_CacheHitRatio:      { HIGH_BELOW: 80, CRITICAL_BELOW: 60, runbook: 'RB-ASE-001', costSafe: true, requiresApproval: false, inverted: true },
  // HANA
  DB_HANA_MemPct:            { HIGH: 80,  CRITICAL: 90,  runbook: 'RB-HANA-001', costSafe: true,  requiresApproval: false },
  DB_HANA_DiskPct:           { HIGH: 85,  CRITICAL: 95,  runbook: 'RB-HANA-002', costSafe: false, requiresApproval: true  },
  DB_HANA_ReplicationLag:    { HIGH: 300, CRITICAL: 600, runbook: 'RB-HA-001',   costSafe: true,  requiresApproval: false },
  // Oracle
  DB_ORA_TablespacePct:      { HIGH: 85,  CRITICAL: 95,  runbook: 'RB-HANA-002', costSafe: false, requiresApproval: true  },
  DB_ORA_BlockedSessions:    { HIGH: 5,   CRITICAL: 15,  runbook: 'RB-ABAP-001', costSafe: true,  requiresApproval: false },
  // MSSQL
  DB_MSSQL_LogPct:           { HIGH: 80,  CRITICAL: 90,  runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  DB_MSSQL_DataPct:          { HIGH: 85,  CRITICAL: 95,  runbook: 'RB-ASE-002', costSafe: false, requiresApproval: true  },
  // DB2
  DB_DB2_TablespacePct:      { HIGH: 85,  CRITICAL: 95,  runbook: 'RB-HANA-002', costSafe: false, requiresApproval: true  },
  DB_DB2_LogPct:             { HIGH: 80,  CRITICAL: 90,  runbook: 'RB-ASE-001', costSafe: true,  requiresApproval: false },
  // MaxDB — v1.9
  DB_MAXDB_DataVolPct:      { HIGH: 85,  CRITICAL: 95,  runbook: 'RB-MAXDB-002', costSafe: false, requiresApproval: true  },
  DB_MAXDB_LogVolPct:       { HIGH: 80,  CRITICAL: 90,  runbook: 'RB-MAXDB-001', costSafe: true,  requiresApproval: false },
  DB_MAXDB_DataCacheHitPct: { HIGH_BELOW: 80, CRITICAL_BELOW: 60, runbook: 'RB-MAXDB-001', costSafe: true, requiresApproval: false, inverted: true },
  DB_MAXDB_LockWaitPct:     { HIGH: 5,   CRITICAL: 15,  runbook: 'RB-MAXDB-001', costSafe: true,  requiresApproval: false },
  // Aplicación — valores corregidos según documento
  APP_JVM_HeapPct:           { HIGH: 82,  CRITICAL: 92,  runbook: 'RB-JVM-001',  costSafe: true,  requiresApproval: false },
  APP_JVM_OldGenPct:         { HIGH: 75,  CRITICAL: 85,  runbook: 'RB-JVM-002',  costSafe: true,  requiresApproval: false },
  APP_JVM_GCOverheadPct:     { HIGH: 10,  CRITICAL: 25,  runbook: 'RB-JVM-001',  costSafe: true,  requiresApproval: false },
  APP_ThreadPoolPct:         { HIGH: 80,  CRITICAL: 95,  runbook: 'RB-JVM-001',  costSafe: true,  requiresApproval: false },
  APP_ICM_ConnectionsPct:    { HIGH: 80,  CRITICAL: 95,  runbook: 'RB-JVM-001',  costSafe: true,  requiresApproval: false },
  APP_PO_FailedMessages:     { HIGH: 10,  CRITICAL: 50,  runbook: 'RB-PO-001',   costSafe: true,  requiresApproval: false },
  APP_PO_StuckMessages:      { HIGH: 5,   CRITICAL: 20,  runbook: 'RB-PO-001',   costSafe: true,  requiresApproval: false },
  APP_ABAP_FreeDiaWP:        { HIGH_BELOW: 5, CRITICAL_BELOW: 3, runbook: 'RB-ABAP-001', costSafe: true, requiresApproval: false, inverted: true },
  APP_ABAP_ShortDumps24h:    { HIGH: 50,  CRITICAL: 200, runbook: 'RB-ABAP-001', costSafe: true,  requiresApproval: false },
  // v1.0 — Verificación de backups (todas las BD)
  DB_HANA_LastBackupMin:     { HIGH: 1440, CRITICAL: 2880, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  DB_ORA_LastBackupMin:      { HIGH: 720,  CRITICAL: 1440, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  DB_MSSQL_LastBackupMin:    { HIGH: 720,  CRITICAL: 1440, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  DB_DB2_LastBackupMin:      { HIGH: 1440, CRITICAL: 2880, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  DB_MAXDB_LastBackupMin:   { HIGH: 1440, CRITICAL: 2880, runbook: 'RB-BACKUP-001', costSafe: true, requiresApproval: false },
  // v1.0 — Expiración de certificados ICM/PSE
  APP_ICM_CertExpiryDays:    { HIGH_BELOW: 30, CRITICAL_BELOW: 7, runbook: 'RB-CERT-001', costSafe: true, requiresApproval: false, inverted: true },
  // v1.0 — Work Processes en modo PRIV/Hold
  APP_ABAP_PrivModeWP:       { HIGH: 1,  CRITICAL: 3, runbook: 'RB-WP-001', costSafe: true, requiresApproval: false },
  APP_ABAP_HoldWP:           { HIGH: 2,  CRITICAL: 5, runbook: 'RB-WP-001', costSafe: true, requiresApproval: false },
  // v1.0 — Monitoreo de colas RFC/tRFC/qRFC
  APP_ABAP_RFCQueueDepth:    { HIGH: 100, CRITICAL: 500, runbook: 'RB-RFC-001', costSafe: true, requiresApproval: false },
  APP_ABAP_TRFCQueueDepth:   { HIGH: 50,  CRITICAL: 200, runbook: 'RB-RFC-001', costSafe: true, requiresApproval: false },
  APP_ABAP_QRFCQueueDepth:   { HIGH: 50,  CRITICAL: 200, runbook: 'RB-RFC-001', costSafe: true, requiresApproval: false },
  // v1.0 — Verificación de jobs SM37
  APP_ABAP_FailedJobs24h:    { HIGH: 5,   CRITICAL: 15,  runbook: 'RB-JOB-001', costSafe: true, requiresApproval: false },
  APP_ABAP_LongRunningJobs:  { HIGH: 2,   CRITICAL: 5,   runbook: 'RB-JOB-001', costSafe: true, requiresApproval: false },
  // v1.0 — Housekeeping automático
  APP_ABAP_OldSpoolJobs:     { HIGH: 500,  CRITICAL: 2000, runbook: 'RB-HOUSE-001', costSafe: true, requiresApproval: false },
  APP_ABAP_SM21OldLogs:      { HIGH: 1000, CRITICAL: 5000, runbook: 'RB-HOUSE-001', costSafe: true, requiresApproval: false },
  APP_ABAP_TEMSEObjects:     { HIGH: 1000, CRITICAL: 5000, runbook: 'RB-HOUSE-001', costSafe: true, requiresApproval: false },
  // v1.0 — Gestión de locks SM12
  APP_ABAP_OldEnqLocks:      { HIGH: 5,   CRITICAL: 20,  runbook: 'RB-LOCK-001', costSafe: true, requiresApproval: false },
  APP_ABAP_LockWaitTimeSec:  { HIGH: 30,  CRITICAL: 120, runbook: 'RB-LOCK-001', costSafe: true, requiresApproval: false },
  // v1.0 — Monitoreo de transportes STMS
  APP_ABAP_StuckTransports:  { HIGH: 3,   CRITICAL: 10,  runbook: 'RB-TRANS-001', costSafe: true, requiresApproval: false },
  APP_ABAP_FailedTransports: { HIGH: 2,   CRITICAL: 5,   runbook: 'RB-TRANS-001', costSafe: true, requiresApproval: false },
};

// ═══════════════════════════════════════════════════════════════
//H14: CAPACITY PLANNING PREDICTIONS
//  Predice la fecha de agotamiento de métricas de capacidad
//  (disco, memoria, log) usando tendencia de 7 días.
//  Solo aplica a métricas de porcentaje que pueden llegar a 100%.
// ═══════════════════════════════════════════════════════════════

// Métricas elegibles para capacity planning (solo porcentajes que crecen)
const CAPACITY_METRICS = [
  'DB_ASE_PhysLogPct', 'DB_ASE_PhysDataPct', 'DB_ASE_LogFullPct',
  'DB_HANA_MemPct', 'DB_HANA_DiskPct',
  'DB_ORA_TablespacePct',
  'DB_MSSQL_LogPct', 'DB_MSSQL_DataPct',
  'DB_DB2_TablespacePct', 'DB_DB2_LogPct',
  'DB_MAXDB_DataVolPct', 'DB_MAXDB_LogVolPct',
  'APP_JVM_HeapPct', 'APP_JVM_OldGenPct',
  'APP_ThreadPoolPct', 'APP_ICM_ConnectionsPct',
];

// ═══════════════════════════════════════════════════════════════
//  H23: CAPACITY PLANNING — 30-Day Trend Analysis Metrics
//  Métricas de almacenamiento y memoria elegibles para análisis
//  de tendencia a 30 días con predicción de agotamiento.
//  Estas son métricas porcentuales que pueden crecer hasta 100%.
// ═══════════════════════════════════════════════════════════════
const CAPACITY_PLANNING_METRICS = [
  // ASE — uso de disco físico
  'DB_ASE_PhysLogPct',
  'DB_ASE_PhysDataPct',
  // HANA — memoria y disco
  'DB_HANA_MemPct',
  'DB_HANA_DiskPct',
  // Oracle — tablespace
  'DB_ORACLE_TbsUsedPct',
  // MSSQL — archivos de datos y log
  'DB_MSSQL_DataFilePct',
  'DB_MSSQL_LogFilePct',
  // DB2 — tablespace
  'DB_DB2_TbsUsedPct',
  // MaxDB — volúmenes de datos y log
  'DB_MAXDB_DataVolPct',
  'DB_MAXDB_LogVolPct',
  // JVM — uso de heap
  'APP_JVM_HeapPct',
];

// Calcula la fecha estimada de agotamiento (cuando llegará a 100%)
function predictExhaustionDate(datapoints) {
  if (!datapoints || datapoints.length < 6) return null; // Mínimo 6 datapoints (3 horas)

  // Usar solo los últimos 7 días de datos
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recent = datapoints
    .filter(dp => new Date(dp.Timestamp).getTime() > sevenDaysAgo)
    .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

  if (recent.length < 6) return null;

  // Regresión lineal: y = mx + b
  const n = recent.length;
  const xValues = recent.map((dp, i) => i);
  const yValues = recent.map(dp => dp.Average || dp.Maximum || 0);

  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
  const sumX2 = xValues.reduce((acc, x) => acc + x * x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Si la pendiente es negativa o cero, no hay agotamiento previsto
  if (slope <= 0) return null;

  // Calcular cuántos períodos faltan para llegar a 100%
  const currentValue = yValues[yValues.length - 1];
  if (currentValue >= 100) return { exhaustionDate: new Date().toISOString(), daysRemaining: 0, confidence: 'CRITICA' };

  const periodsToExhaustion = (100 - intercept - slope * (n - 1)) / slope;
  if (periodsToExhaustion <= 0) return null;

  // Convertir períodos a tiempo real (intervalo entre datapoints)
  const timeSpan = new Date(recent[recent.length - 1].Timestamp) - new Date(recent[0].Timestamp);
  const periodInterval = timeSpan / (n - 1);
  const msToExhaustion = periodsToExhaustion * periodInterval;
  const daysRemaining = msToExhaustion / (24 * 60 * 60 * 1000);

  // Determinar confianza basada en R² y datos disponibles
  const yMean = sumY / n;
  const ssRes = yValues.reduce((acc, y, i) => acc + Math.pow(y - (intercept + slope * i), 2), 0);
  const ssTot = yValues.reduce((acc, y) => acc + Math.pow(y - yMean, 2), 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  let confidence;
  if (rSquared > 0.8 && n >= 24) confidence = 'ALTA';
  else if (rSquared > 0.5 && n >= 12) confidence = 'MEDIA';
  else confidence = 'BAJA';

  // Solo reportar si agotamiento en <= 30 días
  if (daysRemaining > 30) return null;

  return {
    exhaustionDate: new Date(now + msToExhaustion).toISOString(),
    daysRemaining: parseFloat(daysRemaining.toFixed(1)),
    currentValue: parseFloat(currentValue.toFixed(1)),
    slope: parseFloat(slope.toFixed(4)),
    rSquared: parseFloat(rSquared.toFixed(3)),
    confidence,
    datapoints: n,
  };
}

// Ejecuta capacity planning para un sistema
async function runCapacityPlanning(systemId) {
  const predictions = [];

  for (const metricName of CAPACITY_METRICS) {
    try {
      // Reusar la función existente getRecentMetrics pero con rango de 7 días
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

      const result = await cw.send(new GetMetricStatisticsCommand({
        Namespace: NAMESPACE,
        MetricName: metricName,
        Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
        StartTime: startTime,
        EndTime: endTime,
        Period: 1800, // 30 minutos para tener suficientes puntos
        Statistics: ['Average'],
      }));

      if (!result.Datapoints || result.Datapoints.length < 6) continue;

      const prediction = predictExhaustionDate(result.Datapoints);
      if (prediction) {
        predictions.push({
          metricName,
          systemId,
          ...prediction,
        });
      }
    } catch (err) {
      // Silenciar errores individuales de métricas
      log.warn('Error analizando capacity planning', { metricName, systemId, error: err.message });
    }
  }

  return predictions;
}

// Publica predicciones de capacity planning via SNS
async function publishCapacityPlanningAlerts(predictions) {
  if (predictions.length === 0) return;

  const criticalPredictions = predictions.filter(p => p.daysRemaining <= 3);
  const warningPredictions = predictions.filter(p => p.daysRemaining > 3 && p.daysRemaining <= 14);
  const infoPredictions = predictions.filter(p => p.daysRemaining > 14);

  const message = {
    type: 'CAPACITY_PLANNING',
    timestamp: new Date().toISOString(),
    summary: {
      total: predictions.length,
      critical: criticalPredictions.length,
      warning: warningPredictions.length,
      info: infoPredictions.length,
    },
    predictions: predictions.sort((a, b) => a.daysRemaining - b.daysRemaining),
  };

  try {
    const topicArn = process.env.ALERTS_TOPIC_ARN;
    if (topicArn) {
      await sns.send(new PublishCommand({
        TopicArn: topicArn,
        Subject: `Avvale SAP AlwaysOps — Capacity Planning: ${criticalPredictions.length} críticas, ${warningPredictions.length} warnings`,
        Message: JSON.stringify(message, null, 2),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: 'CAPACITY_PLANNING' },
        },
      }));
      log.info('Predicciones de capacity planning publicadas', { count: predictions.length });
    }
  } catch (err) {
    log.error('Error publicando alertas de capacity planning', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  H23: CAPACITY PLANNING — 30-Day Trend Analysis + Depletion Prediction
//
//  Analiza tendencias a largo plazo (30 días) de métricas de
//  almacenamiento y memoria. Usa regresión lineal sobre ~8,640
//  datapoints (5 min de intervalo) para calcular la tasa de
//  crecimiento diario y predecir cuándo cada métrica alcanzará
//  los umbrales de 85%, 95% y 100%.
//
//  Severidad:
//   - CRITICAL: agotamiento en <= 7 días
//   - WARNING:  agotamiento en <= 30 días
//   - INFO:     agotamiento > 30 días o sin tendencia de crecimiento
// ═══════════════════════════════════════════════════════════════

/**
 * Calcula regresión lineal sobre un array de valores numéricos.
 * Retorna slope (pendiente), intercept, y R² (coeficiente de determinación).
 *
 * @param {number[]} values — Array de valores de la métrica, ordenados cronológicamente
 * @returns {{ slope: number, intercept: number, rSquared: number }}
 */
function linearRegressionForCapacity(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, rSquared: 0 };

  // Usamos el índice como variable x (cada índice = 1 intervalo de 5 min)
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calcular R² (coeficiente de determinación) para medir la calidad del ajuste
  const yMean = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, rSquared };
}

/**
 * Consulta 30 días de historia de una métrica desde CloudWatch usando
 * GetMetricData (más eficiente que GetMetricStatistics para rangos largos).
 *
 * @param {string} systemId — ID del sistema SAP
 * @param {string} metricName — Nombre de la métrica en CloudWatch
 * @returns {Promise<number[]>} — Array de valores ordenados cronológicamente
 */
async function get30DayMetricHistory(systemId, metricName) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 días atrás

  try {
    const result = await cw.send(new GetMetricDataCommand({
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: [
        {
          Id: 'capacityMetric',
          MetricStat: {
            Metric: {
              Namespace: NAMESPACE,
              MetricName: metricName,
              Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
            },
            Period: 300, // 5 minutos — máxima resolución disponible
            Stat: 'Average',
          },
          ReturnData: true,
        },
      ],
      // Orden cronológico ascendente (timestamps[0] = más antiguo)
      ScanBy: 'TimestampAscending',
    }));

    // GetMetricData retorna Timestamps[] y Values[] en paralelo
    const metricData = result.MetricDataResults?.[0];
    if (!metricData || !metricData.Values || metricData.Values.length === 0) {
      return [];
    }

    return metricData.Values; // Ya vienen en orden cronológico ascendente
  } catch (err) {
    log.warn('Error obteniendo 30 días de historia', { metricName, systemId, error: err.message });
    return [];
  }
}

/**
 * Genera una recomendación textual basada en la métrica y la severidad del pronóstico.
 *
 * @param {string} metricName — Nombre de la métrica
 * @param {string} severity — CRITICAL, WARNING o INFO
 * @param {number} daysTo100Pct — Días estimados hasta agotamiento total (o null)
 * @returns {string}
 */
function generateCapacityRecommendation(metricName, severity, daysTo100Pct) {
  const daysStr = daysTo100Pct !== null ? `${daysTo100Pct} días` : 'N/A';

  // Mapeo de métrica a tipo de recurso para recomendaciones contextuales
  const resourceMap = {
    'DB_ASE_PhysLogPct': { resource: 'log físico de ASE', action: 'Ejecutar dump tran para liberar espacio de log y evaluar extensión de disco.' },
    'DB_ASE_PhysDataPct': { resource: 'datos físicos de ASE', action: 'Evaluar purga de tablas históricas, ejecutar reorg, y planificar extensión de disco.' },
    'DB_HANA_MemPct': { resource: 'memoria de HANA', action: 'Revisar tablas en memoria no necesarias, ejecutar memory reclaim, evaluar ampliación de RAM.' },
    'DB_HANA_DiskPct': { resource: 'disco de HANA', action: 'Ejecutar reclaim de datavolume, revisar backups antiguos, planificar extensión de almacenamiento.' },
    'DB_ORACLE_TbsUsedPct': { resource: 'tablespace de Oracle', action: 'Añadir datafiles al tablespace, purgar datos históricos, o habilitar autoextend.' },
    'DB_MSSQL_DataFilePct': { resource: 'archivo de datos de MSSQL', action: 'Extender archivos de datos, ejecutar shrink si aplica, evaluar particionamiento.' },
    'DB_MSSQL_LogFilePct': { resource: 'archivo de log de MSSQL', action: 'Verificar modelo de recuperación, ejecutar backup de log, evaluar extensión.' },
    'DB_DB2_TbsUsedPct': { resource: 'tablespace de DB2', action: 'Aumentar contenedores del tablespace, evaluar reorganización y purga de datos.' },
    'DB_MAXDB_DataVolPct': { resource: 'volumen de datos de MaxDB', action: 'Agregar data volumes adicionales, purgar datos obsoletos, evaluar extensión.' },
    'DB_MAXDB_LogVolPct': { resource: 'volumen de log de MaxDB', action: 'Agregar log volumes, verificar backup de log automático, evaluar extensión.' },
    'APP_JVM_HeapPct': { resource: 'heap JVM', action: 'Analizar heap dumps, verificar memory leaks, considerar aumento de -Xmx o reinicio planificado.' },
  };

  const info = resourceMap[metricName] || { resource: metricName, action: 'Evaluar tendencia y planificar expansión de capacidad.' };

  if (severity === 'CRITICAL') {
    return `URGENTE: ${info.resource} se agotará en aproximadamente ${daysStr}. ${info.action} Acción inmediata requerida.`;
  } else if (severity === 'WARNING') {
    return `ATENCIÓN: ${info.resource} alcanzará capacidad máxima en ~${daysStr}. ${info.action} Planificar con anticipación.`;
  }
  return `Tendencia de crecimiento detectada en ${info.resource}. Agotamiento estimado en ~${daysStr}. Monitorear y planificar si persiste.`;
}

/**
 * H23: Analiza capacity planning con tendencia de 30 días para un sistema.
 *
 * Para cada métrica en CAPACITY_PLANNING_METRICS:
 * 1. Obtiene 30 días de historia (5-min samples) desde CloudWatch
 * 2. Calcula regresión lineal para determinar tasa de crecimiento
 * 3. Predice cuándo la métrica alcanzará 85%, 95% y 100%
 * 4. Clasifica la severidad según días hasta agotamiento
 * 5. Publica alertas SNS para WARNING y CRITICAL
 *
 * @param {string} systemId — ID del sistema SAP
 * @param {Object} metrics — Métricas actuales del sistema (para valor actual)
 * @param {Object} metricsHistory — Historial de métricas (no usado directamente; se consulta CW)
 * @returns {Promise<Object[]>} — Array de objetos CAPACITY_FORECAST
 */
async function analyzeCapacityPlanning(systemId, metrics, metricsHistory) {
  const forecasts = [];

  for (const metricName of CAPACITY_PLANNING_METRICS) {
    try {
      // Paso 1: Obtener 30 días de datos con resolución de 5 minutos
      const values = await get30DayMetricHistory(systemId, metricName);

      // Necesitamos al menos 288 datapoints (~1 día) para un análisis significativo
      if (values.length < 288) {
        log.info('Datapoints insuficientes para análisis H23', { metricName, systemId, datapointsFound: values.length, required: 288 });
        continue;
      }

      // Paso 2: Calcular regresión lineal
      const { slope, intercept, rSquared } = linearRegressionForCapacity(values);

      // El valor actual es el último datapoint
      const currentValue = values[values.length - 1];

      // Convertir slope (por intervalo de 5 min) a tasa por día
      // 1 día = 24h * 60min / 5min = 288 intervalos de 5 minutos
      const intervalsPerDay = 288;
      const growthRatePerDay = slope * intervalsPerDay;

      // Si la tendencia es decreciente o plana, no hay riesgo de agotamiento
      if (growthRatePerDay <= 0.001) {
        // Generar registro INFO solo si hay datos significativos
        if (values.length >= 1000) {
          forecasts.push({
            type: 'CAPACITY_FORECAST',
            systemId,
            metric: metricName,
            currentValue: parseFloat(currentValue.toFixed(2)),
            growthRatePerDay: parseFloat(growthRatePerDay.toFixed(4)),
            daysTo85Pct: null,
            daysTo95Pct: null,
            daysTo100Pct: null,
            severity: 'INFO',
            recommendation: generateCapacityRecommendation(metricName, 'INFO', null),
            rSquared: parseFloat(rSquared.toFixed(3)),
            datapointsAnalyzed: values.length,
          });
        }
        continue;
      }

      // Paso 3: Calcular días hasta cada umbral
      // Fórmula: días = (umbral - valorActual) / tasaPorDía
      const calculateDaysToThreshold = (threshold) => {
        if (currentValue >= threshold) return 0; // Ya superado
        const days = (threshold - currentValue) / growthRatePerDay;
        return days > 0 ? parseFloat(days.toFixed(1)) : null;
      };

      const daysTo85Pct = calculateDaysToThreshold(85);
      const daysTo95Pct = calculateDaysToThreshold(95);
      const daysTo100Pct = calculateDaysToThreshold(100);

      // Paso 4: Determinar severidad basada en el tiempo hasta agotamiento
      // Usamos el umbral más bajo alcanzado (daysTo85 primero, luego 95, luego 100)
      const earliestDepletion = [daysTo85Pct, daysTo95Pct, daysTo100Pct]
        .filter(d => d !== null && d > 0)
        .sort((a, b) => a - b)[0] || null;

      let severity;
      if (earliestDepletion !== null && earliestDepletion <= 7) {
        severity = 'CRITICAL';
      } else if (earliestDepletion !== null && earliestDepletion <= 30) {
        severity = 'WARNING';
      } else {
        severity = 'INFO';
      }

      // Paso 5: Construir el objeto de pronóstico
      const forecast = {
        type: 'CAPACITY_FORECAST',
        systemId,
        metric: metricName,
        currentValue: parseFloat(currentValue.toFixed(2)),
        growthRatePerDay: parseFloat(growthRatePerDay.toFixed(4)),
        daysTo85Pct,
        daysTo95Pct,
        daysTo100Pct,
        severity,
        recommendation: generateCapacityRecommendation(metricName, severity, daysTo100Pct),
        rSquared: parseFloat(rSquared.toFixed(3)),
        datapointsAnalyzed: values.length,
      };

      forecasts.push(forecast);

      if (severity === 'CRITICAL' || severity === 'WARNING') {
        log.info('Pronóstico H23 de capacidad', { severity, metricName, systemId, currentValuePct: parseFloat(currentValue.toFixed(1)), growthRatePerDay: parseFloat(growthRatePerDay.toFixed(2)), daysTo100Pct: daysTo100Pct ?? 'N/A', rSquared: parseFloat(rSquared.toFixed(3)) });
      }

    } catch (err) {
      log.warn('Error analizando capacity planning H23', { metricName, systemId, error: err.message });
    }
  }

  return forecasts;
}

/**
 * Publica alertas de CAPACITY_FORECAST vía SNS para pronósticos
 * con severidad WARNING o CRITICAL.
 *
 * @param {Object[]} forecasts — Array de objetos CAPACITY_FORECAST
 * @param {string} systemId — ID del sistema SAP
 */
async function publishCapacityForecastAlerts(forecasts, systemId) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn) return;

  // Solo publicar WARNING y CRITICAL
  const actionableForecasts = forecasts.filter(f => f.severity === 'WARNING' || f.severity === 'CRITICAL');
  if (actionableForecasts.length === 0) return;

  // Verificar deduplicación para cada forecast
  const newForecasts = [];
  for (const f of actionableForecasts) {
    const isNew = await shouldAlert(systemId, `H23_CAPACITY_${f.metric}`);
    if (isNew) {
      newForecasts.push(f);
    } else {
      log.info('Pronóstico H23 ya alertado recientemente', { metric: f.metric, systemId });
    }
  }

  if (newForecasts.length === 0) return;

  // Construir mensaje legible para SNS
  const criticalCount = newForecasts.filter(f => f.severity === 'CRITICAL').length;
  const warningCount = newForecasts.filter(f => f.severity === 'WARNING').length;

  const forecastLines = newForecasts.map(f => {
    const days100 = f.daysTo100Pct !== null ? `${f.daysTo100Pct}d` : 'N/A';
    const days85 = f.daysTo85Pct !== null ? `${f.daysTo85Pct}d` : 'N/A';
    return `  [${f.severity}] ${f.metric}: ${f.currentValue}% actual, +${f.growthRatePerDay.toFixed(2)}%/día, ` +
      `85% en ${days85}, 100% en ${days100}`;
  }).join('\n');

  const message = {
    type: 'CAPACITY_FORECAST',
    systemId,
    timestamp: new Date().toISOString(),
    summary: {
      total: newForecasts.length,
      critical: criticalCount,
      warning: warningCount,
    },
    forecasts: newForecasts,
    readableMessage: `[Avvale SAP AlwaysOps] Pronóstico de Capacidad — ${systemId}\n\n` +
      `${criticalCount} crítico(s), ${warningCount} advertencia(s)\n\n` +
      `${forecastLines}\n\n` +
      `Acción requerida: revise las recomendaciones individuales de cada métrica.`,
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: alertsTopicArn,
      Subject: `Avvale SAP AlwaysOps H23 Capacity Forecast: ${systemId} (${criticalCount} CRITICAL, ${warningCount} WARNING)`,
      Message: JSON.stringify(message, null, 2),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'CAPACITY_FORECAST' },
        systemId: { DataType: 'String', StringValue: systemId },
        severity: { DataType: 'String', StringValue: criticalCount > 0 ? 'CRITICAL' : 'WARNING' },
      },
    }));
    log.info('Alertas de capacity forecast H23 publicadas', { count: newForecasts.length, systemId });
  } catch (err) {
    log.error('Error publicando alertas de forecast H23', { systemId, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getRecentMetrics
//  Lee las métricas recientes de CloudWatch para un sistema
//  y una métrica específica. Devuelve los datapoints ordenados.
// ═══════════════════════════════════════════════════════════════

async function getRecentMetrics(systemId, metricName) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - LOOKBACK_MINUTES * 60 * 1000);

  try {
    const result = await cw.send(new GetMetricStatisticsCommand({
      Namespace: NAMESPACE,
      MetricName: metricName,
      Dimensions: [
        { Name: 'SAPSystemId', Value: systemId },
      ],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300, // 5 minutos entre cada punto
      Statistics: ['Average'],
    }));

    // Ordenar por timestamp (CloudWatch no garantiza el orden)
    const datapoints = (result.Datapoints || [])
      .map(dp => ({ timestamp: dp.Timestamp, value: dp.Average }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return datapoints;
  } catch (err) {
    log.warn('Error leyendo métrica de CloudWatch', { metricName, systemId, error: err.message });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: calculateTrend
//  Calcula la tendencia usando regresión lineal simple.
//  La regresión lineal busca la línea recta que mejor se
//  ajusta a los puntos de datos: y = mx + b
//  donde m es la pendiente (slope) y b es el intercepto.
// ═══════════════════════════════════════════════════════════════

function calculateTrend(datapoints) {
  const n = datapoints.length;

  // Necesitamos al menos 2 puntos para calcular una tendencia
  if (n < 2) {
    const currentValue = n === 1 ? datapoints[0].value : 0;
    return {
      slope: 0,            // Sin tendencia
      currentValue,
      predictedValue: currentValue, // Predecimos que se queda igual
      confidence: 'BAJA',
    };
  }

  // Regresión lineal: calcular la pendiente (slope)
  // x = índice del punto (0, 1, 2, ...)
  // y = valor de la métrica
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  datapoints.forEach((dp, i) => {
    sumX += i;
    sumY += dp.value;
    sumXY += i * dp.value;
    sumX2 += i * i;
  });

  // Fórmula de la pendiente: m = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

  // Valor actual (último punto)
  const currentValue = datapoints[n - 1].value;

  // Predecir el valor futuro
  // ¿Cuántos intervalos de 5 minutos hay en la ventana de predicción?
  const futureIntervals = PREDICTION_WINDOW_MIN / 5;
  const predictedValue = currentValue + slope * futureIntervals;

  // Calcular confianza basada en cantidad de datos
  const confidence = n >= 5 ? 'ALTA' : n >= 3 ? 'MEDIA' : 'BAJA';

  return { slope, currentValue, predictedValue, confidence };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: evaluatePredictions
//  Para cada métrica con umbral definido, lee datos recientes,
//  calcula la tendencia, y determina si habrá un breach futuro.
// ═══════════════════════════════════════════════════════════════

async function evaluatePredictions(systemId) {
  const predictions = [];

  for (const [metricName, thresholdDef] of Object.entries(THRESHOLDS)) {
    // Leer datos recientes de CloudWatch
    const datapoints = await getRecentMetrics(systemId, metricName);

    // Si no hay datos, saltar esta métrica
    if (datapoints.length === 0) continue;

    // Calcular tendencia
    const trend = calculateTrend(datapoints);

    // Métricas invertidas (CacheHitRatio): el breach es cuando BAJA, no cuando sube
    const isInverted = thresholdDef.inverted === true;
    let willBreach = false;
    let highThreshold;
    let minutesToBreach = null;

    if (isInverted) {
      // Para métricas invertidas: breach cuando el valor cae por debajo del umbral
      highThreshold = thresholdDef.HIGH_BELOW;
      willBreach = trend.predictedValue <= highThreshold && trend.currentValue > highThreshold;
      if (trend.slope < 0) {
        minutesToBreach = Math.floor(((trend.currentValue - highThreshold) / Math.abs(trend.slope)) * 5);
      }
    } else {
      // Para métricas normales: breach cuando el valor sube por encima del umbral
      highThreshold = thresholdDef.HIGH;
      willBreach = trend.predictedValue >= highThreshold && trend.currentValue < highThreshold;
      if (trend.slope > 0) {
        minutesToBreach = Math.floor(((highThreshold - trend.currentValue) / trend.slope) * 5);
      }
    }

    // Verificar crecimiento rápido (más de 5% por intervalo de 5 minutos)
    const rapidGrowth = !isInverted && trend.slope > 5 && metricName.includes('Pct');

    if (willBreach || rapidGrowth) {
      predictions.push({
        metricName,
        currentValue: parseFloat((Number(trend.currentValue) || 0).toFixed(2)),
        predictedValue: parseFloat((Number(trend.predictedValue) || 0).toFixed(2)),
        threshold: highThreshold,
        slope: parseFloat((Number(trend.slope) || 0).toFixed(4)),
        confidence: trend.confidence,
        severity: 'PREDICTIVE',
        runbook: thresholdDef.runbook,
        costSafe: thresholdDef.costSafe,
        requiresApproval: thresholdDef.requiresApproval,
        rapidGrowth,
        inverted: isInverted,
        minutesToBreach,
      });
    }
  }

  return predictions;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: triggerPreventiveAction
//  Para predicciones costSafe, dispara Step Functions para
//  que el runbook-engine ejecute acciones preventivas.
// ═══════════════════════════════════════════════════════════════

async function triggerPreventiveAction(predictions, systemId, systemConfig) {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    log.warn('STATE_MACHINE_ARN no configurado');
    return;
  }

  // Solo actuar automáticamente en métricas costSafe
  const safePredictions = predictions.filter(p => p.costSafe && !p.requiresApproval);

  if (safePredictions.length === 0) {
    log.info('No hay predicciones costSafe para accionar');
    return;
  }

  // Convertir predicciones al formato de breaches que espera el runbook-engine
  const breaches = safePredictions.map(p => ({
    metricName: p.metricName,
    value: p.currentValue,
    severity: 'PREDICTIVE',
    threshold: p.threshold,
    runbook: p.runbook,
    costSafe: p.costSafe,
    requiresApproval: false,
    systemId,
    dbType: systemConfig.database?.type || 'UNKNOWN',
    systemType: systemConfig.systemType || 'UNKNOWN',
    timestamp: new Date().toISOString(),
    preventive: true, // Marca especial para que el runbook-engine sepa que es preventivo
  }));

  const input = {
    breaches,
    metrics: {}, // Las métricas se leen del CloudWatch directamente
    systemId,
    systemType: systemConfig.systemType,
    dbType: systemConfig.database?.type,
    sid: systemConfig.sid,
    env: systemConfig.environment,
    preventive: true,
    timestamp: new Date().toISOString(),
  };

  try {
    await sfn.send(new StartExecutionCommand({
      stateMachineArn,
      name: `preventive-${systemId}-${Date.now()}`,
      input: JSON.stringify(input),
    }));

    log.info('Step Functions disparado para acciones preventivas', { systemId, actionCount: safePredictions.length });
  } catch (err) {
    log.error('Error disparando Step Functions', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: publishPreventiveAlert
//  Publica alertas por SNS para predicciones que requieren
//  aprobación o simplemente para informar al equipo.
// ═══════════════════════════════════════════════════════════════

async function publishPreventiveAlert(predictions, systemId) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn || predictions.length === 0) return;

  const message = {
    type: 'PREVENTIVE_ALERT',
    systemId,
    predictions: predictions.map(p => ({
      metricName: p.metricName,
      currentValue: p.currentValue,
      predictedValue: p.predictedValue,
      threshold: p.threshold,
      minutesToBreach: p.minutesToBreach,
      runbook: p.runbook,
      costSafe: p.costSafe,
      rapidGrowth: p.rapidGrowth,
    })),
    timestamp: new Date().toISOString(),
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: alertsTopicArn,
      Subject: `Avvale SAP AlwaysOps Preventivo: ${systemId} (${predictions.length} predicciones)`,
      Message: JSON.stringify(message),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'PREVENTIVE_ALERT' },
        systemId: { DataType: 'String', StringValue: systemId },
      },
    }));

    log.info('Alerta preventiva publicada', { systemId });
  } catch (err) {
    log.warn('Error publicando alerta preventiva', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: publishPredictionMetrics
//  Publica métricas de predicción en CloudWatch para monitoreo.
// ═══════════════════════════════════════════════════════════════

async function publishPredictionMetrics(systemId, predictionsCount) {
  try {
    await cw.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [
        {
          MetricName: 'PreventivePredictions',
          Value: predictionsCount,
          Timestamp: new Date(),
          Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
          Unit: 'Count',
        },
      ],
    }));
  } catch (err) {
    log.warn('Error publicando métrica de predicciones', { error: err.message });
  }
}

// ============================================================================
//  v1.0 — H29: MULTI-SYSTEM CORRELATION & CASCADE DETECTION
//  Detecta correlaciones entre múltiples sistemas SAP y cadenas de
//  fallos en cascada. Cuando un sistema tiene breaches, analiza el
//  impacto potencial en sistemas dependientes y detecta si múltiples
//  sistemas relacionados están fallando simultáneamente.
// ============================================================================

// Mapeo de dependencias entre sistemas SAP
// Un sistema puede depender de varios otros
const SYSTEM_DEPENDENCIES = {
  'SAP-ERP': {
    dependsOn: ['SAP-HANA-DB', 'SAP-PO'],
    impactLevel: 'CRITICAL',
    description: 'ERP central depende de HANA y Process Orchestration',
  },
  'SAP-BW': {
    dependsOn: ['SAP-HANA-DB', 'SAP-ERP'],
    impactLevel: 'HIGH',
    description: 'Business Warehouse depende de HANA y extrae datos de ERP',
  },
  'SAP-PO': {
    dependsOn: ['SAP-ERP'],
    impactLevel: 'HIGH',
    description: 'Process Orchestration integra con ERP',
  },
  'SAP-FIORI': {
    dependsOn: ['SAP-ERP', 'SAP-HANA-DB'],
    impactLevel: 'MEDIUM',
    description: 'Portal Fiori conecta a ERP y HANA',
  },
  'SAP-SOLMAN': {
    dependsOn: ['SAP-HANA-DB'],
    impactLevel: 'MEDIUM',
    description: 'Solution Manager para monitoreo central',
  },
};

// Pesos de impacto según nivel del sistema dependiente
const IMPACT_WEIGHTS = { CRITICAL: 40, HIGH: 30, MEDIUM: 20 };

// Pesos de severidad del breach original
const SEVERITY_WEIGHTS = { CRITICAL: 1.0, HIGH: 0.7, MEDIUM: 0.4, PREDICTIVE: 0.3, LOW: 0.2 };

/**
 * Analiza correlación entre sistemas a partir de los breaches actuales.
 *
 * Para cada breach del sistema dado, busca qué OTROS sistemas dependen de él
 * y calcula un "cascade risk score" (0-100) basado en:
 *   - Número de sistemas dependientes
 *   - Nivel de impacto de cada dependiente (CRITICAL=40, HIGH=30, MEDIUM=20)
 *   - Severidad del breach actual
 *
 * @param {Object[]} breaches — Breaches actuales del sistema (cada uno con metricName, severity)
 * @param {string} systemId — ID del sistema que tiene los breaches
 * @returns {Object[]} — Array de alertas de correlación con sourceSystem, affectedSystems, cascadeRiskScore, etc.
 */
function analyzeSystemCorrelation(breaches, systemId) {
  if (!breaches || breaches.length === 0) return [];

  // Encontrar todos los sistemas que DEPENDEN del sistema actual
  const dependentSystems = [];
  for (const [sysName, config] of Object.entries(SYSTEM_DEPENDENCIES)) {
    if (config.dependsOn.includes(systemId)) {
      dependentSystems.push({ systemId: sysName, impactLevel: config.impactLevel, description: config.description });
    }
  }

  // Si nadie depende de este sistema, no hay riesgo de cascada
  if (dependentSystems.length === 0) return [];

  const correlationAlerts = [];

  for (const breach of breaches) {
    // Calcular cascade risk score (0-100)
    // Base: suma de pesos de impacto de todos los dependientes
    const impactSum = dependentSystems.reduce((sum, dep) => {
      return sum + (IMPACT_WEIGHTS[dep.impactLevel] || 10);
    }, 0);

    // Multiplicador por severidad del breach
    const severityMultiplier = SEVERITY_WEIGHTS[breach.severity] || 0.3;

    // Score final normalizado a 0-100
    // Fórmula: (impactSum * severityMultiplier) limitado a 100
    const cascadeRiskScore = Math.min(100, Math.round(impactSum * severityMultiplier));

    // Generar recomendación basada en el score
    let recommendation;
    if (cascadeRiskScore >= 70) {
      recommendation = `URGENTE: Breach en ${systemId} (${breach.metricName}) puede causar fallo en cascada. ` +
        `Sistemas afectados: ${dependentSystems.map(d => d.systemId).join(', ')}. ` +
        `Priorizar resolución inmediata y notificar equipos de los sistemas dependientes.`;
    } else if (cascadeRiskScore >= 40) {
      recommendation = `ATENCIÓN: Breach en ${systemId} (${breach.metricName}) tiene riesgo moderado de impacto en cascada. ` +
        `Monitorear sistemas dependientes: ${dependentSystems.map(d => d.systemId).join(', ')}.`;
    } else {
      recommendation = `INFO: Breach en ${systemId} (${breach.metricName}) detectado. ` +
        `Riesgo bajo de impacto en ${dependentSystems.map(d => d.systemId).join(', ')}, pero monitorear.`;
    }

    correlationAlerts.push({
      sourceSystem: systemId,
      affectedSystems: dependentSystems.map(d => d.systemId),
      cascadeRiskScore,
      breachMetric: breach.metricName || breach.metric,
      breachSeverity: breach.severity,
      recommendation,
      timestamp: new Date().toISOString(),
    });
  }

  return correlationAlerts;
}

/**
 * Detecta fallos en cascada analizando si múltiples sistemas relacionados
 * están teniendo breaches simultáneamente.
 *
 * Lógica:
 *   - Si 2+ sistemas en una cadena de dependencia tienen breaches → POSSIBLE CASCADE
 *   - Si 3+ sistemas en una cadena de dependencia tienen breaches → CONFIRMED CASCADE
 *
 * @param {Object} systemsBreaches — Mapa de systemId → [breaches activos]
 * @returns {Object|null} — Alerta de cascada o null si no hay cascada
 */
function detectCascadeFailure(systemsBreaches) {
  if (!systemsBreaches || Object.keys(systemsBreaches).length < 2) return null;

  // Obtener los sistemas que actualmente tienen breaches
  const breachingSystems = Object.keys(systemsBreaches).filter(
    sysId => systemsBreaches[sysId] && systemsBreaches[sysId].length > 0
  );

  if (breachingSystems.length < 2) return null;

  // Para cada sistema con breaches, verificar si hay sistemas relacionados también con breaches
  // Construir cadenas de dependencia afectadas
  const affectedChains = [];

  for (const sysId of breachingSystems) {
    const config = SYSTEM_DEPENDENCIES[sysId];
    if (!config) continue;

    // Verificar si alguna de sus dependencias también está en breach
    const breachingDependencies = config.dependsOn.filter(dep => breachingSystems.includes(dep));

    if (breachingDependencies.length > 0) {
      affectedChains.push({
        system: sysId,
        breachingDependencies,
        breachCount: systemsBreaches[sysId].length,
      });
    }
  }

  if (affectedChains.length === 0) return null;

  // Contar sistemas únicos involucrados en cadenas de cascada
  const uniqueAffectedSystems = new Set();
  for (const chain of affectedChains) {
    uniqueAffectedSystems.add(chain.system);
    chain.breachingDependencies.forEach(dep => uniqueAffectedSystems.add(dep));
  }

  const totalAffected = uniqueAffectedSystems.size;

  // Determinar severidad de la cascada
  let severity, confidence;
  if (totalAffected >= 3) {
    severity = 'CONFIRMED_CASCADE';
    confidence = 'ALTA';
  } else {
    severity = 'POSSIBLE_CASCADE';
    confidence = 'MEDIA';
  }

  // Intentar determinar la causa raíz más probable
  // El sistema del que más otros dependen y que está en breach es el candidato
  let rootCauseLikely = null;
  let maxDependents = 0;
  for (const sysId of breachingSystems) {
    const dependentsCount = Object.values(SYSTEM_DEPENDENCIES)
      .filter(config => config.dependsOn.includes(sysId))
      .length;
    if (dependentsCount > maxDependents) {
      maxDependents = dependentsCount;
      rootCauseLikely = sysId;
    }
  }

  return {
    type: 'CASCADE_FAILURE',
    severity,
    confidence,
    affectedSystems: Array.from(uniqueAffectedSystems),
    rootCauseLikely,
    chains: affectedChains,
    totalBreaches: breachingSystems.reduce((sum, sysId) => sum + systemsBreaches[sysId].length, 0),
    recommendation: severity === 'CONFIRMED_CASCADE'
      ? `CASCADA CONFIRMADA: ${totalAffected} sistemas afectados simultáneamente. ` +
        `Causa raíz probable: ${rootCauseLikely}. ` +
        `Priorizar resolución de ${rootCauseLikely} antes de atender sistemas dependientes.`
      : `POSIBLE CASCADA: ${totalAffected} sistemas relacionados con breaches simultáneos. ` +
        `Investigar ${rootCauseLikely} como posible causa raíz.`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Consulta CloudWatch para obtener alarmas activas de todos los sistemas SAP.
 * Usa describeAlarms() con filtro de namespace para encontrar alarmas en estado ALARM.
 *
 * @returns {Promise<Object>} — Mapa de systemId → [breaches activos]
 */
async function getMultiSystemBreaches() {
  const systemsBreaches = {};

  try {
    // Consultar todas las alarmas activas en el namespace de Avvale SAP AlwaysOps
    let nextToken = undefined;
    const allAlarms = [];

    do {
      const params = {
        StateValue: 'ALARM', // Solo alarmas activas
        MaxRecords: 100,
      };
      if (nextToken) params.NextToken = nextToken;

      const result = await cw.send(new DescribeAlarmsCommand(params));
      const alarms = result.MetricAlarms || [];

      // Filtrar solo alarmas del namespace de Avvale SAP AlwaysOps
      const alwaysOpsAlarms = alarms.filter(a => a.Namespace === NAMESPACE);
      allAlarms.push(...alwaysOpsAlarms);

      nextToken = result.NextToken;
    } while (nextToken);

    // Agrupar alarmas por systemId (extraído de las dimensiones)
    for (const alarm of allAlarms) {
      const systemDimension = (alarm.Dimensions || []).find(
        d => d.Name === 'SAPSystemId' || d.Name === 'SystemId'
      );
      const systemId = systemDimension?.Value || 'UNKNOWN';

      if (!systemsBreaches[systemId]) {
        systemsBreaches[systemId] = [];
      }

      systemsBreaches[systemId].push({
        metricName: alarm.MetricName,
        severity: alarm.AlarmName?.includes('CRITICAL') ? 'CRITICAL' : 'HIGH',
        value: alarm.StateReasonData ? JSON.parse(alarm.StateReasonData)?.recentDatapoints?.[0] : null,
        alarmName: alarm.AlarmName,
        stateUpdated: alarm.StateUpdatedTimestamp,
      });
    }

    log.info('Alarmas activas encontradas', { alarmCount: allAlarms.length, systemCount: Object.keys(systemsBreaches).length });
  } catch (err) {
    log.warn('Error consultando alarmas multi-sistema', { error: err.message });
  }

  return systemsBreaches;
}

/**
 * Publica alertas de correlación multi-sistema y/o cascada vía SNS.
 * Usa el mismo ALERTS_TOPIC_ARN que las demás alertas del engine.
 *
 * @param {Object[]} alerts — Array de alertas (correlación y/o cascada)
 */
async function publishMultiSystemCorrelationAlerts(alerts) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn || !alerts || alerts.length === 0) return;

  // Separar alertas de correlación y cascada para mejor formato
  const correlationAlerts = alerts.filter(a => !a.type || a.type !== 'CASCADE_FAILURE');
  const cascadeAlerts = alerts.filter(a => a.type === 'CASCADE_FAILURE');

  const message = {
    type: cascadeAlerts.length > 0 ? 'CASCADE_FAILURE' : 'MULTI_SYSTEM_CORRELATION',
    timestamp: new Date().toISOString(),
    summary: {
      correlationAlerts: correlationAlerts.length,
      cascadeAlerts: cascadeAlerts.length,
      totalAlerts: alerts.length,
    },
    correlations: correlationAlerts,
    cascades: cascadeAlerts,
  };

  // Determinar severidad del subject
  const hasCascade = cascadeAlerts.some(a => a.severity === 'CONFIRMED_CASCADE');
  const subjectPrefix = hasCascade ? 'CASCADA CONFIRMADA' : 'Correlación Multi-Sistema';

  try {
    await sns.send(new PublishCommand({
      TopicArn: alertsTopicArn,
      Subject: `[Avvale SAP AlwaysOps H29] ${subjectPrefix}: ${alerts.length} alerta(s)`,
      Message: JSON.stringify(message, null, 2),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: cascadeAlerts.length > 0 ? 'CASCADE_FAILURE' : 'MULTI_SYSTEM_CORRELATION' },
        severity: { DataType: 'String', StringValue: hasCascade ? 'CRITICAL' : 'HIGH' },
      },
    }));
    log.info('Alertas de correlación/cascada publicadas', { alertCount: alerts.length });
  } catch (err) {
    log.warn('Error publicando alertas de correlación multi-sistema', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  CLEAN-CORE GUARDRAILS
//  Verifica kernel version y parametros SAP criticos contra baseline.
//  Genera alertas si hay desviaciones.
// ═══════════════════════════════════════════════════════════════

const KERNEL_BASELINE = {
  minimum_release: '753',
  minimum_patch: 1000,
  recommended_release: '789',
};

const CRITICAL_PARAMS = {
  'rdisp/wp_no_dia': { min: 10, description: 'Work processes dialog' },
  'rdisp/wp_no_btc': { min: 3, description: 'Work processes batch' },
  'em/initial_size_MB': { min: 4096, description: 'Extended memory' },
  'abap/heap_area_dia': { min: 500000000, description: 'Heap area dialog' },
};

function checkCleanCoreCompliance(discoveryData) {
  const findings = [];

  // Verificar kernel version
  if (discoveryData?.kernelVersion) {
    const release = parseInt(discoveryData.kernelVersion.release) || 0;
    const patch = parseInt(discoveryData.kernelVersion.patchNumber) || 0;
    const minRelease = parseInt(KERNEL_BASELINE.minimum_release);

    if (release < minRelease) {
      findings.push({
        type: 'KERNEL_OUTDATED',
        severity: 'HIGH',
        message: `Kernel ${release} por debajo del minimo ${KERNEL_BASELINE.minimum_release}`,
        current: `${release}.${patch}`,
        baseline: `${KERNEL_BASELINE.minimum_release}.${KERNEL_BASELINE.minimum_patch}`,
      });
    } else if (patch < KERNEL_BASELINE.minimum_patch) {
      findings.push({
        type: 'KERNEL_PATCH_LOW',
        severity: 'MEDIUM',
        message: `Kernel patch ${patch} por debajo del minimo ${KERNEL_BASELINE.minimum_patch}`,
        current: `${release}.${patch}`,
        baseline: `${KERNEL_BASELINE.minimum_release}.${KERNEL_BASELINE.minimum_patch}`,
      });
    }
  }

  // Verificar HA sin secondary
  if (discoveryData?.haCluster && discoveryData.haCluster.localRole === 'master') {
    // Si hay cluster pero no se detecta peer, alertar
    if (!discoveryData.haCluster.peerInstanceId && discoveryData.haCluster.resources?.length < 2) {
      findings.push({
        type: 'HA_NO_SECONDARY',
        severity: 'HIGH',
        message: 'Cluster HA detectado sin nodo secundario activo',
      });
    }
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Se ejecuta cada 30 minutos. Para cada sistema configurado,
//  evalúa predicciones y toma acciones si es necesario.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event) => {
  log.initFromEvent(event);
  log.info('Preventive Engine v1.0 invocado', { features: 'correlación + maintenance windows + multi-system cascade + clean-core' });
  const startTime = Date.now();

  // ─── Cargar ventanas de mantenimiento al inicio ───
  await getMaintenanceWindows();

  // Cargar configuración de sistemas desde SSM
  let systemsConfig;
  try {
    const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
    const param = await ssm.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    }));
    systemsConfig = JSON.parse(param.Parameter.Value);
  } catch (err) {
    log.error('Error cargando configuración', { error: err.message });
    // Configuración de respaldo
    systemsConfig = [{
      systemId: process.env.SYSTEM_ID || 'SAP-DEFAULT',
      systemType: process.env.SYSTEM_TYPE || 'SAP_PO',
      sid: process.env.SYSTEM_SID || 'PRD',
      environment: process.env.ENVIRONMENT || 'Production',
      enabled: true,
      database: { type: process.env.DB_TYPE || 'SAP_ASE' },
    }];
  }

  const results = [];

  for (const sys of systemsConfig) {
    if (!sys.enabled) {
      log.info('Sistema deshabilitado, saltando', { systemId: sys.systemId });
      continue;
    }

    log.info('Evaluando predicciones', { systemId: sys.systemId });

    // ─── MAINTENANCE WINDOW: suprimir predicciones durante mantenimiento ───
    if (isInMaintenanceWindow(sys.systemId)) {
      log.info('Sistema en ventana de mantenimiento, suprimiendo predicciones', { systemId: sys.systemId });
      results.push({
        systemId: sys.systemId,
        status: 'MAINTENANCE_SUPPRESSED',
        predictionsCount: 0,
        maintenanceWindow: true,
      });
      continue;
    }

    try {
      // Evaluar todas las métricas del sistema
      const predictions = await evaluatePredictions(sys.systemId);

      log.info('Predicciones de breach evaluadas', { count: predictions.length, systemId: sys.systemId });

      if (predictions.length > 0) {
        // Filtrar predicciones ya alertadas (deduplicación)
        const newPredictions = [];
        for (const p of predictions) {
          const isNew = await shouldAlert(sys.systemId, p.metricName);
          if (isNew) {
            newPredictions.push(p);
          } else {
            log.info('Predicción ya alertada recientemente, saltando', { metricName: p.metricName, systemId: sys.systemId });
          }
        }

        if (newPredictions.length > 0) {
          // Disparar acciones preventivas para métricas costSafe
          await triggerPreventiveAction(newPredictions, sys.systemId, sys);

          // Publicar alerta SNS para predicciones nuevas
          await publishPreventiveAlert(newPredictions, sys.systemId);
        }
      }

      // ─── CORRELACIÓN DE MÉTRICAS: detectar patrones multi-métrica ───
      const correlations = await evaluateCorrelations(sys.systemId);
      if (correlations.length > 0) {
        log.info('Patrones de correlación detectados', { count: correlations.length, systemId: sys.systemId });
        await publishCorrelationAlerts(correlations, sys.systemId);
      }

      // ─── v1.7: SMART MAINTENANCE WINDOWS: detectar patrones y sugerir ───
      const smartMW = await detectSmartMaintenanceWindows(sys.systemId);
      if (smartMW) {
        log.info('Ventanas de mantenimiento inteligentes sugeridas', { count: smartMW.suggestedWindows.length, systemId: sys.systemId });
        await publishSmartWindowSuggestions(smartMW);
      }

      // Publicar métricas de predicción en CloudWatch
      await publishPredictionMetrics(sys.systemId, predictions.length);

      results.push({
        systemId: sys.systemId,
        status: 'SUCCESS',
        predictionsCount: predictions.length,
        correlationsCount: correlations.length,
        smartMaintenanceWindows: smartMW?.suggestedWindows?.length || 0,
        costSafeActions: predictions.filter(p => p.costSafe && !p.requiresApproval).length,
        approvalNeeded: predictions.filter(p => p.requiresApproval).length,
        predictions: predictions.map(p => ({
          metric: p.metricName,
          current: p.currentValue,
          predicted: p.predictedValue,
          threshold: p.threshold,
          minutesToBreach: p.minutesToBreach,
        })),
        correlations: correlations.map(c => ({
          pattern: c.correlationId,
          name: c.name,
          severity: c.severity,
        })),
      });

    } catch (err) {
      log.error('Error procesando sistema', { systemId: sys.systemId, error: err.message, stack: err.stack });
      results.push({ systemId: sys.systemId, status: 'ERROR', error: err.message });
    }
  }

  // H14: Capacity Planning Predictions
  log.info('Ejecutando capacity planning');
  const allCapacityPredictions = [];
  for (const sys of systemsConfig) {
    try {
      const predictions = await runCapacityPlanning(sys.systemId);
      if (predictions.length > 0) {
        allCapacityPredictions.push(...predictions);
        log.info('Predicciones de agotamiento detectadas', { systemId: sys.systemId, count: predictions.length });
      }
    } catch (err) {
      log.warn('Error en capacity planning', { systemId: sys.systemId, error: err.message });
    }
  }

  // Publicar alertas de capacity planning
  if (allCapacityPredictions.length > 0) {
    await publishCapacityPlanningAlerts(allCapacityPredictions);
  }

  // ─── H23: Capacity Planning — 30-Day Trend Analysis + Depletion Prediction ───
  log.info('Ejecutando análisis de tendencia H23 a 30 días');
  const allCapacityForecasts = [];
  for (const sys of systemsConfig) {
    if (!sys.enabled) continue;
    // No ejecutar durante ventanas de mantenimiento
    if (isInMaintenanceWindow(sys.systemId)) {
      log.info('Sistema en mantenimiento, saltando análisis H23', { systemId: sys.systemId });
      continue;
    }
    try {
      const forecasts = await analyzeCapacityPlanning(sys.systemId, {}, {});
      if (forecasts.length > 0) {
        allCapacityForecasts.push(...forecasts);
        const critical = forecasts.filter(f => f.severity === 'CRITICAL').length;
        const warning = forecasts.filter(f => f.severity === 'WARNING').length;
        const info = forecasts.filter(f => f.severity === 'INFO').length;
        log.info('Pronósticos H23 generados', { systemId: sys.systemId, total: forecasts.length, critical, warning, info });

        // Publicar alertas SNS para WARNING y CRITICAL
        await publishCapacityForecastAlerts(forecasts, sys.systemId);
      }
    } catch (err) {
      log.warn('Error en análisis de 30 días H23', { systemId: sys.systemId, error: err.message });
    }
  }

  // ─── v1.0 — H29: Multi-System Correlation & Cascade Detection ───
  let correlationAnalysisResult = { correlationAlerts: 0, cascadeDetected: false, cascadeLevel: 'NONE' };
  try {
    // Paso 1: Obtener breaches activos de todos los sistemas vía CloudWatch Alarms
    const multiSystemBreaches = await getMultiSystemBreaches();

    // Paso 2: Para cada sistema procesado, analizar correlación con sus breaches
    const allCorrelationAlerts = [];
    for (const result of results) {
      if (result.status !== 'SUCCESS' || !result.predictions || result.predictions.length === 0) continue;
      // Convertir predicciones del resultado a formato de breaches para correlación
      const breachesForCorrelation = result.predictions.map(p => ({
        metricName: p.metric,
        severity: p.predicted >= (THRESHOLDS[p.metric]?.CRITICAL || Infinity) ? 'CRITICAL' : 'HIGH',
      }));
      const correlationAlerts = analyzeSystemCorrelation(breachesForCorrelation, result.systemId);
      allCorrelationAlerts.push(...correlationAlerts);
    }

    // Paso 3: Detectar fallos en cascada entre múltiples sistemas
    const cascadeResult = detectCascadeFailure(multiSystemBreaches);

    // Paso 4: Publicar alertas si hay correlaciones o cascadas
    if (allCorrelationAlerts.length > 0 || cascadeResult) {
      await publishMultiSystemCorrelationAlerts([...allCorrelationAlerts, cascadeResult].filter(Boolean));
      correlationAnalysisResult = {
        correlationAlerts: allCorrelationAlerts.length,
        cascadeDetected: !!cascadeResult,
        cascadeLevel: cascadeResult?.severity || 'NONE',
      };
    }
    log.info('Análisis de correlación H29 completado', { alertCount: allCorrelationAlerts.length, cascadeDetected: !!cascadeResult });
  } catch (corrErr) {
    log.warn('Análisis de correlación H29 falló (no bloqueante)', { error: corrErr.message });
  }

  const duration = Date.now() - startTime;
  log.info('Preventive Engine completado', { durationMs: duration, results });

  return {
    statusCode: 200,
    body: {
      message: 'Avvale SAP AlwaysOps Preventive Engine v1.0 completado',
      duration: `${duration}ms`,
      systemsProcessed: results.length,
      capacityPredictions: allCapacityPredictions.length,
      capacityForecasts: {
        total: allCapacityForecasts.length,
        critical: allCapacityForecasts.filter(f => f.severity === 'CRITICAL').length,
        warning: allCapacityForecasts.filter(f => f.severity === 'WARNING').length,
        info: allCapacityForecasts.filter(f => f.severity === 'INFO').length,
        details: allCapacityForecasts.map(f => ({
          metric: f.metric,
          systemId: f.systemId,
          currentValue: f.currentValue,
          growthRatePerDay: f.growthRatePerDay,
          daysTo85Pct: f.daysTo85Pct,
          daysTo95Pct: f.daysTo95Pct,
          daysTo100Pct: f.daysTo100Pct,
          severity: f.severity,
        })),
      },
      correlationAnalysis: correlationAnalysisResult,
      results,
    },
  };
};
