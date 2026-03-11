'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Audit Reporter
//  Generador semanal de reportes de auditoría y compliance.
//
//  ¿Qué hace este Lambda?
//  Cada lunes a las 08:00 UTC, EventBridge invoca este Lambda.
//  Lee datos de los últimos 7 días desde 4 tablas de DynamoDB:
//  incidentes, aprobaciones, ejecuciones de runbook y resultados
//  del advisor (Bedrock). Genera un reporte completo en JSON y
//  HTML, lo sube a S3 y envía un resumen con URL presignada
//  al equipo via SNS.
//
//  Trigger: EventBridge — cron(0 8 ? * MON *)
// ═══════════════════════════════════════════════════════════════

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
// H39 — Módulo de compliance profundo (SOX, GxP, ISO 27001)
const { generateFullComplianceReport } = require('./compliance');
const log = require('../utilidades/logger')('audit-reporter');

// Clientes de AWS (se crean una sola vez, se reutilizan entre invocaciones)
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const sns = new SNSClient({});
const ssm = new SSMClient({});

// ─── Variables de entorno ───
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'sap-alwaysops-incidents';
const APPROVALS_TABLE = process.env.APPROVALS_TABLE || 'sap-alwaysops-approvals';
const RUNBOOK_EXECUTIONS_TABLE = process.env.RUNBOOK_EXECUTIONS_TABLE || 'sap-alwaysops-runbook-executions';
const ADVISOR_RESULTS_TABLE = process.env.ADVISOR_RESULTS_TABLE || 'sap-alwaysops-advisor-results';
const AUDIT_BUCKET = process.env.AUDIT_BUCKET || 'sap-alwaysops-audit';
const ALERTS_TOPIC_ARN = process.env.ALERTS_TOPIC_ARN || '';
const SYSTEMS_CONFIG_PARAM = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';

// ─── Constantes de tiempo ───
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PRESIGNED_URL_EXPIRY = 7 * 24 * 60 * 60; // 7 días en segundos

// ─── H25: Mapeo de controles de compliance (SOX / ISO 27001 / ITIL) ───
// Cada control define qué indicadores (tipos de actividad de Avvale SAP AlwaysOps)
// sirven como evidencia de cumplimiento. Se usa para generar el reporte
// automático de compliance mapping en cada auditoría semanal.
const COMPLIANCE_CONTROLS = {
  // SOX (Sarbanes-Oxley) — Controles generales de TI financiera
  SOX: {
    'SOX-ITGC-01': { name: 'Change Management', description: 'Todos los cambios en sistemas SAP requieren aprobación documentada',
      indicators: ['approval_requests', 'approval_results', 'runbook_executions'] },
    'SOX-ITGC-02': { name: 'Access Control', description: 'Acceso a funciones críticas requiere autenticación y autorización',
      indicators: ['auth_events', 'admin_actions'] },
    'SOX-ITGC-03': { name: 'Computer Operations', description: 'Monitoreo continuo de sistemas y respuesta automatizada a incidentes',
      indicators: ['breach_detections', 'runbook_executions', 'sla_metrics'] },
    'SOX-ITGC-04': { name: 'Backup & Recovery', description: 'Respaldos programados verificados y DR drill ejecutados',
      indicators: ['scheduled_backups', 'backup_verifications', 'dr_drills'] },
    'SOX-ITGC-05': { name: 'Segregation of Duties', description: 'Separación entre quien solicita y quien aprueba acciones',
      indicators: ['approval_requests', 'escalation_events'] },
  },

  // ISO 27001 — Gestión de Seguridad de la Información
  ISO27001: {
    'A.8.1': { name: 'Asset Management', description: 'Inventario y clasificación de activos de información SAP',
      indicators: ['system_inventory', 'system_classifications'] },
    'A.9.4': { name: 'System Access Control', description: 'Control de acceso a sistemas y aplicaciones',
      indicators: ['auth_events', 'admin_actions', 'approval_requests'] },
    'A.12.1': { name: 'Operational Procedures', description: 'Procedimientos operacionales documentados y automatizados',
      indicators: ['runbook_executions', 'scheduled_operations'] },
    'A.12.4': { name: 'Logging & Monitoring', description: 'Registro de eventos y monitoreo de sistemas',
      indicators: ['breach_detections', 'metric_collections', 'audit_logs'] },
    'A.12.6': { name: 'Vulnerability Management', description: 'Gestión de vulnerabilidades técnicas',
      indicators: ['certificate_checks', 'security_patches', 'capacity_forecasts'] },
    'A.16.1': { name: 'Incident Management', description: 'Gestión de incidentes de seguridad de información',
      indicators: ['breach_detections', 'escalation_events', 'runbook_executions'] },
    'A.17.1': { name: 'Business Continuity', description: 'Continuidad del negocio y disponibilidad',
      indicators: ['ha_failovers', 'sla_metrics', 'dr_drills'] },
  },

  // ITIL v4 — Gestión de Servicios de TI
  ITIL: {
    'INC-MGT': { name: 'Incident Management', description: 'Detección, registro, categorización y resolución de incidentes',
      indicators: ['breach_detections', 'runbook_executions', 'escalation_events'] },
    'PRB-MGT': { name: 'Problem Management', description: 'Análisis de causa raíz y gestión proactiva de problemas',
      indicators: ['root_cause_analyses', 'capacity_forecasts', 'trend_analyses'] },
    'CHG-MGT': { name: 'Change Management', description: 'Control de cambios con evaluación de riesgo y aprobación',
      indicators: ['approval_requests', 'approval_results', 'safety_gate_evaluations'] },
    'SLM': { name: 'Service Level Management', description: 'Gestión y monitoreo de niveles de servicio',
      indicators: ['sla_metrics', 'availability_reports'] },
    'CAP-MGT': { name: 'Capacity Management', description: 'Planificación de capacidad y gestión de recursos',
      indicators: ['capacity_forecasts', 'metric_trends'] },
  },
};

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: queryLastWeek
//  Lee todos los registros de una tabla DynamoDB de los últimos
//  7 días. Usa paginación con LastEvaluatedKey para manejar
//  datasets grandes sin perder datos.
//
//  Las tablas de Avvale SAP AlwaysOps usan pk como partition key y
//  sk como sort key (ISO timestamp). Hacemos un Scan con
//  filtro por fecha porque necesitamos datos de TODOS los
//  sistemas (no un solo pk).
// ═══════════════════════════════════════════════════════════════

async function queryLastWeek(tableName) {
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const allItems = [];
  let lastEvaluatedKey = undefined;

  log.info('QUERY_TABLE_START', { tableName, since });

  try {
    do {
      const params = {
        TableName: tableName,
        FilterExpression: 'sk >= :since',
        ExpressionAttributeValues: {
          ':since': since,
        },
      };

      // Si hay más páginas, continuar desde donde quedamos
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      // v1.5 — Scan retained: audit-reporter is a weekly batch job processing all records.
      // Scan is acceptable for batch reports. For hot-path queries, use GSI-backed Query.
      const result = await ddbDoc.send(new ScanCommand(params));
      const items = result.Items || [];
      allItems.push(...items);

      lastEvaluatedKey = result.LastEvaluatedKey;

      log.info('QUERY_TABLE_PAGE', {
        tableName,
        itemsInPage: items.length,
        totalSoFar: allItems.length,
        hasMorePages: !!lastEvaluatedKey,
      });
    } while (lastEvaluatedKey);

    log.info('QUERY_TABLE_COMPLETE', { tableName, totalItems: allItems.length });
    return { success: true, items: allItems, error: null };

  } catch (err) {
    log.error('QUERY_TABLE_FAILED', { tableName, error: err.message });
    return { success: false, items: [], error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: loadSystemsConfig
//  Carga la configuración de sistemas desde SSM Parameter Store.
//  Se usa para enriquecer los reportes con nombres de sistemas.
// ═══════════════════════════════════════════════════════════════

async function loadSystemsConfig() {
  try {
    const param = await ssm.send(new GetParameterCommand({
      Name: SYSTEMS_CONFIG_PARAM,
      WithDecryption: true,
    }));
    return JSON.parse(param.Parameter.Value);
  } catch (err) {
    log.warn('CONFIG_LOAD_FAILED', { error: err.message });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generateExecutiveSummary
//  Genera el resumen ejecutivo a partir de los datos crudos.
//  Calcula totales, promedios y tasas de resolución.
// ═══════════════════════════════════════════════════════════════

function generateExecutiveSummary(data) {
  const { incidents, approvals, executions, advisorResults } = data;

  // ─── Contar incidentes por severidad ───
  const totalIncidents = incidents.length;
  const bySeverity = {
    CRITICAL: incidents.filter(i => i.severity === 'CRITICAL').length,
    HIGH: incidents.filter(i => i.severity === 'HIGH').length,
    WARNING: incidents.filter(i => i.severity === 'WARNING').length,
    PREDICTIVE: incidents.filter(i => i.severity === 'PREDICTIVE').length,
  };

  // ─── Auto-resueltos vs humano ───
  const autoResolved = executions.filter(e => e.autoExecuted === true).length;
  const humanApproved = approvals.filter(a => a.status === 'APPROVED').length;
  const humanRejected = approvals.filter(a => a.status === 'REJECTED').length;
  const pendingApprovals = approvals.filter(a => a.status === 'PENDING').length;
  const expiredApprovals = approvals.filter(a => a.status === 'EXPIRED').length;

  // ─── Tiempo de respuesta promedio (desde creación del incidente hasta ejecución) ───
  let totalResponseTimeMs = 0;
  let responseTimeCount = 0;

  for (const exec of executions) {
    if (exec.executedAt && exec.sk) {
      // sk contiene el timestamp de creación
      const createdAt = new Date(exec.sk.split('#')[0]);
      const executedAt = new Date(exec.executedAt);
      const diffMs = executedAt - createdAt;

      if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) { // Ignorar outliers > 24h
        totalResponseTimeMs += diffMs;
        responseTimeCount++;
      }
    }
  }

  const avgResponseTimeSec = responseTimeCount > 0
    ? Math.round(totalResponseTimeMs / responseTimeCount / 1000)
    : 0;

  // ─── Tasa de éxito de ejecuciones ───
  const successfulExecs = executions.filter(e => e.success === true).length;
  const failedExecs = executions.filter(e => e.success === false).length;
  const totalExecs = executions.length;
  const successRate = totalExecs > 0 ? Math.round((successfulExecs / totalExecs) * 100) : 0;

  // ─── Safety Gate (UC3) ───
  const safetyGateResults = advisorResults.filter(r => r.useCase === 'UC3');
  const safeDecisions = safetyGateResults.filter(r => r.result?.decision === 'SAFE').length;
  const riskyDecisions = safetyGateResults.filter(r => r.result?.decision === 'RISKY').length;
  const humanRequiredDecisions = safetyGateResults.filter(r => r.result?.decision === 'REQUIRES_HUMAN').length;

  // ─── Sistemas únicos afectados ───
  const affectedSystems = [...new Set(incidents.map(i => i.systemId).filter(Boolean))];

  return {
    reportPeriod: {
      from: new Date(Date.now() - SEVEN_DAYS_MS).toISOString(),
      to: new Date().toISOString(),
    },
    totalIncidents,
    bySeverity,
    autoResolved,
    humanApproved,
    humanRejected,
    pendingApprovals,
    expiredApprovals,
    avgResponseTimeSec,
    avgResponseTimeFormatted: formatDuration(avgResponseTimeSec),
    totalExecutions: totalExecs,
    successfulExecutions: successfulExecs,
    failedExecutions: failedExecs,
    successRate,
    safetyGate: {
      total: safetyGateResults.length,
      safe: safeDecisions,
      risky: riskyDecisions,
      requiresHuman: humanRequiredDecisions,
    },
    affectedSystems,
    affectedSystemCount: affectedSystems.length,
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: formatDuration
//  Convierte segundos a formato legible (ej: "2m 30s")
// ═══════════════════════════════════════════════════════════════

function formatDuration(totalSeconds) {
  if (totalSeconds === 0) return 'N/A';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: calculateHealthScore
//  Calcula un puntaje de salud por sistema (0-100).
//  Basado en: cantidad de incidentes, tiempo de respuesta,
//  tasa de resolución exitosa.
//
//  Fórmula:
//  - Base: 100 puntos
//  - -5 por cada incidente CRITICAL
//  - -3 por cada incidente HIGH
//  - -1 por cada incidente WARNING
//  - -10 si tasa de éxito < 80%
//  - -5 si tiempo de respuesta promedio > 300s (5min)
//  - Mínimo: 0
// ═══════════════════════════════════════════════════════════════

function calculateHealthScore(incidents, executions) {
  // Agrupar por sistema
  const systems = {};

  // Recopilar incidentes por sistema
  for (const inc of incidents) {
    const sysId = inc.systemId || 'UNKNOWN';
    if (!systems[sysId]) {
      systems[sysId] = { incidents: [], executions: [], score: 100 };
    }
    systems[sysId].incidents.push(inc);
  }

  // Recopilar ejecuciones por sistema
  for (const exec of executions) {
    const sysId = exec.systemId || 'UNKNOWN';
    if (!systems[sysId]) {
      systems[sysId] = { incidents: [], executions: [], score: 100 };
    }
    systems[sysId].executions.push(exec);
  }

  // Calcular puntaje por sistema
  const scores = {};
  for (const [sysId, data] of Object.entries(systems)) {
    let score = 100;

    // Penalizar por incidentes según severidad
    const criticals = data.incidents.filter(i => i.severity === 'CRITICAL').length;
    const highs = data.incidents.filter(i => i.severity === 'HIGH').length;
    const warnings = data.incidents.filter(i => i.severity === 'WARNING').length;

    score -= criticals * 5;
    score -= highs * 3;
    score -= warnings * 1;

    // Penalizar por tasa de éxito baja en ejecuciones
    if (data.executions.length > 0) {
      const successRate = data.executions.filter(e => e.success === true).length / data.executions.length;
      if (successRate < 0.8) {
        score -= 10;
      }
    }

    // Penalizar si hay muchas ejecuciones fallidas
    const failedCount = data.executions.filter(e => e.success === false).length;
    score -= failedCount * 2;

    // Asegurar que el puntaje esté entre 0 y 100
    score = Math.max(0, Math.min(100, score));

    scores[sysId] = {
      score,
      label: score >= 90 ? 'EXCELENTE' : score >= 70 ? 'BUENO' : score >= 50 ? 'REGULAR' : 'CRÍTICO',
      color: score >= 90 ? '#28a745' : score >= 70 ? '#17a2b8' : score >= 50 ? '#ffc107' : '#dc3545',
      totalIncidents: data.incidents.length,
      criticalIncidents: criticals,
      totalExecutions: data.executions.length,
      failedExecutions: failedCount,
    };
  }

  return scores;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: calculateSlaMetrics (v1.6)
//  Calcula métricas SLA por sistema:
//  - Uptime %: porcentaje del tiempo sin breaches CRITICAL
//  - MTTR: tiempo promedio desde breach hasta resolución exitosa
//  - Incidentes/semana: conteo de incidentes por sistema
//  - MTBF: tiempo promedio entre fallos (Mean Time Between Failures)
// ═══════════════════════════════════════════════════════════════

function calculateSlaMetrics(incidents, executions) {
  const systems = {};
  const periodMs = SEVEN_DAYS_MS;
  const periodHours = 7 * 24; // 168 horas

  // Agrupar incidentes y ejecuciones por sistema
  for (const inc of incidents) {
    const sysId = inc.systemId || 'UNKNOWN';
    if (!systems[sysId]) systems[sysId] = { incidents: [], executions: [], criticalPeriods: [] };
    systems[sysId].incidents.push(inc);
  }

  for (const exec of executions) {
    const sysId = exec.systemId || 'UNKNOWN';
    if (!systems[sysId]) systems[sysId] = { incidents: [], executions: [], criticalPeriods: [] };
    systems[sysId].executions.push(exec);
  }

  const slaResults = {};

  for (const [sysId, data] of Object.entries(systems)) {
    // ─── MTTR: tiempo promedio de recuperación ───
    let totalRecoveryMs = 0;
    let recoveryCount = 0;

    for (const exec of data.executions) {
      if (exec.success === true && exec.executedAt && exec.sk) {
        const createdAt = new Date(exec.sk.split('#')[0]);
        const resolvedAt = new Date(exec.executedAt);
        const diffMs = resolvedAt - createdAt;
        if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
          totalRecoveryMs += diffMs;
          recoveryCount++;
        }
      }
    }

    const mttrSec = recoveryCount > 0 ? Math.round(totalRecoveryMs / recoveryCount / 1000) : 0;

    // ─── Uptime %: estimar horas sin CRITICAL breaches ───
    const criticals = data.incidents.filter(i => i.severity === 'CRITICAL');
    // Estimar downtime: cada incidente CRITICAL = ~mttr de duración (o 15 min mínimo)
    const downtimePerIncidentMin = mttrSec > 0 ? Math.ceil(mttrSec / 60) : 15;
    const totalDowntimeMin = criticals.length * downtimePerIncidentMin;
    const uptimePct = Math.max(0, Math.min(100,
      parseFloat(((1 - totalDowntimeMin / (periodHours * 60)) * 100).toFixed(3))
    ));

    // ─── MTBF: tiempo promedio entre fallos ───
    const sortedIncidents = data.incidents
      .map(i => new Date(i.sk?.split('#')[0] || i.timestamp || 0).getTime())
      .filter(t => t > 0)
      .sort((a, b) => a - b);

    let mtbfHours = 0;
    if (sortedIncidents.length >= 2) {
      let totalGapMs = 0;
      for (let i = 1; i < sortedIncidents.length; i++) {
        totalGapMs += sortedIncidents[i] - sortedIncidents[i - 1];
      }
      mtbfHours = parseFloat((totalGapMs / (sortedIncidents.length - 1) / (1000 * 60 * 60)).toFixed(1));
    }

    slaResults[sysId] = {
      uptimePct,
      uptimeLabel: uptimePct >= 99.9 ? 'EXCELENTE' : uptimePct >= 99 ? 'BUENO' : uptimePct >= 95 ? 'ACEPTABLE' : 'CRÍTICO',
      mttrSec,
      mttrFormatted: formatDuration(mttrSec),
      mtbfHours,
      totalIncidents: data.incidents.length,
      criticalIncidents: criticals.length,
      highIncidents: data.incidents.filter(i => i.severity === 'HIGH').length,
      totalRemediations: data.executions.length,
      successfulRemediations: data.executions.filter(e => e.success === true).length,
    };
  }

  return slaResults;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: calculateCostImpact
//  Calcula el costo total estimado de las expansiones EBS
//  aprobadas durante la semana.
// ═══════════════════════════════════════════════════════════════

function calculateCostImpact(approvals) {
  let totalMonthlyCost = 0;
  const costItems = [];

  const approvedWithCost = approvals.filter(
    a => a.status === 'APPROVED' && a.costEstimate && a.costEstimate.costUsd > 0
  );

  for (const approval of approvedWithCost) {
    totalMonthlyCost += approval.costEstimate.costUsd;
    costItems.push({
      systemId: approval.systemId,
      runbookId: approval.runbookId,
      costUsd: approval.costEstimate.costUsd,
      description: approval.costEstimate.description,
      approvedBy: approval.processedBy || 'N/A',
      approvedAt: approval.processedAt || 'N/A',
    });
  }

  return {
    totalMonthlyCostUsd: parseFloat(totalMonthlyCost.toFixed(2)),
    totalAnnualCostUsd: parseFloat((totalMonthlyCost * 12).toFixed(2)),
    approvedExpansions: costItems.length,
    details: costItems,
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: calculateOperationalCosts (v1.6)
//  Estima el costo mensual de operación de Avvale SAP AlwaysOps basándose
//  en el uso real: invocaciones Lambda, lecturas DynamoDB,
//  métricas CloudWatch, y SNS notifications.
//
//  Precios us-east-1 (Feb 2026):
//  - Lambda: $0.0000002/req + $0.0000166667/GB-sec (128MB arm64)
//  - DynamoDB on-demand: $1.25/M writes, $0.25/M reads
//  - CloudWatch: $0.30/metric/mes custom, $0.01/1000 GetMetricData
//  - SNS: $0.50/M notifications
// ═══════════════════════════════════════════════════════════════

function calculateOperationalCosts(incidents, executions, systemsCount) {
  // Estimaciones basadas en uso semanal → mensual (x4.3)
  const weeksPerMonth = 4.3;

  // Lambda: 14 funciones, ~collector cada 5min (8640/mes), otros menor frecuencia
  const collectorInvocations = systemsCount * 8640; // 5min x 24h x 30d
  const preventiveInvocations = systemsCount * 1440; // 30min x 24h x 30d
  const otherInvocations = incidents.length * weeksPerMonth * 5; // runbook, approval, email, etc.
  const totalInvocations = collectorInvocations + preventiveInvocations + otherInvocations;
  const lambdaCost = totalInvocations * 0.0000002 + totalInvocations * 0.5 * 0.0000166667; // 128MB ~0.5s avg

  // DynamoDB: writes (métricas, incidentes, ejecuciones) + reads (dedup, config)
  const ddbWritesPerMonth = (incidents.length * weeksPerMonth * 3) + (executions.length * weeksPerMonth * 2) + collectorInvocations;
  const ddbReadsPerMonth = ddbWritesPerMonth * 2; // ~2 reads per write para dedup
  const ddbCost = (ddbWritesPerMonth / 1000000 * 1.25) + (ddbReadsPerMonth / 1000000 * 0.25);

  // CloudWatch: custom metrics (46 thresholds x sistemas) + GetMetricData
  const cwMetrics = 46 * systemsCount; // métricas custom activas
  const cwCost = cwMetrics * 0.30 + preventiveInvocations * 46 * 0.01 / 1000; // GetMetricData

  // SNS: alertas + notificaciones
  const snsNotifications = (incidents.length * weeksPerMonth * 3); // breach + runbook result + email
  const snsCost = snsNotifications / 1000000 * 0.50;

  const totalMonthlyCost = lambdaCost + ddbCost + cwCost + snsCost;

  return {
    totalMonthlyCostUsd: parseFloat(totalMonthlyCost.toFixed(2)),
    breakdown: {
      lambda: { invocations: Math.round(totalInvocations), costUsd: parseFloat(lambdaCost.toFixed(2)) },
      dynamodb: { writes: Math.round(ddbWritesPerMonth), reads: Math.round(ddbReadsPerMonth), costUsd: parseFloat(ddbCost.toFixed(2)) },
      cloudwatch: { customMetrics: cwMetrics, costUsd: parseFloat(cwCost.toFixed(2)) },
      sns: { notifications: Math.round(snsNotifications), costUsd: parseFloat(snsCost.toFixed(2)) },
    },
    systemsMonitored: systemsCount,
    costPerSystem: systemsCount > 0 ? parseFloat((totalMonthlyCost / systemsCount).toFixed(2)) : 0,
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: calculateComplianceScorecard (v1.7)
//  Genera un scorecard de cumplimiento por sistema evaluando:
//  1. Backup Compliance: % de tiempo con backup < umbral
//  2. Runbook Success Rate: % de ejecuciones exitosas
//  3. Response Time: puntuación basada en MTTR
//  4. Uptime Score: puntuación basada en SLA uptime %
//  Score final: promedio ponderado 0-100 con letra (A-F)
// ═══════════════════════════════════════════════════════════════

function calculateComplianceScorecard(incidents, executions, slaMetrics) {
  const scorecard = {};

  // Agrupar incidentes y ejecuciones por sistema
  const bySystem = {};
  for (const inc of incidents) {
    const sysId = inc.systemId || 'UNKNOWN';
    if (!bySystem[sysId]) bySystem[sysId] = { incidents: [], executions: [] };
    bySystem[sysId].incidents.push(inc);
  }
  for (const exec of executions) {
    const sysId = exec.systemId || 'UNKNOWN';
    if (!bySystem[sysId]) bySystem[sysId] = { incidents: [], executions: [] };
    bySystem[sysId].executions.push(exec);
  }

  for (const [sysId, data] of Object.entries(bySystem)) {
    const sla = slaMetrics[sysId] || {};

    // 1. Backup Compliance (25%) — sin incidentes de backup = 100
    const backupIncidents = data.incidents.filter(i =>
      (i.metricName || '').includes('LastBackup')
    );
    const backupScore = backupIncidents.length === 0 ? 100 :
      Math.max(0, 100 - backupIncidents.length * 15);

    // 2. Runbook Success Rate (25%)
    const totalExecs = data.executions.length;
    const successExecs = data.executions.filter(e => e.success === true).length;
    const runbookScore = totalExecs > 0 ? Math.round((successExecs / totalExecs) * 100) : 100;

    // 3. Response Time (25%) — basado en MTTR
    const mttrSec = sla.mttrSec || 0;
    let responseScore = 100;
    if (mttrSec > 3600) responseScore = 20;
    else if (mttrSec > 1800) responseScore = 50;
    else if (mttrSec > 600) responseScore = 70;
    else if (mttrSec > 120) responseScore = 90;

    // 4. Uptime Score (25%)
    const uptimePct = sla.uptimePct || 100;
    let uptimeScore = 100;
    if (uptimePct < 95) uptimeScore = 20;
    else if (uptimePct < 99) uptimeScore = 50;
    else if (uptimePct < 99.5) uptimeScore = 70;
    else if (uptimePct < 99.9) uptimeScore = 90;

    // Score final ponderado
    const finalScore = Math.round(
      backupScore * 0.25 + runbookScore * 0.25 + responseScore * 0.25 + uptimeScore * 0.25
    );

    // Letra de calificación
    let grade = 'F';
    if (finalScore >= 90) grade = 'A';
    else if (finalScore >= 80) grade = 'B';
    else if (finalScore >= 70) grade = 'C';
    else if (finalScore >= 60) grade = 'D';

    scorecard[sysId] = {
      finalScore,
      grade,
      breakdown: {
        backup: { score: backupScore, incidents: backupIncidents.length },
        runbook: { score: runbookScore, total: totalExecs, success: successExecs },
        responseTime: { score: responseScore, mttrSec },
        uptime: { score: uptimeScore, uptimePct },
      },
    };
  }

  return scorecard;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generateComplianceReport (H25)
//  Genera un reporte de compliance mapping contra tres frameworks:
//  SOX (Sarbanes-Oxley), ISO 27001 e ITIL v4.
//
//  Para cada control de cada framework, cuenta la evidencia
//  disponible en los datos de la semana (incidentes, aprobaciones,
//  ejecuciones, resultados del advisor) y calcula un puntaje
//  de cumplimiento (0-100%).
//
//  Niveles:
//  - COMPLIANT (>=80%): cumplimiento adecuado
//  - PARTIAL (>=50%): cumplimiento parcial, requiere atención
//  - NON_COMPLIANT (<50%): incumplimiento, acción requerida
// ═══════════════════════════════════════════════════════════════

function generateComplianceReport(incidents, approvals, executions, advisorResults) {
  const now = new Date();

  // ─── Mapear los datos reales a los tipos de indicador ───
  // Cada indicador del COMPLIANCE_CONTROLS se asocia a datos concretos
  // que ya fueron consultados desde DynamoDB.
  const indicatorCounts = {
    // Aprobaciones y resultados de aprobación
    approval_requests: approvals.length,
    approval_results: approvals.filter(a => a.status === 'APPROVED' || a.status === 'REJECTED').length,

    // Ejecuciones de runbook
    runbook_executions: executions.length,

    // Eventos de autenticación (incidentes con metricName de auth)
    auth_events: incidents.filter(i => (i.metricName || '').toLowerCase().includes('auth') || (i.metricName || '').toLowerCase().includes('login')).length,

    // Acciones administrativas (aprobaciones procesadas por un administrador)
    admin_actions: approvals.filter(a => a.processedBy && a.processedBy !== 'SYSTEM').length,

    // Detección de breaches (incidentes CRITICAL o HIGH)
    breach_detections: incidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length,

    // Métricas SLA (presencia de datos de ejecuciones exitosas)
    sla_metrics: executions.filter(e => e.success === true).length,

    // Backups programados (incidentes relacionados con backup)
    scheduled_backups: incidents.filter(i => (i.metricName || '').toLowerCase().includes('backup')).length,

    // Verificaciones de backup (ejecuciones de runbook de backup)
    backup_verifications: executions.filter(e => (e.runbookId || '').toLowerCase().includes('backup')).length,

    // DR drills (ejecuciones de disaster recovery)
    dr_drills: executions.filter(e => (e.runbookId || '').toLowerCase().includes('dr') || (e.runbookId || '').toLowerCase().includes('disaster')).length,

    // Eventos de escalación (aprobaciones expiradas o con escalación)
    escalation_events: approvals.filter(a => a.status === 'EXPIRED' || a.escalated === true).length,

    // Inventario de sistemas (sistemas únicos con actividad)
    system_inventory: [...new Set(incidents.map(i => i.systemId).filter(Boolean))].length,

    // Clasificaciones de sistemas
    system_classifications: [...new Set(incidents.map(i => i.systemId).filter(Boolean))].length,

    // Operaciones programadas (ejecuciones automáticas)
    scheduled_operations: executions.filter(e => e.autoExecuted === true).length,

    // Recolección de métricas (todos los incidentes representan métricas recolectadas)
    metric_collections: incidents.length,

    // Logs de auditoría (aprobaciones + ejecuciones = trazabilidad)
    audit_logs: approvals.length + executions.length,

    // Verificaciones de certificados
    certificate_checks: incidents.filter(i => (i.metricName || '').toLowerCase().includes('cert') || (i.metricName || '').toLowerCase().includes('ssl')).length,

    // Parches de seguridad
    security_patches: executions.filter(e => (e.runbookId || '').toLowerCase().includes('patch') || (e.runbookId || '').toLowerCase().includes('security')).length,

    // Pronósticos de capacidad (incidentes predictivos)
    capacity_forecasts: incidents.filter(i => i.severity === 'PREDICTIVE').length,

    // Failovers de alta disponibilidad
    ha_failovers: executions.filter(e => (e.runbookId || '').toLowerCase().includes('failover') || (e.runbookId || '').toLowerCase().includes('ha-')).length,

    // Análisis de causa raíz (resultados del advisor UC2)
    root_cause_analyses: advisorResults.filter(r => r.useCase === 'UC2').length,

    // Análisis de tendencias (resultados del advisor UC1)
    trend_analyses: advisorResults.filter(r => r.useCase === 'UC1').length,

    // Evaluaciones de safety gate (resultados del advisor UC3)
    safety_gate_evaluations: advisorResults.filter(r => r.useCase === 'UC3').length,

    // Reportes de disponibilidad (ejecuciones exitosas = sistema disponible)
    availability_reports: executions.filter(e => e.success === true).length,

    // Tendencias de métricas (incidentes WARNING + PREDICTIVE = análisis proactivo)
    metric_trends: incidents.filter(i => i.severity === 'WARNING' || i.severity === 'PREDICTIVE').length,
  };

  // ─── Construir el reporte por framework ───
  const frameworks = {};
  let totalControls = 0;
  let compliantCount = 0;
  let partialCount = 0;
  let nonCompliantCount = 0;

  for (const [frameworkName, controls] of Object.entries(COMPLIANCE_CONTROLS)) {
    const controlResults = [];

    for (const [controlId, controlDef] of Object.entries(controls)) {
      totalControls++;

      // Contar evidencia disponible para cada indicador del control
      let totalEvidence = 0;
      let indicatorsWithEvidence = 0;
      const evidenceDetails = [];

      for (const indicator of controlDef.indicators) {
        const count = indicatorCounts[indicator] || 0;
        totalEvidence += count;
        if (count > 0) {
          indicatorsWithEvidence++;
        }
        evidenceDetails.push({
          indicator,
          count,
          hasEvidence: count > 0,
        });
      }

      // Calcular score de compliance (0-100)
      // Basado en: qué porcentaje de los indicadores tienen evidencia
      // Cada indicador con evidencia contribuye proporcionalmente
      const totalIndicators = controlDef.indicators.length;
      const coverageScore = totalIndicators > 0
        ? Math.round((indicatorsWithEvidence / totalIndicators) * 100)
        : 0;

      // Determinar estado según el score
      let status;
      if (coverageScore >= 80) {
        status = 'COMPLIANT';
        compliantCount++;
      } else if (coverageScore >= 50) {
        status = 'PARTIAL';
        partialCount++;
      } else {
        status = 'NON_COMPLIANT';
        nonCompliantCount++;
      }

      controlResults.push({
        controlId,
        name: controlDef.name,
        description: controlDef.description,
        score: coverageScore,
        status,
        totalEvidence,
        indicatorsWithEvidence,
        totalIndicators,
        evidenceDetails,
      });
    }

    // Score general del framework = promedio de sus controles
    const frameworkScore = controlResults.length > 0
      ? Math.round(controlResults.reduce((sum, c) => sum + c.score, 0) / controlResults.length)
      : 0;

    const frameworkStatus = frameworkScore >= 80 ? 'COMPLIANT' :
      frameworkScore >= 50 ? 'PARTIAL' : 'NON_COMPLIANT';

    frameworks[frameworkName] = {
      controls: controlResults,
      overallScore: frameworkScore,
      status: frameworkStatus,
    };
  }

  // Score de compliance general
  const overallComplianceRate = totalControls > 0
    ? Math.round((compliantCount / totalControls) * 100)
    : 0;

  return {
    generatedAt: now.toISOString(),
    period: {
      from: new Date(Date.now() - SEVEN_DAYS_MS).toISOString(),
      to: now.toISOString(),
    },
    frameworks,
    summary: {
      totalControls,
      compliant: compliantCount,
      partial: partialCount,
      nonCompliant: nonCompliantCount,
      overallComplianceRate,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generateComplianceSection (H25)
//  Genera la sección HTML del reporte de compliance mapping.
//  Muestra una tabla por framework con controles, estado
//  (badge con color), evidencia y score.
// ═══════════════════════════════════════════════════════════════

function generateComplianceSection(complianceReport) {
  if (!complianceReport || !complianceReport.frameworks) {
    return '';
  }

  // ─── Colores para los badges de estado ───
  const statusColors = {
    COMPLIANT: '#28a745',
    PARTIAL: '#ffc107',
    NON_COMPLIANT: '#dc3545',
  };

  const statusLabels = {
    COMPLIANT: 'Cumple',
    PARTIAL: 'Parcial',
    NON_COMPLIANT: 'No Cumple',
  };

  // ─── Nombres legibles de los frameworks ───
  const frameworkLabels = {
    SOX: 'SOX (Sarbanes-Oxley)',
    ISO27001: 'ISO 27001',
    ITIL: 'ITIL v4',
  };

  // ─── Resumen general de compliance ───
  const summary = complianceReport.summary;
  let html = `
    <!-- Sección H25: Compliance Mapping -->
    <div class="section">
      <div class="section-header" style="background:#6f42c1;">Compliance Mapping &mdash; SOX / ISO 27001 / ITIL (H25)</div>
      <div class="section-body">
        <div style="padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee;">
          <strong>Controles evaluados:</strong> ${summary.totalControls} &nbsp; | &nbsp;
          <span style="color:#28a745;font-weight:bold;">Cumple: ${summary.compliant}</span> &nbsp; | &nbsp;
          <span style="color:#ffc107;font-weight:bold;">Parcial: ${summary.partial}</span> &nbsp; | &nbsp;
          <span style="color:#dc3545;font-weight:bold;">No Cumple: ${summary.nonCompliant}</span> &nbsp; | &nbsp;
          <strong>Tasa de cumplimiento:</strong> ${summary.overallComplianceRate}%
        </div>`;

  // ─── Una tabla por cada framework ───
  for (const [frameworkName, frameworkData] of Object.entries(complianceReport.frameworks)) {
    const fwLabel = frameworkLabels[frameworkName] || frameworkName;
    const fwStatusColor = statusColors[frameworkData.status] || '#6c757d';

    html += `
        <div style="padding:12px 20px;background:#e9ecef;border-bottom:1px solid #dee2e6;margin-top:2px;">
          <strong>${fwLabel}</strong>
          <span style="display:inline-block;padding:2px 10px;border-radius:4px;background:${fwStatusColor};color:#fff;font-size:11px;font-weight:bold;margin-left:12px;">${frameworkData.overallScore}% &mdash; ${statusLabels[frameworkData.status] || frameworkData.status}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Control ID</th>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Evidencia</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>`;

    frameworkData.controls.forEach((ctrl, idx) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      const badgeColor = statusColors[ctrl.status] || '#6c757d';
      const badgeLabel = statusLabels[ctrl.status] || ctrl.status;

      html += `
            <tr style="background:${bgColor};">
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-weight:bold;">${ctrl.controlId}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;" title="${ctrl.description}">${ctrl.name}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${badgeColor};color:#fff;font-size:11px;font-weight:bold;">${badgeLabel}</span></td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${ctrl.totalEvidence} (${ctrl.indicatorsWithEvidence}/${ctrl.totalIndicators} indicadores)</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">${ctrl.score}%</td>
            </tr>`;
    });

    html += `
          </tbody>
        </table>`;
  }

  html += `
      </div>
    </div>`;

  return html;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generateHtmlReport
//  Genera un reporte HTML standalone con CSS inline.
//  Tema profesional azul/naranja con branding Avvale SAP AlwaysOps.
// ═══════════════════════════════════════════════════════════════

function generateHtmlReport(reportData) {
  const { summary, incidentsTimeline, executionsBySystem, approvalAudit, safetyGateDecisions, healthScores, slaMetrics, costImpact, operationalCosts, complianceScorecard, errors, reportDate, weekNumber } = reportData;

  // ─── Función auxiliar para badges de severidad ───
  function severityBadge(severity) {
    const colors = {
      CRITICAL: '#dc3545',
      HIGH: '#fd7e14',
      WARNING: '#ffc107',
      PREDICTIVE: '#007bff',
    };
    const color = colors[severity] || '#6c757d';
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-size:11px;font-weight:bold;">${severity}</span>`;
  }

  // ─── Función auxiliar para barras de progreso del health score ───
  function healthBar(score, color) {
    return `<div style="background:#e9ecef;border-radius:4px;overflow:hidden;height:20px;width:200px;display:inline-block;vertical-align:middle;">
      <div style="background:${color};height:100%;width:${score}%;transition:width 0.3s;"></div>
    </div> <strong>${score}/100</strong>`;
  }

  // ─── Construir filas de la tabla de incidentes ───
  let incidentsRows = '';
  if (incidentsTimeline.length === 0) {
    incidentsRows = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Sin incidentes en los &uacute;ltimos 7 d&iacute;as</td></tr>';
  } else {
    incidentsTimeline.forEach((inc, idx) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      const timestamp = inc.sk ? inc.sk.split('#')[0] : inc.timestamp || 'N/A';
      incidentsRows += `<tr style="background:${bgColor};">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${timestamp}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inc.systemId || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${severityBadge(inc.severity || 'N/A')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inc.metricName || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inc.value !== undefined ? inc.value : 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inc.runbook || inc.runbookId || 'N/A'}</td>
      </tr>`;
    });
  }

  // ─── Construir filas de la tabla de ejecuciones por sistema ───
  let executionsRows = '';
  if (Object.keys(executionsBySystem).length === 0) {
    executionsRows = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Sin ejecuciones en los &uacute;ltimos 7 d&iacute;as</td></tr>';
  } else {
    let rowIdx = 0;
    for (const [sysId, sysExecs] of Object.entries(executionsBySystem)) {
      const total = sysExecs.length;
      const successful = sysExecs.filter(e => e.success === true).length;
      const failed = sysExecs.filter(e => e.success === false).length;
      const rate = total > 0 ? Math.round((successful / total) * 100) : 0;
      const bgColor = rowIdx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      const runbooks = [...new Set(sysExecs.map(e => e.runbookId).filter(Boolean))].join(', ');

      executionsRows += `<tr style="background:${bgColor};">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sysId}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${total}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#28a745;">${successful}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#dc3545;">${failed}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${rate}%</td>
      </tr>`;
      rowIdx++;
    }
  }

  // ─── Construir filas de auditoría de aprobaciones ───
  let approvalRows = '';
  if (approvalAudit.length === 0) {
    approvalRows = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">Sin solicitudes de aprobaci&oacute;n en los &uacute;ltimos 7 d&iacute;as</td></tr>';
  } else {
    approvalAudit.forEach((appr, idx) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      const statusColor = appr.status === 'APPROVED' ? '#28a745' : appr.status === 'REJECTED' ? '#dc3545' : appr.status === 'EXPIRED' ? '#6c757d' : '#ffc107';

      // Calcular tiempo de respuesta si fue procesado
      let responseTime = 'N/A';
      if (appr.processedAt && appr.createdAt) {
        const diffMs = new Date(appr.processedAt) - new Date(appr.createdAt);
        responseTime = formatDuration(Math.round(diffMs / 1000));
      }

      approvalRows += `<tr style="background:${bgColor};">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${appr.systemId || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${appr.runbookId || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${severityBadge(appr.severity || 'N/A')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;"><span style="color:${statusColor};font-weight:bold;">${appr.status || 'N/A'}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${appr.processedBy || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${responseTime}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${appr.costEstimate ? '$' + appr.costEstimate.costUsd + '/mes' : 'N/A'}</td>
      </tr>`;
    });
  }

  // ─── Construir filas de Safety Gate ───
  let safetyRows = '';
  if (safetyGateDecisions.length === 0) {
    safetyRows = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Sin decisiones Safety Gate en los &uacute;ltimos 7 d&iacute;as</td></tr>';
  } else {
    safetyGateDecisions.forEach((sg, idx) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      const decision = sg.result?.decision || 'N/A';
      const decisionColor = decision === 'SAFE' ? '#28a745' : decision === 'RISKY' ? '#fd7e14' : '#dc3545';

      safetyRows += `<tr style="background:${bgColor};">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sg.systemId || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sg.result?.runbookId || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;"><span style="color:${decisionColor};font-weight:bold;">${decision}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sg.result?.reason || 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sg.result?.hardRule ? 'Hard Rule' : sg.result?.bedrockUsed ? 'Bedrock IA' : 'Regla local'}</td>
      </tr>`;
    });
  }

  // ─── Construir sección de Health Scores ───
  let healthRows = '';
  if (Object.keys(healthScores).length === 0) {
    healthRows = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Sin datos de salud disponibles</td></tr>';
  } else {
    let rowIdx = 0;
    for (const [sysId, hs] of Object.entries(healthScores)) {
      const bgColor = rowIdx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      healthRows += `<tr style="background:${bgColor};">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sysId}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${healthBar(hs.score, hs.color)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;"><span style="color:${hs.color};font-weight:bold;">${hs.label}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${hs.totalIncidents} (${hs.criticalIncidents} cr&iacute;ticos)</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${hs.totalExecutions} (${hs.failedExecutions} fallidos)</td>
      </tr>`;
      rowIdx++;
    }
  }

  // ─── v1.6: Construir sección SLA Metrics ───
  let slaRows = '';
  if (!slaMetrics || Object.keys(slaMetrics).length === 0) {
    slaRows = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Sin datos SLA disponibles</td></tr>';
  } else {
    let rowIdx = 0;
    for (const [sysId, sla] of Object.entries(slaMetrics)) {
      const bgColor = rowIdx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      const uptimeColor = sla.uptimePct >= 99.9 ? '#28a745' : sla.uptimePct >= 99 ? '#17a2b8' : sla.uptimePct >= 95 ? '#ffc107' : '#dc3545';
      slaRows += `<tr style="background:${bgColor};">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sysId}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;"><span style="color:${uptimeColor};font-weight:bold;">${sla.uptimePct}%</span> (${sla.uptimeLabel})</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sla.mttrFormatted}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sla.mtbfHours > 0 ? sla.mtbfHours + 'h' : 'N/A'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sla.totalIncidents} (${sla.criticalIncidents} cr&iacute;ticos)</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${sla.successfulRemediations}/${sla.totalRemediations}</td>
      </tr>`;
      rowIdx++;
    }
  }

  // ─── Construir filas de costo ───
  let costRows = '';
  if (costImpact.details.length === 0) {
    costRows = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Sin costos de expansi&oacute;n aprobados esta semana</td></tr>';
  } else {
    costImpact.details.forEach((ci, idx) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      costRows += `<tr style="background:${bgColor};">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${ci.systemId}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${ci.runbookId}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">$${ci.costUsd}/mes</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${ci.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${ci.approvedBy}</td>
      </tr>`;
    });
  }

  // ─── Construir sección de errores si los hay ───
  let errorsSection = '';
  if (errors.length > 0) {
    const errorRows = errors.map(e =>
      `<li style="color:#dc3545;margin-bottom:4px;"><strong>${e.table}:</strong> ${e.error}</li>`
    ).join('');
    errorsSection = `
    <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;margin-bottom:24px;">
      <h3 style="color:#856404;margin-top:0;">Advertencias del reporte</h3>
      <p style="color:#856404;">Los siguientes or&iacute;genes de datos tuvieron errores. Los datos de estas tablas pueden estar incompletos:</p>
      <ul style="color:#856404;">${errorRows}</ul>
    </div>`;
  }

  // ─── HTML completo ───
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Avvale SAP AlwaysOps - Reporte de Auditor&iacute;a Semanal W${weekNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; color: #333; line-height: 1.6; }
    .container { max-width: 1100px; margin: 0 auto; padding: 20px; }

    /* Header con branding */
    .header { background: linear-gradient(135deg, #1a3a5c 0%, #2c5f8a 100%); color: #fff; padding: 32px; border-radius: 12px 12px 0 0; }
    .header h1 { font-size: 28px; margin-bottom: 4px; }
    .header .subtitle { font-size: 14px; opacity: 0.85; }
    .header .date-badge { display: inline-block; background: #e8741e; padding: 4px 12px; border-radius: 20px; font-size: 13px; margin-top: 8px; font-weight: bold; }

    /* Tarjetas de resumen */
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; border-top: 4px solid #1a3a5c; }
    .card .value { font-size: 32px; font-weight: bold; color: #1a3a5c; }
    .card .label { font-size: 13px; color: #666; margin-top: 4px; }
    .card.orange { border-top-color: #e8741e; }
    .card.orange .value { color: #e8741e; }
    .card.green { border-top-color: #28a745; }
    .card.green .value { color: #28a745; }
    .card.red { border-top-color: #dc3545; }
    .card.red .value { color: #dc3545; }

    /* Secciones */
    .section { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 24px; overflow: hidden; }
    .section-header { background: #1a3a5c; color: #fff; padding: 14px 20px; font-size: 16px; font-weight: bold; }
    .section-header.orange { background: #e8741e; }
    .section-body { padding: 0; }

    /* Tablas */
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f3f5; color: #333; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #dee2e6; }

    /* Footer */
    .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #eee; margin-top: 24px; }
    .footer strong { color: #1a3a5c; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>Avvale SAP AlwaysOps</h1>
      <div class="subtitle">Reporte de Auditor&iacute;a y Compliance Semanal</div>
      <div class="date-badge">Semana ${weekNumber} &mdash; ${reportDate}</div>
    </div>

    ${errorsSection}

    <!-- Tarjetas de resumen ejecutivo -->
    <div class="summary-cards">
      <div class="card">
        <div class="value">${summary.totalIncidents}</div>
        <div class="label">Total Incidentes</div>
      </div>
      <div class="card green">
        <div class="value">${summary.autoResolved}</div>
        <div class="label">Auto-resueltos</div>
      </div>
      <div class="card orange">
        <div class="value">${summary.humanApproved}</div>
        <div class="label">Aprobados por Humano</div>
      </div>
      <div class="card">
        <div class="value">${summary.avgResponseTimeFormatted}</div>
        <div class="label">Tiempo Respuesta Promedio</div>
      </div>
      <div class="card green">
        <div class="value">${summary.successRate}%</div>
        <div class="label">Tasa de &Eacute;xito</div>
      </div>
      <div class="card red">
        <div class="value">${summary.bySeverity.CRITICAL}</div>
        <div class="label">Incidentes CR&Iacute;TICOS</div>
      </div>
    </div>

    <!-- Sección 1: Timeline de Incidentes -->
    <div class="section">
      <div class="section-header">Incidents Timeline &mdash; &Uacute;ltimos 7 d&iacute;as</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Sistema</th>
              <th>Severidad</th>
              <th>M&eacute;trica</th>
              <th>Valor</th>
              <th>Runbook</th>
            </tr>
          </thead>
          <tbody>${incidentsRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Sección 2: Ejecuciones de Runbook por Sistema -->
    <div class="section">
      <div class="section-header">Runbook Executions &mdash; Por Sistema</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Total</th>
              <th>Exitosas</th>
              <th>Fallidas</th>
              <th>Tasa &Eacute;xito</th>
            </tr>
          </thead>
          <tbody>${executionsRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Sección 3: Auditoría de Aprobaciones -->
    <div class="section">
      <div class="section-header orange">Approval Audit &mdash; Solicitudes y Resultados</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Runbook</th>
              <th>Severidad</th>
              <th>Estado</th>
              <th>Procesado Por</th>
              <th>Tiempo Resp.</th>
              <th>Costo</th>
            </tr>
          </thead>
          <tbody>${approvalRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Sección 4: Decisiones Safety Gate (UC3) -->
    <div class="section">
      <div class="section-header">Safety Gate Decisions (UC3)</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Runbook</th>
              <th>Decisi&oacute;n</th>
              <th>Raz&oacute;n</th>
              <th>M&eacute;todo</th>
            </tr>
          </thead>
          <tbody>${safetyRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Sección 5: System Health Score -->
    <div class="section">
      <div class="section-header">System Health Score</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Puntaje</th>
              <th>Estado</th>
              <th>Incidentes</th>
              <th>Ejecuciones</th>
            </tr>
          </thead>
          <tbody>${healthRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Sección 6: SLA Metrics (v1.6) -->
    <div class="section">
      <div class="section-header">SLA Metrics &mdash; Uptime, MTTR, MTBF</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Uptime %</th>
              <th>MTTR</th>
              <th>MTBF</th>
              <th>Incidentes</th>
              <th>Remediaciones</th>
            </tr>
          </thead>
          <tbody>${slaRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Sección 7: Impacto de Costos -->
    <div class="section">
      <div class="section-header orange">Cost Impact &mdash; Expansiones EBS Aprobadas</div>
      <div class="section-body">
        <div style="padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee;">
          <strong>Costo mensual total:</strong> $${costImpact.totalMonthlyCostUsd}/mes &nbsp; | &nbsp;
          <strong>Proyecci&oacute;n anual:</strong> $${costImpact.totalAnnualCostUsd}/a&ntilde;o &nbsp; | &nbsp;
          <strong>Expansiones aprobadas:</strong> ${costImpact.approvedExpansions}
        </div>
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Runbook</th>
              <th>Costo</th>
              <th>Descripci&oacute;n</th>
              <th>Aprobado Por</th>
            </tr>
          </thead>
          <tbody>${costRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Sección 8: Costos Operacionales AlwaysOps (v1.6) -->
    <div class="section">
      <div class="section-header">AlwaysOps Operational Costs (Estimado Mensual)</div>
      <div class="section-body">
        <div style="padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee;">
          <strong>Total estimado:</strong> $${operationalCosts?.totalMonthlyCostUsd || 0}/mes &nbsp; | &nbsp;
          <strong>Por sistema:</strong> $${operationalCosts?.costPerSystem || 0}/mes &nbsp; | &nbsp;
          <strong>Sistemas monitoreados:</strong> ${operationalCosts?.systemsMonitored || 0}
        </div>
        <table>
          <thead>
            <tr><th>Servicio AWS</th><th>Uso</th><th>Costo/mes</th></tr>
          </thead>
          <tbody>
            <tr><td style="padding:8px 12px;">Lambda</td><td style="padding:8px 12px;">${operationalCosts?.breakdown?.lambda?.invocations?.toLocaleString() || 0} invocaciones</td><td style="padding:8px 12px;">$${operationalCosts?.breakdown?.lambda?.costUsd || 0}</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:8px 12px;">DynamoDB</td><td style="padding:8px 12px;">${operationalCosts?.breakdown?.dynamodb?.writes?.toLocaleString() || 0} writes / ${operationalCosts?.breakdown?.dynamodb?.reads?.toLocaleString() || 0} reads</td><td style="padding:8px 12px;">$${operationalCosts?.breakdown?.dynamodb?.costUsd || 0}</td></tr>
            <tr><td style="padding:8px 12px;">CloudWatch</td><td style="padding:8px 12px;">${operationalCosts?.breakdown?.cloudwatch?.customMetrics || 0} m&eacute;tricas custom</td><td style="padding:8px 12px;">$${operationalCosts?.breakdown?.cloudwatch?.costUsd || 0}</td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:8px 12px;">SNS</td><td style="padding:8px 12px;">${operationalCosts?.breakdown?.sns?.notifications?.toLocaleString() || 0} notificaciones</td><td style="padding:8px 12px;">$${operationalCosts?.breakdown?.sns?.costUsd || 0}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Sección 9: Compliance Scorecard (v1.7) -->
    <div class="section">
      <div class="section-header green">Compliance Scorecard</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Score</th>
              <th>Grado</th>
              <th>Backup</th>
              <th>Runbook</th>
              <th>Respuesta</th>
              <th>Uptime</th>
            </tr>
          </thead>
          <tbody>${Object.entries(complianceScorecard || {}).map(([sysId, c], idx) => {
            const bg = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
            const gradeColor = c.grade === 'A' ? '#28a745' : c.grade === 'B' ? '#17a2b8' : c.grade === 'C' ? '#ffc107' : '#dc3545';
            return `<tr style="background:${bg};">
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;">${sysId}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${healthBar(c.finalScore, gradeColor)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;"><span style="display:inline-block;padding:4px 12px;border-radius:50%;background:${gradeColor};color:#fff;font-weight:bold;font-size:16px;">${c.grade}</span></td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${c.breakdown.backup.score}/100</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${c.breakdown.runbook.score}/100</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${c.breakdown.responseTime.score}/100</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${c.breakdown.uptime.score}/100</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <strong>Avvale SAP AlwaysOps v1.0</strong> &mdash; Reporte generado autom&aacute;ticamente el ${new Date().toISOString()}<br>
      Sistema de monitoreo y remediaci&oacute;n automatizada para SAP
    </div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generatePresignedUrl
//  Genera una URL presignada de S3 para acceder al reporte
//  sin necesidad de credenciales. Válida por 7 días.
// ═══════════════════════════════════════════════════════════════

async function generatePresignedUrl(bucket, key) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: PRESIGNED_URL_EXPIRY });
    log.info('PRESIGNED_URL_GENERATED', { bucket, key, expiryDays: 7 });
    return url;
  } catch (err) {
    log.error('PRESIGNED_URL_FAILED', { bucket, key, error: err.message });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getWeekNumber
//  Calcula el número de semana ISO del año para la clave S3.
// ═══════════════════════════════════════════════════════════════

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: uploadToS3
//  Sube el reporte (JSON y HTML) al bucket de auditoría en S3.
//  Estructura: audit-reports/YYYY/WXX/audit-report-YYYY-MM-DD.*
// ═══════════════════════════════════════════════════════════════

async function uploadToS3(reportData, jsonContent, htmlContent) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const weekNum = getWeekNumber(now);
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const weekStr = `W${String(weekNum).padStart(2, '0')}`;

  const basePath = `audit-reports/${year}/${weekStr}`;
  const jsonKey = `${basePath}/audit-report-${dateStr}.json`;
  const htmlKey = `${basePath}/audit-report-${dateStr}.html`;

  log.info('S3_UPLOAD_START', { bucket: AUDIT_BUCKET, jsonKey, htmlKey });

  try {
    // Subir JSON
    await s3.send(new PutObjectCommand({
      Bucket: AUDIT_BUCKET,
      Key: jsonKey,
      Body: JSON.stringify(jsonContent, null, 2),
      ContentType: 'application/json',
    }));

    log.info('S3_UPLOAD_JSON_OK', { key: jsonKey });

    // Subir HTML
    await s3.send(new PutObjectCommand({
      Bucket: AUDIT_BUCKET,
      Key: htmlKey,
      Body: htmlContent,
      ContentType: 'text/html; charset=utf-8',
    }));

    log.info('S3_UPLOAD_HTML_OK', { key: htmlKey });

    return { jsonKey, htmlKey, success: true };
  } catch (err) {
    log.error('S3_UPLOAD_FAILED', { error: err.message });
    return { jsonKey, htmlKey, success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: sendSummaryNotification
//  Envía un resumen ejecutivo por SNS con la URL presignada
//  del reporte HTML para que el equipo pueda accederlo.
// ═══════════════════════════════════════════════════════════════

async function sendSummaryNotification(summary, htmlUrl, reportDate, weekNumber) {
  if (!ALERTS_TOPIC_ARN) {
    log.warn('SNS_SKIP', { reason: 'ALERTS_TOPIC_ARN no configurado' });
    return;
  }

  const message = {
    type: 'AUDIT_REPORT',
    eventType: 'AUDIT_REPORT',
    reportDate,
    weekNumber,
    reportUrl: htmlUrl,
    executiveSummary: {
      totalIncidents: summary.totalIncidents,
      bySeverity: summary.bySeverity,
      autoResolved: summary.autoResolved,
      humanApproved: summary.humanApproved,
      avgResponseTime: summary.avgResponseTimeFormatted,
      successRate: summary.successRate,
      affectedSystems: summary.affectedSystemCount,
      safetyGate: summary.safetyGate,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: ALERTS_TOPIC_ARN,
      Subject: `Avvale SAP AlwaysOps Audit Report - Semana ${weekNumber} (${reportDate})`,
      Message: JSON.stringify(message),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'AUDIT_REPORT' },
      },
    }));

    log.info('SNS_NOTIFICATION_SENT', { weekNumber, reportDate });
  } catch (err) {
    log.error('SNS_NOTIFICATION_FAILED', { error: err.message });
  }
}

// ============================================================================
//  v1.0 — H31: AUDIT LOG IMMUTABILITY (HASH CHAIN)
//  Cadena de hashes para garantizar la integridad e inmutabilidad de los
//  logs de auditoría. Cada reporte genera un eslabón en la cadena,
//  referenciando el hash del eslabón anterior. Esto permite detectar
//  cualquier manipulación retroactiva de los logs.
//
//  Estructura en S3:
//  - integrity/hash-chain/{sequence}_{timestamp}.json  → eslabón de la cadena
//  - integrity/immutable-logs/{timestamp}_{reportId}.json → log inmutable
//
//  Compliance: SOX ITGC-01, ISO 27001 A.12.4, ITIL INC-MGT
// ============================================================================

const IMMUTABILITY_CONFIG = {
  // Algoritmo de hash para la cadena de integridad
  hashAlgorithm: 'sha256',
  // Bucket para logs inmutables (mismo bucket de audit)
  auditBucket: process.env.AUDIT_BUCKET || 'sap-alwaysops-audit',
  // Prefijo para la cadena de hashes
  hashChainPrefix: 'integrity/hash-chain/',
  // Prefijo para logs inmutables
  immutableLogsPrefix: 'integrity/immutable-logs/',
  // Retención mínima en días
  retentionDays: 2555, // ~7 años para compliance SOX
  // Verificación periódica cada N reportes
  verifyEveryNReports: 5,
};

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: calculateHash (H31)
//  Calcula un hash SHA-256 de cualquier dato (objeto, string, etc).
//  Serializa el dato a JSON antes de calcular el hash, lo que
//  garantiza un resultado determinístico para el mismo input.
//
//  @param {*} data — Dato a hashear (se convierte a JSON)
//  @returns {string} — Hash hexadecimal SHA-256 (64 caracteres)
// ═══════════════════════════════════════════════════════════════

function calculateHash(data) {
  return crypto
    .createHash(IMMUTABILITY_CONFIG.hashAlgorithm)
    .update(JSON.stringify(data))
    .digest('hex');
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getLastHashChainEntry (H31)
//  Lee la última entrada de la cadena de hashes desde S3.
//  Lista los objetos en el prefijo integrity/hash-chain/,
//  ordena por nombre (que incluye timestamp) y retorna
//  la última entrada. Si no hay ninguna (primera ejecución),
//  retorna un "bloque génesis" con sequence 0.
//
//  @returns {Object} — { sequence, hash, timestamp, reportId }
// ═══════════════════════════════════════════════════════════════

async function getLastHashChainEntry() {
  try {
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: IMMUTABILITY_CONFIG.auditBucket,
      Prefix: IMMUTABILITY_CONFIG.hashChainPrefix,
      MaxKeys: 1000,
    }));

    const objects = (listResult.Contents || [])
      .filter(obj => obj.Key.endsWith('.json'))
      .sort((a, b) => a.Key.localeCompare(b.Key));

    // Si no hay entradas previas, retornar bloque génesis
    if (objects.length === 0) {
      log.info('H31_GENESIS_BLOCK', { message: 'No hay cadena previa, creando bloque génesis' });
      return {
        sequence: 0,
        chainHash: calculateHash({ genesis: true, timestamp: '1970-01-01T00:00:00.000Z' }),
        timestamp: '1970-01-01T00:00:00.000Z',
        reportId: 'GENESIS',
      };
    }

    // Leer la última entrada de la cadena
    const lastObject = objects[objects.length - 1];
    const getResult = await s3.send(new GetObjectCommand({
      Bucket: IMMUTABILITY_CONFIG.auditBucket,
      Key: lastObject.Key,
    }));

    // Leer el body del objeto S3 como string
    const bodyStr = await getResult.Body.transformToString();
    const lastEntry = JSON.parse(bodyStr);

    log.info('H31_LAST_ENTRY_LOADED', {
      sequence: lastEntry.sequence,
      chainHash: lastEntry.chainHash?.substring(0, 16) + '...',
      key: lastObject.Key,
    });

    return lastEntry;
  } catch (err) {
    log.warn('H31_CHAIN_READ_ERROR', { error: err.message });
    // Si hay error leyendo, retornar bloque génesis como fallback seguro
    return {
      sequence: 0,
      chainHash: calculateHash({ genesis: true, timestamp: '1970-01-01T00:00:00.000Z' }),
      timestamp: '1970-01-01T00:00:00.000Z',
      reportId: 'GENESIS',
    };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: createHashChainEntry (H31)
//  Crea un nuevo eslabón en la cadena de hashes. Cada eslabón
//  contiene:
//  - El hash del reporte actual (reportHash)
//  - El hash del eslabón anterior (previousHash)
//  - Un hash combinado (chainHash) que enlaza ambos
//  - Metadatos del reporte (sistema, tipo, versión)
//
//  El chainHash se calcula a partir de: sequence + reportHash +
//  previousHash, lo que crea una dependencia criptográfica
//  con el eslabón anterior (como en blockchain).
//
//  @param {Object} reportData — Datos completos del reporte
//  @param {Object} previousEntry — Eslabón anterior de la cadena
//  @returns {Object} — Nuevo eslabón de la cadena
// ═══════════════════════════════════════════════════════════════

function createHashChainEntry(reportData, previousEntry) {
  const newSequence = previousEntry.sequence + 1;
  const reportHash = calculateHash(reportData);

  // El chainHash enlaza este eslabón con el anterior
  const chainHash = calculateHash({
    sequence: newSequence,
    reportHash,
    previousHash: previousEntry.chainHash,
  });

  return {
    sequence: newSequence,
    timestamp: new Date().toISOString(),
    reportId: reportData.reportId || `audit-${new Date().toISOString().split('T')[0]}-W${reportData.weekNumber || '00'}`,
    reportHash,
    previousHash: previousEntry.chainHash,
    chainHash,
    metadata: {
      systemId: reportData.systemId || 'ALL',
      reportType: reportData.reportType || 'WEEKLY_AUDIT',
      generatedBy: 'sap-alwaysops-audit-reporter-v1.0',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: saveImmutableLog (H31)
//  Guarda el reporte y el eslabón de la cadena en S3 con
//  headers de integridad:
//  - ContentMD5: verificación de integridad en tránsito
//  - ServerSideEncryption: cifrado en reposo (AES-256)
//  - Metadata con el chainHash para verificación rápida
//
//  Dos objetos guardados:
//  1. integrity/immutable-logs/{timestamp}_{reportId}.json
//  2. integrity/hash-chain/{sequence}_{timestamp}.json
//
//  @param {Object} reportData — Datos completos del reporte
//  @param {Object} chainEntry — Eslabón de la cadena creado
// ═══════════════════════════════════════════════════════════════

async function saveImmutableLog(reportData, chainEntry) {
  const timestamp = chainEntry.timestamp.replace(/[:.]/g, '-');
  const reportId = chainEntry.reportId;
  const sequence = String(chainEntry.sequence).padStart(8, '0');

  // ─── 1. Guardar el log inmutable del reporte ───
  const reportBody = JSON.stringify(reportData, null, 2);
  const reportMD5 = crypto.createHash('md5').update(reportBody).digest('base64');
  const reportKey = `${IMMUTABILITY_CONFIG.immutableLogsPrefix}${timestamp}_${reportId}.json`;

  await s3.send(new PutObjectCommand({
    Bucket: IMMUTABILITY_CONFIG.auditBucket,
    Key: reportKey,
    Body: reportBody,
    ContentType: 'application/json',
    ContentMD5: reportMD5,
    ServerSideEncryption: 'AES256',
    Metadata: {
      'x-alwaysops-chain-hash': chainEntry.chainHash,
      'x-alwaysops-sequence': String(chainEntry.sequence),
      'x-alwaysops-report-hash': chainEntry.reportHash,
    },
  }));

  log.info('H31_IMMUTABLE_LOG_SAVED', {
    key: reportKey,
    reportHash: chainEntry.reportHash.substring(0, 16) + '...',
  });

  // ─── 2. Guardar el eslabón de la cadena de hashes ───
  const chainBody = JSON.stringify(chainEntry, null, 2);
  const chainMD5 = crypto.createHash('md5').update(chainBody).digest('base64');
  const chainKey = `${IMMUTABILITY_CONFIG.hashChainPrefix}${sequence}_${timestamp}.json`;

  await s3.send(new PutObjectCommand({
    Bucket: IMMUTABILITY_CONFIG.auditBucket,
    Key: chainKey,
    Body: chainBody,
    ContentType: 'application/json',
    ContentMD5: chainMD5,
    ServerSideEncryption: 'AES256',
    Metadata: {
      'x-alwaysops-chain-hash': chainEntry.chainHash,
      'x-alwaysops-previous-hash': chainEntry.previousHash,
    },
  }));

  log.info('H31_CHAIN_ENTRY_SAVED', {
    key: chainKey,
    sequence: chainEntry.sequence,
    chainHash: chainEntry.chainHash.substring(0, 16) + '...',
  });
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: verifyHashChain (H31)
//  Verifica la integridad de los últimos N eslabones de la cadena.
//  Para cada par consecutivo (n, n-1), verifica:
//  1. Que chainEntry[n].previousHash === chainEntry[n-1].chainHash
//  2. Que el chainHash recalculado desde sus componentes coincida
//
//  Si alguna verificación falla, la cadena ha sido manipulada.
//
//  @param {number} lastN — Cantidad de eslabones a verificar
//  @returns {Object} — { verified, entriesChecked, firstInvalidEntry, verifiedAt }
// ═══════════════════════════════════════════════════════════════

async function verifyHashChain(lastN = 10) {
  try {
    // Listar todos los eslabones de la cadena
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: IMMUTABILITY_CONFIG.auditBucket,
      Prefix: IMMUTABILITY_CONFIG.hashChainPrefix,
      MaxKeys: 1000,
    }));

    const objects = (listResult.Contents || [])
      .filter(obj => obj.Key.endsWith('.json'))
      .sort((a, b) => a.Key.localeCompare(b.Key));

    // Si hay menos de 2 eslabones, no hay nada que verificar
    if (objects.length < 2) {
      return {
        verified: true,
        entriesChecked: objects.length,
        firstInvalidEntry: null,
        verifiedAt: new Date().toISOString(),
        message: 'Cadena con menos de 2 eslabones, nada que verificar',
      };
    }

    // Tomar los últimos N eslabones (o todos si hay menos de N)
    const toCheck = objects.slice(Math.max(0, objects.length - lastN));

    // Leer el contenido de cada eslabón
    const entries = [];
    for (const obj of toCheck) {
      const getResult = await s3.send(new GetObjectCommand({
        Bucket: IMMUTABILITY_CONFIG.auditBucket,
        Key: obj.Key,
      }));
      const bodyStr = await getResult.Body.transformToString();
      entries.push({ key: obj.Key, ...JSON.parse(bodyStr) });
    }

    // Verificar cada par consecutivo
    let entriesChecked = 0;
    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const previous = entries[i - 1];
      entriesChecked++;

      // Verificación 1: el previousHash del actual debe coincidir con el chainHash del anterior
      if (current.previousHash !== previous.chainHash) {
        log.error('H31_CHAIN_BROKEN', {
          currentSequence: current.sequence,
          previousSequence: previous.sequence,
          expectedPreviousHash: previous.chainHash?.substring(0, 16) + '...',
          actualPreviousHash: current.previousHash?.substring(0, 16) + '...',
        });
        return {
          verified: false,
          entriesChecked,
          firstInvalidEntry: {
            sequence: current.sequence,
            key: current.key,
            reason: 'previousHash no coincide con chainHash del eslabón anterior',
          },
          verifiedAt: new Date().toISOString(),
        };
      }

      // Verificación 2: recalcular el chainHash y verificar que coincida
      const recalculatedChainHash = calculateHash({
        sequence: current.sequence,
        reportHash: current.reportHash,
        previousHash: current.previousHash,
      });

      if (recalculatedChainHash !== current.chainHash) {
        log.error('H31_HASH_MISMATCH', {
          sequence: current.sequence,
          storedHash: current.chainHash?.substring(0, 16) + '...',
          recalculatedHash: recalculatedChainHash.substring(0, 16) + '...',
        });
        return {
          verified: false,
          entriesChecked,
          firstInvalidEntry: {
            sequence: current.sequence,
            key: current.key,
            reason: 'chainHash recalculado no coincide con el almacenado',
          },
          verifiedAt: new Date().toISOString(),
        };
      }
    }

    log.info('H31_CHAIN_VERIFIED', { entriesChecked, totalEntries: entries.length });

    return {
      verified: true,
      entriesChecked,
      firstInvalidEntry: null,
      verifiedAt: new Date().toISOString(),
    };
  } catch (err) {
    log.error('H31_VERIFY_ERROR', { error: err.message });
    return {
      verified: false,
      entriesChecked: 0,
      firstInvalidEntry: null,
      verifiedAt: new Date().toISOString(),
      error: err.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generateIntegrityReport (H31)
//  Genera una sección HTML para el reporte de auditoría mostrando
//  el estado de integridad de la cadena de hashes:
//  - Longitud total de la cadena
//  - Resultado de la última verificación
//  - Hash del eslabón más reciente
//  - Estado de compliance (COMPLIANT / NON_COMPLIANT)
//
//  @param {Object} chainEntry — Último eslabón creado
//  @param {Object|null} verification — Resultado de verificación (si se ejecutó)
//  @returns {string} — Sección HTML para insertar en el reporte
// ═══════════════════════════════════════════════════════════════

function generateIntegrityReport(chainEntry, verification) {
  const complianceStatus = (!verification || verification.verified)
    ? 'COMPLIANT'
    : 'NON_COMPLIANT';

  const statusColor = complianceStatus === 'COMPLIANT' ? '#28a745' : '#dc3545';
  const statusLabel = complianceStatus === 'COMPLIANT' ? 'Cumple' : 'No Cumple';
  const verificationLabel = verification
    ? (verification.verified ? 'APROBADA' : 'FALLIDA')
    : 'No ejecutada en este ciclo';
  const verificationColor = verification
    ? (verification.verified ? '#28a745' : '#dc3545')
    : '#6c757d';

  return `
    <!-- Sección H31: Audit Log Immutability (Hash Chain) -->
    <div class="section">
      <div class="section-header" style="background:#495057;">Audit Log Integrity &mdash; Hash Chain (H31)</div>
      <div class="section-body">
        <div style="padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee;">
          <strong>Estado de Compliance:</strong>
          <span style="display:inline-block;padding:2px 10px;border-radius:4px;background:${statusColor};color:#fff;font-size:11px;font-weight:bold;margin-left:8px;">${statusLabel}</span>
          &nbsp; | &nbsp;
          <strong>Cadena de integridad activa desde:</strong> ${chainEntry.sequence > 1 ? 'Bloque #1' : 'Este reporte (Bloque G&eacute;nesis)'}
        </div>
        <table>
          <thead>
            <tr>
              <th>Par&aacute;metro</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;">Longitud de la cadena</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${chainEntry.sequence} eslabones</td>
            </tr>
            <tr style="background:#f8f9fa;">
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;">Hash del &uacute;ltimo eslab&oacute;n</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${chainEntry.chainHash}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;">Hash del reporte actual</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${chainEntry.reportHash}</td>
            </tr>
            <tr style="background:#f8f9fa;">
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;">Hash anterior (enlace)</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${chainEntry.previousHash}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;">&Uacute;ltima verificaci&oacute;n</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">
                <span style="color:${verificationColor};font-weight:bold;">${verificationLabel}</span>
                ${verification ? ` &mdash; ${verification.entriesChecked} eslabones verificados` : ''}
              </td>
            </tr>
            <tr style="background:#f8f9fa;">
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;">Retenci&oacute;n configurada</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${IMMUTABILITY_CONFIG.retentionDays} d&iacute;as (~${Math.round(IMMUTABILITY_CONFIG.retentionDays / 365)} a&ntilde;os) para compliance SOX</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;">Algoritmo de hash</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;">${IMMUTABILITY_CONFIG.hashAlgorithm.toUpperCase()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Punto de entrada del Lambda. Orquesta todo el proceso:
//  1. Lee datos de las 4 tablas de DynamoDB
//  2. Genera el resumen ejecutivo y las secciones del reporte
//  3. Crea las versiones JSON y HTML
//  4. Sube a S3
//  5. Envía notificación por SNS
//  6. (H31) Guarda log inmutable con cadena de hashes
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('INVOKE', { eventSource: event.source || 'eventbridge', detailType: event['detail-type'] || 'manual' });
  const startTime = Date.now();

  try {
    const now = new Date();
    const reportDate = now.toISOString().split('T')[0];
    const weekNumber = getWeekNumber(now);

    log.info('GENERATE_REPORT', { reportDate, weekNumber });

    // ─── Paso 1: Leer datos de las 4 tablas (continuar si alguna falla) ───
    const errors = [];

    log.info('DATA_COLLECTION_START', { tables: 4 });

    const [incidentsResult, approvalsResult, executionsResult, advisorResult] = await Promise.all([
      queryLastWeek(INCIDENTS_TABLE),
      queryLastWeek(APPROVALS_TABLE),
      queryLastWeek(RUNBOOK_EXECUTIONS_TABLE),
      queryLastWeek(ADVISOR_RESULTS_TABLE),
    ]);

    // Registrar errores pero continuar con datos parciales
    if (!incidentsResult.success) {
      errors.push({ table: INCIDENTS_TABLE, error: incidentsResult.error });
    }
    if (!approvalsResult.success) {
      errors.push({ table: APPROVALS_TABLE, error: approvalsResult.error });
    }
    if (!executionsResult.success) {
      errors.push({ table: RUNBOOK_EXECUTIONS_TABLE, error: executionsResult.error });
    }
    if (!advisorResult.success) {
      errors.push({ table: ADVISOR_RESULTS_TABLE, error: advisorResult.error });
    }

    const incidents = incidentsResult.items;
    const approvals = approvalsResult.items;
    const executions = executionsResult.items;
    const advisorResults = advisorResult.items;

    log.info('DATA_COLLECTION_COMPLETE', {
      incidents: incidents.length,
      approvals: approvals.length,
      executions: executions.length,
      advisorResults: advisorResults.length,
      errors: errors.length,
    });

    // ─── Paso 2: Generar las secciones del reporte ───
    const data = { incidents, approvals, executions, advisorResults };

    // Resumen ejecutivo
    const summary = generateExecutiveSummary(data);

    // Timeline de incidentes (ordenado cronológicamente)
    const incidentsTimeline = [...incidents].sort((a, b) => {
      const tsA = a.sk ? a.sk.split('#')[0] : a.timestamp || '';
      const tsB = b.sk ? b.sk.split('#')[0] : b.timestamp || '';
      return tsA.localeCompare(tsB);
    });

    // Ejecuciones agrupadas por sistema
    const executionsBySystem = {};
    for (const exec of executions) {
      const sysId = exec.systemId || 'UNKNOWN';
      if (!executionsBySystem[sysId]) {
        executionsBySystem[sysId] = [];
      }
      executionsBySystem[sysId].push(exec);
    }

    // Auditoría de aprobaciones
    const approvalAudit = [...approvals].sort((a, b) => {
      const tsA = a.createdAt || '';
      const tsB = b.createdAt || '';
      return tsA.localeCompare(tsB);
    });

    // Decisiones Safety Gate (solo UC3)
    const safetyGateDecisions = advisorResults.filter(r => r.useCase === 'UC3');

    // Health Scores por sistema
    const healthScores = calculateHealthScore(incidents, executions);

    // v1.6 — SLA Metrics por sistema
    const slaMetrics = calculateSlaMetrics(incidents, executions);

    // Impacto de costos (expansiones aprobadas)
    const costImpact = calculateCostImpact(approvals);

    // v1.6 — Costo operacional estimado de AlwaysOps
    const systemsConfig = await loadSystemsConfig();
    const operationalCosts = calculateOperationalCosts(incidents, executions, systemsConfig.length || 1);

    // v1.7 — Compliance Scorecard por sistema
    const complianceScorecard = calculateComplianceScorecard(incidents, executions, slaMetrics);

    // H25 — Compliance Mapping (SOX / ISO 27001 / ITIL)
    const complianceMapping = generateComplianceReport(incidents, approvals, executions, advisorResults);

    // H39 — Compliance profundo (SOX, GxP, ISO 27001) con evaluación detallada
    let deepComplianceReport = null;
    try {
      deepComplianceReport = await generateFullComplianceReport('ALL', {
        from: summary.reportPeriod.from,
        to: summary.reportPeriod.to,
      }, { ddbDoc });
      log.info('H39_COMPLIANCE_COMPLETE', {
        overallScore: deepComplianceReport.overallScore,
        frameworks: Object.keys(deepComplianceReport.frameworks || {}).length,
        criticalFindings: (deepComplianceReport.criticalFindings || []).length,
      });
    } catch (compErr) {
      log.warn('H39_COMPLIANCE_FAILED', { error: compErr.message });
      errors.push({ section: 'H39-deep-compliance', error: compErr.message });
    }

    log.info('REPORT_SECTIONS_GENERATED', {
      incidentsTimeline: incidentsTimeline.length,
      systemsWithExecutions: Object.keys(executionsBySystem).length,
      approvalAudit: approvalAudit.length,
      safetyGateDecisions: safetyGateDecisions.length,
      healthScoreSystems: Object.keys(healthScores).length,
      slaSystems: Object.keys(slaMetrics).length,
      costItems: costImpact.details.length,
      complianceSystems: Object.keys(complianceScorecard).length,
      complianceMapping: complianceMapping.summary,
    });

    // ─── Paso 3: Generar JSON y HTML ───
    const reportData = {
      summary,
      incidentsTimeline,
      executionsBySystem,
      approvalAudit,
      safetyGateDecisions,
      healthScores,
      slaMetrics,
      costImpact,
      operationalCosts,
      complianceScorecard,
      complianceMapping,
      deepComplianceReport,
      errors,
      reportDate,
      weekNumber,
    };

    const jsonContent = {
      reportMetadata: {
        version: '1.0.0',
        generatedAt: now.toISOString(),
        reportDate,
        weekNumber,
        periodFrom: summary.reportPeriod.from,
        periodTo: summary.reportPeriod.to,
      },
      executiveSummary: summary,
      incidentsTimeline,
      runbookExecutions: executionsBySystem,
      approvalAudit,
      safetyGateDecisions,
      systemHealthScores: healthScores,
      slaMetrics,
      costImpact,
      operationalCosts,
      complianceScorecard,
      complianceMapping,
      deepComplianceReport,
      dataCollectionErrors: errors,
    };

    // Generar HTML base y agregar la sección de compliance mapping (H25)
    let htmlContent = generateHtmlReport(reportData);
    const complianceHtmlSection = generateComplianceSection(complianceMapping);
    // Insertar la sección de compliance justo antes del footer del reporte
    htmlContent = htmlContent.replace(
      '<!-- Footer -->',
      complianceHtmlSection + '\n    <!-- Footer -->'
    );

    log.info('REPORT_GENERATED', {
      jsonSizeBytes: JSON.stringify(jsonContent).length,
      htmlSizeBytes: htmlContent.length,
    });

    // ─── Paso 4: Subir a S3 ───
    let s3Result = { success: false, jsonKey: '', htmlKey: '' };
    let htmlPresignedUrl = null;

    if (AUDIT_BUCKET) {
      s3Result = await uploadToS3(reportData, jsonContent, htmlContent);

      if (s3Result.success) {
        // Generar URL presignada del HTML (7 días de validez)
        htmlPresignedUrl = await generatePresignedUrl(AUDIT_BUCKET, s3Result.htmlKey);
      }
    } else {
      log.warn('S3_SKIP', { reason: 'AUDIT_BUCKET no configurado' });
    }

    // ─── Paso 5: Enviar notificación SNS ───
    await sendSummaryNotification(summary, htmlPresignedUrl, reportDate, weekNumber);

    // ─── Paso 6 (H31): Audit Log Immutability — Cadena de hashes ───
    // Crea un eslabón inmutable en la cadena de hashes para garantizar
    // que ningún reporte previo pueda ser manipulado sin ser detectado.
    // Este paso es non-blocking: si falla, el reporte ya fue generado
    // y enviado correctamente.
    let h31ChainEntry = null;
    let h31Verification = null;

    try {
      // Enriquecer jsonContent con campos que necesita la cadena
      const auditData = {
        ...jsonContent,
        reportId: `audit-${reportDate}-W${String(weekNumber).padStart(2, '0')}`,
        reportType: 'WEEKLY_AUDIT',
        systemId: 'ALL',
        weekNumber,
      };

      const previousEntry = await getLastHashChainEntry();
      const chainEntry = createHashChainEntry(auditData, previousEntry);
      await saveImmutableLog(auditData, chainEntry);

      h31ChainEntry = chainEntry;

      // Verificar integridad cada N reportes
      if (chainEntry.sequence % IMMUTABILITY_CONFIG.verifyEveryNReports === 0) {
        const verification = await verifyHashChain(10);
        log.info('H31 Chain verification', { verified: verification.verified, entriesChecked: verification.entriesChecked });
        h31Verification = verification;
        auditData.integrityVerification = verification;
      }

      log.info('H31 Immutable log saved', { sequence: chainEntry.sequence, hashPrefix: chainEntry.chainHash.substring(0, 16) });
    } catch (immErr) {
      log.warn('H31 Immutable logging failed (non-blocking)', { error: immErr.message });
    }

    // ─── Paso 6b (H31): Insertar sección de integridad en el HTML ───
    if (h31ChainEntry) {
      const integrityHtmlSection = generateIntegrityReport(h31ChainEntry, h31Verification);
      htmlContent = htmlContent.replace(
        '<!-- Footer -->',
        integrityHtmlSection + '\n    <!-- Footer -->'
      );

      // Re-subir el HTML actualizado con la sección de integridad
      if (AUDIT_BUCKET && s3Result.success) {
        try {
          await s3.send(new PutObjectCommand({
            Bucket: AUDIT_BUCKET,
            Key: s3Result.htmlKey,
            Body: htmlContent,
            ContentType: 'text/html; charset=utf-8',
          }));
          log.info('H31_HTML_UPDATED', { key: s3Result.htmlKey });
        } catch (reUploadErr) {
          log.warn('H31_HTML_UPDATE_FAILED', { error: reUploadErr.message });
        }
      }
    }

    // ─── Resultado final ───
    const duration = Date.now() - startTime;

    log.info('REPORT_COMPLETE', {
      duration: `${duration}ms`,
      reportDate,
      weekNumber,
      s3Success: s3Result.success,
      totalIncidents: summary.totalIncidents,
      totalExecutions: summary.totalExecutions,
      errors: errors.length,
    });

    return {
      statusCode: 200,
      body: {
        message: 'Avvale SAP AlwaysOps Audit Reporter v1.0 completado',
        duration: `${duration}ms`,
        reportDate,
        weekNumber,
        s3: {
          bucket: AUDIT_BUCKET,
          jsonKey: s3Result.jsonKey,
          htmlKey: s3Result.htmlKey,
          uploaded: s3Result.success,
          presignedUrl: htmlPresignedUrl,
        },
        executiveSummary: summary,
        dataCollectionErrors: errors,
      },
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    log.error('FATAL_ERROR', { error: err.message, stack: err.stack, duration: `${duration}ms` });

    return {
      statusCode: 500,
      body: { error: err.message },
    };
  }
};
