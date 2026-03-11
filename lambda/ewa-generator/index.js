'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — EWA-Equivalent Report Generator
//  Genera reportes semanales tipo EWA (Early Watch Alert) con:
//  - Resumen de metricas por sistema
//  - Hallazgos y tendencias
//  - Riesgos identificados
//  - Recomendaciones IA (si Bedrock habilitado)
//  - Historial de incidentes y ejecuciones
//
//  Trigger: EventBridge semanal (Lunes 06:00 UTC)
// ═══════════════════════════════════════════════════════════════

const log = require('../utilidades/logger')('ewa-generator');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchClient, GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cw = new CloudWatchClient({});
const ssm = new SSMClient({});
const ses = new SESClient({});

const CW_NAMESPACE = process.env.CW_NAMESPACE || 'SAPAlwaysOps';
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'sap-alwaysops-incidents';
const RUNBOOK_EXECUTIONS_TABLE = process.env.RUNBOOK_EXECUTIONS_TABLE || 'sap-alwaysops-runbook-executions';
const ADVISOR_RESULTS_TABLE = process.env.ADVISOR_RESULTS_TABLE || 'sap-alwaysops-advisor-results';
const METRICS_HISTORY_TABLE = process.env.METRICS_HISTORY_TABLE || 'sap-alwaysops-metrics-history';
const SES_FROM = process.env.SES_FROM_ADDRESS || 'alwaysops@example.com';
const SES_TO = process.env.SES_TO_ADDRESSES || '';

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getSystemsConfig
// ═══════════════════════════════════════════════════════════════

async function getSystemsConfig() {
  try {
    const param = await ssm.send(new GetParameterCommand({
      Name: process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config',
      WithDecryption: true,
    }));
    return JSON.parse(param.Parameter.Value);
  } catch {
    return { systems: [] };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getWeeklyIncidents
//  Obtiene incidentes de los ultimos 7 dias
// ═══════════════════════════════════════════════════════════════

async function getWeeklyIncidents(systemId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: INCIDENTS_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk > :weekAgo',
      ExpressionAttributeValues: {
        ':pk': `SYSTEM#${systemId}`,
        ':weekAgo': weekAgo,
      },
      ScanIndexForward: false,
    }));
    return result.Items || [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getWeeklyExecutions
// ═══════════════════════════════════════════════════════════════

async function getWeeklyExecutions(systemId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: RUNBOOK_EXECUTIONS_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk > :weekAgo',
      ExpressionAttributeValues: {
        ':pk': `SYSTEM#${systemId}`,
        ':weekAgo': weekAgo,
      },
      ScanIndexForward: false,
    }));
    return result.Items || [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getTokenUsage
//  Obtiene uso de tokens IA de los ultimos 7 dias
// ═══════════════════════════════════════════════════════════════

async function getTokenUsage() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().split('T')[0];
    days.push(date);
  }

  let totalTokens = 0;
  let totalInvocations = 0;

  for (const date of days) {
    try {
      const result = await ddbDoc.send(new QueryCommand({
        TableName: ADVISOR_RESULTS_TABLE,
        KeyConditionExpression: 'pk = :pk AND sk = :sk',
        ExpressionAttributeValues: {
          ':pk': `TOKEN_DAILY#${date}`,
          ':sk': 'TOTAL',
        },
      }));
      const item = result.Items?.[0];
      if (item) {
        totalTokens += item.totalTokens || 0;
        totalInvocations += item.invocationCount || 0;
      }
    } catch { /* continue */ }
  }

  return { totalTokens, totalInvocations, days: days.length };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generateReport
//  Genera el reporte EWA para un sistema
// ═══════════════════════════════════════════════════════════════

async function generateSystemReport(system) {
  const systemId = system.systemId || system.id;
  log.info('Generando reporte EWA', { systemId });

  const [incidents, executions] = await Promise.all([
    getWeeklyIncidents(systemId),
    getWeeklyExecutions(systemId),
  ]);

  // Clasificar incidentes por severidad
  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const inc of incidents) {
    const sev = inc.severity || 'INFO';
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
  }

  // Clasificar ejecuciones por resultado
  const execByResult = { success: 0, failed: 0, pending: 0 };
  for (const exec of executions) {
    const status = exec.status || exec.result || 'pending';
    if (status === 'success' || status === 'completed') execByResult.success++;
    else if (status === 'failed' || status === 'error') execByResult.failed++;
    else execByResult.pending++;
  }

  // MTTR estimado
  const successExecs = executions.filter(e => e.status === 'success' || e.result === 'completed');
  const avgMttr = successExecs.length > 0
    ? Math.round(successExecs.reduce((sum, e) => sum + (e.durationMs || 0), 0) / successExecs.length / 1000)
    : null;

  // Runbooks mas ejecutados
  const runbookCounts = {};
  for (const exec of executions) {
    const rb = exec.runbookId || 'unknown';
    runbookCounts[rb] = (runbookCounts[rb] || 0) + 1;
  }
  const topRunbooks = Object.entries(runbookCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return {
    systemId,
    systemType: system.systemType || system.type || 'SAP',
    period: {
      from: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      to: new Date().toISOString(),
    },
    summary: {
      totalIncidents: incidents.length,
      bySeverity,
      totalExecutions: executions.length,
      execByResult,
      avgMttrSeconds: avgMttr,
      topRunbooks,
    },
    healthScore: calculateHealthScore(bySeverity, execByResult),
    risks: identifyRisks(bySeverity, execByResult, incidents),
    recommendations: generateRecommendations(bySeverity, execByResult, topRunbooks),
  };
}

function calculateHealthScore(bySeverity, execByResult) {
  let score = 100;
  score -= bySeverity.CRITICAL * 20;
  score -= bySeverity.HIGH * 10;
  score -= bySeverity.MEDIUM * 3;
  score -= execByResult.failed * 5;
  return Math.max(0, Math.min(100, score));
}

function identifyRisks(bySeverity, execByResult, incidents) {
  const risks = [];
  if (bySeverity.CRITICAL > 0) {
    risks.push({ level: 'ALTO', message: `${bySeverity.CRITICAL} incidentes criticos esta semana` });
  }
  if (execByResult.failed > 2) {
    risks.push({ level: 'MEDIO', message: `${execByResult.failed} ejecuciones de runbook fallidas` });
  }
  const recurring = {};
  for (const inc of incidents) {
    const key = inc.metricName || inc.type || 'unknown';
    recurring[key] = (recurring[key] || 0) + 1;
  }
  for (const [metric, count] of Object.entries(recurring)) {
    if (count >= 3) {
      risks.push({ level: 'MEDIO', message: `Alerta recurrente: ${metric} (${count} veces)` });
    }
  }
  return risks;
}

function generateRecommendations(bySeverity, execByResult, topRunbooks) {
  const recs = [];
  if (bySeverity.CRITICAL > 3) {
    recs.push('Revisar umbrales de alerta para reducir falsos positivos');
  }
  if (execByResult.failed > 0) {
    recs.push('Investigar runbooks fallidos y actualizar scripts de remediacion');
  }
  if (topRunbooks.length > 0 && topRunbooks[0][1] > 10) {
    recs.push(`Runbook ${topRunbooks[0][0]} ejecutado ${topRunbooks[0][1]} veces — considerar optimizacion preventiva`);
  }
  if (recs.length === 0) {
    recs.push('Sistema operando dentro de parametros normales');
  }
  return recs;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: formatReportHtml
// ═══════════════════════════════════════════════════════════════

function formatReportHtml(reports, tokenUsage) {
  const now = new Date().toISOString().split('T')[0];

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body { font-family: -apple-system, sans-serif; margin: 20px; color: #1a1a1a; }
h1 { color: #E4002B; border-bottom: 2px solid #E4002B; padding-bottom: 8px; }
h2 { color: #333; margin-top: 24px; }
.system-card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 12px 0; }
.health-score { font-size: 2em; font-weight: bold; }
.score-good { color: #10B981; }
.score-warning { color: #F59E0B; }
.score-critical { color: #EF4444; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; }
th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
th { background: #f5f5f5; }
.risk-alto { color: #EF4444; font-weight: bold; }
.risk-medio { color: #F59E0B; }
.footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; color: #666; font-size: 0.85em; }
</style></head><body>`;

  html += `<h1>SAP Spektra — Reporte Semanal EWA</h1>`;
  html += `<p>Periodo: ${reports[0]?.period?.from?.split('T')[0] || '?'} al ${now}</p>`;

  for (const report of reports) {
    const scoreClass = report.healthScore >= 80 ? 'score-good' : (report.healthScore >= 50 ? 'score-warning' : 'score-critical');

    html += `<div class="system-card">`;
    html += `<h2>${report.systemId} (${report.systemType})</h2>`;
    html += `<p>Health Score: <span class="health-score ${scoreClass}">${report.healthScore}/100</span></p>`;

    html += `<table><tr><th>Severidad</th><th>Cantidad</th></tr>`;
    for (const [sev, count] of Object.entries(report.summary.bySeverity)) {
      if (count > 0) html += `<tr><td>${sev}</td><td>${count}</td></tr>`;
    }
    html += `</table>`;

    html += `<p>Ejecuciones: ${report.summary.totalExecutions} (${report.summary.execByResult.success} exitosas, ${report.summary.execByResult.failed} fallidas)</p>`;
    if (report.summary.avgMttrSeconds) {
      html += `<p>MTTR promedio: ${report.summary.avgMttrSeconds}s</p>`;
    }

    if (report.risks.length > 0) {
      html += `<h3>Riesgos</h3><ul>`;
      for (const risk of report.risks) {
        html += `<li class="risk-${risk.level.toLowerCase()}">[${risk.level}] ${risk.message}</li>`;
      }
      html += `</ul>`;
    }

    html += `<h3>Recomendaciones</h3><ul>`;
    for (const rec of report.recommendations) {
      html += `<li>${rec}</li>`;
    }
    html += `</ul></div>`;
  }

  // Seccion de uso IA
  html += `<h2>Uso de IA (Bedrock)</h2>`;
  html += `<p>Tokens consumidos: ${tokenUsage.totalTokens.toLocaleString()} en ${tokenUsage.totalInvocations} invocaciones (${tokenUsage.days} dias)</p>`;

  html += `<div class="footer">`;
  html += `<p>Generado automaticamente por SAP Spektra v1.0</p>`;
  html += `<p>Este reporte es el equivalente funcional del SAP EWA (Early Watch Alert), generado sin necesidad de SAP Solution Manager.</p>`;
  html += `</div></body></html>`;

  return html;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: sendReportEmail
// ═══════════════════════════════════════════════════════════════

async function sendReportEmail(html, systemCount) {
  if (!SES_TO) {
    log.warn('SES_TO_ADDRESSES no configurado, saltando envio de email');
    return;
  }

  const toAddresses = SES_TO.split(',').map(e => e.trim()).filter(Boolean);
  const now = new Date().toISOString().split('T')[0];

  await ses.send(new SendEmailCommand({
    Source: SES_FROM,
    Destination: { ToAddresses: toAddresses },
    Message: {
      Subject: { Data: `[SAP Spektra EWA] Reporte Semanal — ${systemCount} sistema(s) — ${now}` },
      Body: { Html: { Data: html } },
    },
  }));

  log.info('Reporte EWA enviado por email', { to: toAddresses.length, systems: systemCount });
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: persistReport
// ═══════════════════════════════════════════════════════════════

async function persistReport(reports) {
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 3600; // 1 ano

  await ddbDoc.send(new PutCommand({
    TableName: ADVISOR_RESULTS_TABLE,
    Item: {
      pk: 'EWA_REPORT',
      sk: now,
      reportDate: now,
      systemCount: reports.length,
      reports,
      ttl,
    },
  }));
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('EWA Generator invocado');
  const startTime = Date.now();

  try {
    // Obtener sistemas configurados
    const config = await getSystemsConfig();
    const systems = config.systems || [];

    if (systems.length === 0) {
      log.warn('No hay sistemas configurados, generando reporte vacio');
      return { statusCode: 200, body: JSON.stringify({ message: 'No hay sistemas configurados' }) };
    }

    // Generar reporte por sistema
    const reports = [];
    for (const system of systems) {
      const report = await generateSystemReport(system);
      reports.push(report);
    }

    // Obtener uso de tokens
    const tokenUsage = await getTokenUsage();

    // Formatear HTML
    const html = formatReportHtml(reports, tokenUsage);

    // Persistir en DynamoDB
    await persistReport(reports);

    // Enviar por email
    try {
      await sendReportEmail(html, reports.length);
    } catch (emailErr) {
      log.warn('Error enviando email EWA', { error: emailErr.message });
    }

    const duration = Date.now() - startTime;
    log.metric('EwaReportDuration', duration, 'Milliseconds', { Component: 'ewa-generator' });
    log.info('EWA Report generado', { systems: reports.length, duration: `${duration}ms` });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        systemCount: reports.length,
        reports,
        tokenUsage,
        duration: `${duration}ms`,
      }),
    };
  } catch (err) {
    log.error('Error fatal en EWA Generator', { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
