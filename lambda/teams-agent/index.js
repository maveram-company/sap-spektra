'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Teams Agent
//  Agente de notificaciones para Microsoft Teams via webhooks.
//
//  ¿Qué hace este Lambda?
//  Está suscrito a los mismos SNS topics que el email-agent.
//  Cuando recibe un evento, construye una Adaptive Card
//  (el formato de mensaje enriquecido de Teams) y la envía
//  al canal de Teams configurado via webhook.
//  No necesita dependencias de AWS porque usa HTTPS nativo.
// ═══════════════════════════════════════════════════════════════

const https = require('https');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const log = require('../utilidades/logger')('teams-agent');

const secretsMgr = new SecretsManagerClient({});

// Configuración
const TEAMS_WEBHOOK_SECRET_ARN = process.env.TEAMS_WEBHOOK_SECRET_ARN || '';
const APPROVAL_API_URL = process.env.APPROVAL_API_URL || 'https://YOUR-API-GATEWAY-URL';

// Caché del webhook URL para no leer Secrets Manager en cada invocación
let cachedWebhookUrl = null;

async function getTeamsWebhookUrl() {
  // Si ya está en caché, usarlo
  if (cachedWebhookUrl) return cachedWebhookUrl;

  // Intentar desde Secrets Manager primero
  if (TEAMS_WEBHOOK_SECRET_ARN) {
    try {
      const res = await secretsMgr.send(new GetSecretValueCommand({ SecretId: TEAMS_WEBHOOK_SECRET_ARN }));
      const secret = JSON.parse(res.SecretString);
      cachedWebhookUrl = secret.webhookUrl || secret.url || res.SecretString;
      log.info('Webhook URL cargado desde Secrets Manager');
      return cachedWebhookUrl;
    } catch (err) {
      log.warn('Error leyendo Secrets Manager', { error: err.message });
    }
  }

  // Fallback a variable de entorno
  cachedWebhookUrl = process.env.TEAMS_WEBHOOK_URL || '';
  return cachedWebhookUrl;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: sendToTeams
//  Envía una Adaptive Card al canal de Microsoft Teams
//  usando el webhook configurado. Usa el módulo HTTPS nativo
//  de Node.js (no necesita axios ni node-fetch).
// ═══════════════════════════════════════════════════════════════

async function sendToTeams(card) {
  const webhookUrlStr = await getTeamsWebhookUrl();

  if (!webhookUrlStr) {
    log.warn('Webhook URL no configurado (ni Secrets Manager ni env var)');
    return { success: false, error: 'Webhook no configurado' };
  }

  return new Promise((resolve, reject) => {
    // El payload que Teams espera para Adaptive Cards
    const payload = JSON.stringify({
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: card,
      }],
    });

    // Parsear la URL del webhook (usar new URL en vez de deprecated url.parse)
    const webhookUrl = new URL(webhookUrlStr);

    const options = {
      hostname: webhookUrl.hostname,
      path: webhookUrl.pathname + webhookUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          log.info('Mensaje enviado exitosamente');
          resolve({ success: true });
        } else {
          log.error('Error HTTP al enviar a Teams', { statusCode: res.statusCode, response: body });
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => {
      log.error('Error de red al enviar a Teams', { error: err.message });
      resolve({ success: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
//  CONSTRUCTORES DE ADAPTIVE CARDS
//  Cada tipo de evento tiene su propia tarjeta.
//  Las Adaptive Cards son JSON con un esquema específico
//  que Teams renderiza como mensajes bonitos.
// ═══════════════════════════════════════════════════════════════

const CARDS = {
  // ─── Alerta de breach ───
  BREACH_DETECTED: (data) => {
    const severity = data.breaches.some(b => b.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH';
    const color = severity === 'CRITICAL' ? 'Attention' : 'Warning';

    const facts = data.breaches.map(b => ({
      title: b.metricName,
      value: `${b.value} (umbral: ${b.threshold}) - ${b.severity} - ${b.runbook}`,
    }));

    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: `Avvale SAP AlwaysOps - Alerta de Breach (${severity})`,
          weight: 'Bolder',
          size: 'Large',
          color: color,
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Sistema', value: data.systemId },
            { title: 'Tipo', value: `${data.systemType} / ${data.dbType}` },
            { title: 'SID', value: data.sid },
            { title: 'Ambiente', value: data.env },
          ],
        },
        {
          type: 'TextBlock',
          text: `Breaches detectados: ${data.breaches.length}`,
          weight: 'Bolder',
          spacing: 'Medium',
        },
        {
          type: 'FactSet',
          facts: facts,
        },
        {
          type: 'TextBlock',
          text: 'Los runbooks costSafe se ejecutan automaticamente. Los demas requieren aprobacion.',
          size: 'Small',
          color: 'Default',
          isSubtle: true,
          wrap: true,
        },
      ],
    };
  },

  // ─── Solicitud de aprobación ───
  APPROVAL_REQUEST: (data) => {
    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Avvale SAP AlwaysOps - Aprobacion Requerida',
          weight: 'Bolder',
          size: 'Large',
          color: 'Warning',
        },
        {
          type: 'TextBlock',
          text: 'Se requiere aprobacion humana para ejecutar una accion correctiva.',
          wrap: true,
          color: 'Warning',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Sistema', value: data.systemId },
            { title: 'Runbook', value: data.runbookId },
            { title: 'Severidad', value: data.severity },
            { title: 'Metrica', value: `${data.metricName} = ${data.metricValue}` },
            ...(data.costEstimate ? [{ title: 'Costo estimado', value: `$${data.costEstimate.costUsd}/mes - ${data.costEstimate.description}` }] : []),
            ...(data.safetyGateDecision ? [{ title: 'Safety Gate', value: `${data.safetyGateDecision}: ${data.safetyGateReason || ''}` }] : []),
            { title: 'Expira', value: data.expiresAt },
          ],
        },
        {
          type: 'TextBlock',
          text: 'Comandos que se ejecutaran:',
          weight: 'Bolder',
          spacing: 'Medium',
        },
        {
          type: 'TextBlock',
          text: (data.commands || []).join('\n'),
          fontType: 'Monospace',
          size: 'Small',
          wrap: true,
        },
      ],
      actions: [
        {
          type: 'Action.OpenUrl',
          title: 'APROBAR',
          url: data.approveUrl || `${APPROVAL_API_URL}/approvals/${data.approvalId}/approve?token=${data.token || ''}`,
          style: 'positive',
        },
        {
          type: 'Action.OpenUrl',
          title: 'RECHAZAR',
          url: data.rejectUrl || `${APPROVAL_API_URL}/approvals/${data.approvalId}/reject?token=${data.token || ''}`,
          style: 'destructive',
        },
      ],
    };
  },

  // ─── Resultado de aprobación ───
  APPROVAL_RESULT: (data) => {
    const isApproved = data.status === 'APPROVED';
    const color = isApproved ? 'Good' : 'Attention';

    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: `Avvale SAP AlwaysOps - Aprobacion ${data.status}`,
          weight: 'Bolder',
          size: 'Large',
          color: color,
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Sistema', value: data.systemId },
            { title: 'Runbook', value: data.runbookId },
            { title: 'Estado', value: data.status },
            { title: 'Procesado por', value: data.processedBy || 'N/A' },
          ],
        },
      ],
    };
  },

  // ─── Resultado de runbook ───
  RUNBOOK_RESULT: (data) => {
    const resultFacts = (data.results || []).map(r => ({
      title: r.runbookId,
      value: `${r.success ? 'OK' : 'FALLO'} - ${r.metricName || 'N/A'} (${r.autoExecuted ? 'Auto' : 'Aprobado'})`,
    }));

    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Avvale SAP AlwaysOps - Resultado de Runbook',
          weight: 'Bolder',
          size: 'Large',
          color: 'Accent',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Sistema', value: data.systemId },
            { title: 'Acciones', value: `${(data.results || []).length}` },
          ],
        },
        {
          type: 'FactSet',
          facts: resultFacts,
        },
      ],
    };
  },

  // ─── Recomendación del advisor ───
  ADVISOR_RECOMMENDATION: (data) => {
    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Avvale SAP AlwaysOps - Recomendacion del Advisor',
          weight: 'Bolder',
          size: 'Large',
          color: 'Accent',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Sistema', value: data.systemId },
            { title: 'Tipo', value: data.originalEventType === 'BREACH_DETECTED' ? 'Analisis de Breach' : 'Snapshot Periodico' },
            { title: 'Motor IA', value: data.bedrockUsed ? 'Bedrock (Claude)' : 'Analisis basico' },
          ],
        },
        {
          type: 'TextBlock',
          text: 'Recomendacion:',
          weight: 'Bolder',
          spacing: 'Medium',
        },
        {
          type: 'TextBlock',
          text: data.recommendation || 'Sin recomendacion disponible',
          wrap: true,
          size: 'Small',
        },
      ],
    };
  },

  // ─── Anomalía HA ───
  HA_ANOMALY: (data) => {
    const anomalyFacts = (data.anomalies || []).map(a => ({
      title: `${a.severity}: ${a.metric}`,
      value: a.detail,
    }));

    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Avvale SAP AlwaysOps - Anomalia HA',
          weight: 'Bolder',
          size: 'Large',
          color: 'Attention',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Sistema', value: data.systemId },
            { title: 'Severidad', value: data.severity },
          ],
        },
        {
          type: 'TextBlock',
          text: 'Anomalias detectadas:',
          weight: 'Bolder',
          spacing: 'Medium',
        },
        {
          type: 'FactSet',
          facts: anomalyFacts,
        },
      ],
    };
  },

  // ─── Digest Ejecutivo Diario (UC4) ───
  DAILY_DIGEST: (data) => {
    const systemFacts = (data.systemsSummary || []).map(s => ({
      title: s.systemId,
      value: `Metricas: ${s.metricsCollected || 0}, Breaches: ${s.breachCount || 0}, Runbooks: ${s.runbooksExecuted || 0}`,
    }));

    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Avvale SAP AlwaysOps - Digest Ejecutivo Diario',
          weight: 'Bolder',
          size: 'Large',
          color: 'Accent',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Periodo', value: data.period || 'Ultimas 24h' },
            { title: 'Sistemas', value: `${data.systemsCount || 0}` },
            { title: 'Motor IA', value: data.bedrockUsed ? 'Bedrock (Claude)' : 'Automatico' },
          ],
        },
        ...(systemFacts.length > 0 ? [
          {
            type: 'TextBlock',
            text: 'Resumen por Sistema:',
            weight: 'Bolder',
            spacing: 'Medium',
          },
          {
            type: 'FactSet',
            facts: systemFacts,
          },
        ] : []),
        {
          type: 'TextBlock',
          text: 'Analisis:',
          weight: 'Bolder',
          spacing: 'Medium',
        },
        {
          type: 'TextBlock',
          text: data.digest || 'Sin analisis disponible',
          wrap: true,
          size: 'Small',
        },
      ],
    };
  },

  // ─── Predicción de Disco (UC2) ───
  DISK_FORECAST: (data) => {
    const forecastFacts = (data.forecasts || []).map(f => ({
      title: `${f.systemId}: ${f.mountPoint || f.metricName}`,
      value: `${f.currentPct}% actual -> lleno en ${f.daysToFull} dias`,
    }));

    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Avvale SAP AlwaysOps - Prediccion de Disco (UC2)',
          weight: 'Bolder',
          size: 'Large',
          color: 'Warning',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Motor IA', value: data.bedrockUsed ? 'Bedrock (Claude)' : 'Regresion lineal' },
            { title: 'Ventana', value: data.forecastWindow || '6 horas' },
            { title: 'Alertas', value: `${(data.forecasts || []).length}` },
          ],
        },
        ...(forecastFacts.length > 0 ? [
          {
            type: 'TextBlock',
            text: 'Predicciones:',
            weight: 'Bolder',
            spacing: 'Medium',
          },
          {
            type: 'FactSet',
            facts: forecastFacts,
          },
        ] : []),
        ...(data.analysis ? [{
          type: 'TextBlock',
          text: data.analysis,
          wrap: true,
          size: 'Small',
          spacing: 'Medium',
        }] : []),
      ],
    };
  },

  // ─── Alerta de Safety Gate (UC3) ───
  SAFETY_GATE_ALERT: (data) => {
    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Avvale SAP AlwaysOps - Safety Gate Bloqueo (UC3)',
          weight: 'Bolder',
          size: 'Large',
          color: 'Attention',
        },
        {
          type: 'TextBlock',
          text: 'El Safety Gate bloqueo una auto-ejecucion de runbook.',
          wrap: true,
          color: 'Attention',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Sistema', value: data.systemId },
            { title: 'Runbook', value: data.runbookId },
            { title: 'Decision', value: data.decision },
            { title: 'Razon', value: data.reason || 'N/A' },
            ...(data.condition ? [{ title: 'Condicion', value: data.condition }] : []),
            ...(data.alternative ? [{ title: 'Alternativa', value: data.alternative }] : []),
          ],
        },
        {
          type: 'TextBlock',
          text: 'El runbook fue redirigido a aprobacion humana.',
          size: 'Small',
          isSubtle: true,
          wrap: true,
        },
      ],
    };
  },

  // ─── Alerta preventiva ───
  PREVENTIVE_ALERT: (data) => {
    const predFacts = (data.predictions || []).map(p => ({
      title: p.metricName,
      value: `Actual: ${p.currentValue} -> Predicho: ${p.predictedValue} (umbral: ${p.threshold}, ${p.minutesToBreach ? p.minutesToBreach + ' min' : 'N/A'})`,
    }));

    return {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Avvale SAP AlwaysOps - Alerta Preventiva',
          weight: 'Bolder',
          size: 'Large',
          color: 'Warning',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Sistema', value: data.systemId },
            { title: 'Predicciones', value: `${(data.predictions || []).length}` },
          ],
        },
        {
          type: 'TextBlock',
          text: 'Metricas con tendencia preocupante:',
          weight: 'Bolder',
          spacing: 'Medium',
        },
        {
          type: 'FactSet',
          facts: predFacts,
        },
      ],
    };
  },
};

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Recibe eventos de SNS y envía Adaptive Cards a Teams.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Avvale SAP AlwaysOps Teams Agent v1.0 invocado');
  const startTime = Date.now();

  try {
    const records = event.Records || [];

    if (records.length === 0) {
      log.info('No hay registros SNS para procesar');
      return { statusCode: 200, body: { message: 'Sin eventos' } };
    }

    const results = [];

    for (const record of records) {
      const snsMessage = record.Sns?.Message;
      if (!snsMessage) continue;

      const data = JSON.parse(snsMessage);
      const eventType = data.type;

      log.info('Procesando evento', { eventType, systemId: data.systemId || 'N/A' });

      // Buscar el constructor de card correspondiente
      const cardBuilder = CARDS[eventType];
      if (!cardBuilder) {
        log.warn('No hay card para tipo de evento', { eventType });
        continue;
      }

      // Construir la Adaptive Card
      const card = cardBuilder(data);

      // Enviar a Teams
      const sendResult = await sendToTeams(card);

      results.push({
        eventType,
        systemId: data.systemId || 'N/A',
        sent: sendResult.success,
        error: sendResult.error,
      });
    }

    const duration = Date.now() - startTime;
    log.info('Completado', { duration: `${duration}ms`, results });

    return {
      statusCode: 200,
      body: {
        message: 'Avvale SAP AlwaysOps Teams Agent v1.0 completado',
        duration: `${duration}ms`,
        messagesSent: results.filter(r => r.sent).length,
        results,
      },
    };

  } catch (err) {
    log.error('Error fatal', { error: err.message, stack: err.stack });
    return { statusCode: 500, body: { error: err.message } };
  }
};
