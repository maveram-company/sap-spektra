'use strict';

// =====================================================================
//  SAP Spektra v1.0 -- Slack Agent
//  Agente de notificaciones para Slack via Incoming Webhooks.
//
//  Que hace este Lambda?
//  Esta suscrito a los SNS topics de SAP Spektra (AlertsTopic,
//  ApprovalsTopic). Cuando recibe un evento, construye un mensaje
//  usando Slack Block Kit (el formato de mensaje enriquecido de Slack)
//  y lo envia al canal de Slack configurado via webhook.
//
//  Sigue el mismo patron que el teams-agent pero usa Block Kit
//  en lugar de Adaptive Cards.
//
//  Dependencias:
//  - @aws-sdk/client-secrets-manager (para leer el webhook URL)
//  - https nativo de Node.js (para enviar el mensaje, sin axios)
// =====================================================================

const https = require('https');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const log = require('../utilidades/logger')('slack-agent');

// Cliente de Secrets Manager (se reutiliza entre invocaciones)
const secretsMgr = new SecretsManagerClient({});

// =====================================================================
//  CONFIGURACION
//  Variables de entorno que el Lambda necesita para funcionar.
//  SLACK_WEBHOOK_SECRET_ARN: ARN del secreto en Secrets Manager
//  que contiene la URL del webhook de Slack.
//  APPROVAL_API_URL: URL base del API Gateway de aprobaciones.
// =====================================================================

const SLACK_WEBHOOK_SECRET_ARN = process.env.SLACK_WEBHOOK_SECRET_ARN || '';
const APPROVAL_API_URL = process.env.APPROVAL_API_URL || 'https://YOUR-API-GATEWAY-URL';

// Cache del webhook URL para no leer Secrets Manager en cada invocacion
let cachedWebhookUrl = null;

// =====================================================================
//  FUNCION: getSlackWebhookUrl
//  Obtiene la URL del webhook de Slack desde AWS Secrets Manager.
//  Usa un cache en memoria para evitar llamadas repetidas a
//  Secrets Manager (el Lambda se reutiliza entre invocaciones).
// =====================================================================

async function getSlackWebhookUrl() {
  // Si ya esta en cache, usarlo directamente
  if (cachedWebhookUrl) {
    return cachedWebhookUrl;
  }

  // Intentar leer desde Secrets Manager primero
  if (SLACK_WEBHOOK_SECRET_ARN) {
    try {
      const res = await secretsMgr.send(
        new GetSecretValueCommand({ SecretId: SLACK_WEBHOOK_SECRET_ARN })
      );
      const secret = JSON.parse(res.SecretString);
      // El secreto puede tener la URL en diferentes campos
      cachedWebhookUrl = secret.webhookUrl || secret.url || secret.slack_webhook || res.SecretString;
      log.info('Webhook URL cargado desde Secrets Manager');
      return cachedWebhookUrl;
    } catch (err) {
      log.warn('Error leyendo Secrets Manager', { error: err.message });
    }
  }

  // Fallback a variable de entorno directa (para desarrollo local)
  cachedWebhookUrl = process.env.SLACK_WEBHOOK_URL || '';
  if (cachedWebhookUrl) {
    log.info('Webhook URL cargado desde variable de entorno');
  }
  return cachedWebhookUrl;
}

// =====================================================================
//  FUNCION: sendToSlack
//  Envia un mensaje con bloques al canal de Slack usando el webhook
//  configurado. Usa el modulo HTTPS nativo de Node.js para no
//  necesitar dependencias adicionales como axios o node-fetch.
// =====================================================================

async function sendToSlack(payload) {
  const webhookUrlStr = await getSlackWebhookUrl();

  if (!webhookUrlStr) {
    log.warn('Webhook URL no configurado (ni Secrets Manager ni env var)');
    return { success: false, error: 'Webhook no configurado' };
  }

  return new Promise((resolve) => {
    const body = JSON.stringify(payload);

    // Parsear la URL del webhook
    const webhookUrl = new URL(webhookUrlStr);

    const options = {
      hostname: webhookUrl.hostname,
      path: webhookUrl.pathname + webhookUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          log.info('Mensaje enviado exitosamente a Slack', {
            statusCode: res.statusCode,
          });
          resolve({ success: true });
        } else {
          log.error('Error HTTP al enviar a Slack', {
            statusCode: res.statusCode,
            response: responseBody,
          });
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${responseBody}` });
        }
      });
    });

    req.on('error', (err) => {
      log.error('Error de red al enviar a Slack', { error: err.message });
      resolve({ success: false, error: err.message });
    });

    // Timeout de 10 segundos para evitar que el Lambda se quede colgado
    req.setTimeout(10000, () => {
      req.destroy();
      log.error('Timeout al enviar a Slack');
      resolve({ success: false, error: 'Timeout (10s)' });
    });

    req.write(body);
    req.end();
  });
}

// =====================================================================
//  HELPERS PARA BLOCK KIT
//  Funciones auxiliares que simplifican la creacion de bloques
//  de Slack Block Kit. Cada funcion retorna un bloque valido.
// =====================================================================

// Crea un bloque de encabezado (header)
function headerBlock(text) {
  return {
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  };
}

// Crea un bloque de seccion con texto en Markdown
function sectionBlock(text) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text },
  };
}

// Crea un bloque de seccion con campos (key-value pairs)
// Los campos se muestran en dos columnas en Slack
function fieldsBlock(fields) {
  return {
    type: 'section',
    fields: fields.map((f) => ({
      type: 'mrkdwn',
      text: `*${f.label}:*\n${f.value}`,
    })),
  };
}

// Crea un divider (linea horizontal de separacion)
function dividerBlock() {
  return { type: 'divider' };
}

// Crea un bloque de contexto (texto pequeno, para notas al pie)
function contextBlock(text) {
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text }],
  };
}

// Crea un bloque de acciones con botones
function actionsBlock(buttons) {
  return {
    type: 'actions',
    elements: buttons.map((b) => ({
      type: 'button',
      text: { type: 'plain_text', text: b.text, emoji: true },
      url: b.url,
      style: b.style || undefined, // 'primary' = verde, 'danger' = rojo
      action_id: b.actionId || b.text.toLowerCase().replace(/\s+/g, '_'),
    })),
  };
}

// Crea un bloque de codigo (preformateado)
function codeBlock(text) {
  return sectionBlock('```' + text + '```');
}

// =====================================================================
//  MAPA DE COLORES POR TIPO DE EVENTO
//  En Slack, el "color" se aplica como barra lateral en los
//  attachments. Usamos hex codes que coinciden con la severidad.
// =====================================================================

const EVENT_COLORS = {
  BREACH_DETECTED: '#DC3545',    // Rojo - alerta critica
  RUNBOOK_EXECUTED: '#28A745',   // Verde - ejecucion exitosa (default)
  APPROVAL_REQUEST: '#FFC107',   // Amarillo - requiere accion
  APPROVAL_RESULT: '#17A2B8',   // Azul - informativo
  PREDICTION_ALERT: '#FD7E14',  // Naranja - prediccion/advertencia
  HA_FAILOVER: '#DC3545',       // Rojo - failover critico
  DAILY_DIGEST: '#6F42C1',     // Morado - resumen
  SAFETY_GATE_ALERT: '#DC3545', // Rojo - bloqueo de seguridad
  DISK_FORECAST: '#FFC107',     // Amarillo - prediccion de disco
};

// =====================================================================
//  CONSTRUCTORES DE MENSAJES SLACK BLOCK KIT
//  Cada tipo de evento tiene su propio constructor que genera
//  los bloques de Slack Block Kit apropiados.
//  Los mensajes usan "attachments" para la barra de color lateral
//  y "blocks" dentro del attachment para el contenido enriquecido.
// =====================================================================

const MESSAGES = {

  // -----------------------------------------------------------------
  //  BREACH_DETECTED
  //  Se dispara cuando una metrica de SAP supera su umbral.
  //  Muestra detalles del sistema, metricas afectadas y runbooks.
  // -----------------------------------------------------------------
  BREACH_DETECTED: (data) => {
    const severity = (data.breaches || []).some((b) => b.severity === 'CRITICAL')
      ? 'CRITICAL'
      : 'HIGH';
    const emoji = severity === 'CRITICAL' ? ':red_circle:' : ':large_yellow_circle:';
    const color = severity === 'CRITICAL' ? '#DC3545' : '#FFC107';

    // Construir la lista de breaches como texto formateado
    const breachLines = (data.breaches || []).map((b) =>
      `${b.severity === 'CRITICAL' ? ':red_circle:' : ':large_yellow_circle:'} *${b.metricName}*: ` +
      `\`${b.value}\` (umbral: \`${b.threshold}\`) - Runbook: \`${b.runbook}\``
    );

    const blocks = [
      headerBlock(`${emoji} SAP Spektra - Alerta de Breach (${severity})`),
      fieldsBlock([
        { label: 'Sistema', value: data.systemId || 'N/A' },
        { label: 'Tipo', value: `${data.systemType || 'N/A'} / ${data.dbType || 'N/A'}` },
        { label: 'SID', value: data.sid || 'N/A' },
        { label: 'Ambiente', value: data.env || 'N/A' },
      ]),
      dividerBlock(),
      sectionBlock(`*Breaches detectados: ${(data.breaches || []).length}*`),
      ...breachLines.map((line) => sectionBlock(line)),
      dividerBlock(),
      contextBlock(
        ':information_source: Los runbooks costSafe se ejecutan automaticamente. ' +
        'Los demas requieren aprobacion humana.'
      ),
    ];

    return { color, blocks };
  },

  // -----------------------------------------------------------------
  //  RUNBOOK_EXECUTED
  //  Se dispara cuando un runbook termina de ejecutarse.
  //  Muestra si fue exitoso o fallo, con detalles de cada paso.
  // -----------------------------------------------------------------
  RUNBOOK_EXECUTED: (data) => {
    const allSuccess = (data.results || []).every((r) => r.success);
    const emoji = allSuccess ? ':white_check_mark:' : ':x:';
    const color = allSuccess ? '#28A745' : '#DC3545';
    const statusText = allSuccess ? 'Exitoso' : 'Con Fallos';

    // Detalle de cada resultado de runbook
    const resultLines = (data.results || []).map((r) => {
      const icon = r.success ? ':white_check_mark:' : ':x:';
      const mode = r.autoExecuted ? 'Auto' : 'Aprobado';
      return `${icon} *${r.runbookId}*: ${r.success ? 'OK' : 'FALLO'} - ` +
        `${r.metricName || 'N/A'} (${mode})` +
        (r.output ? `\n    _${r.output}_` : '');
    });

    const blocks = [
      headerBlock(`${emoji} SAP Spektra - Resultado de Runbook (${statusText})`),
      fieldsBlock([
        { label: 'Sistema', value: data.systemId || 'N/A' },
        { label: 'Acciones ejecutadas', value: `${(data.results || []).length}` },
        { label: 'Estado general', value: statusText },
        { label: 'Timestamp', value: data.timestamp || new Date().toISOString() },
      ]),
      dividerBlock(),
      sectionBlock('*Detalle de ejecuciones:*'),
      ...resultLines.map((line) => sectionBlock(line)),
    ];

    // Si hubo fallos, agregar nota de contexto
    if (!allSuccess) {
      blocks.push(dividerBlock());
      blocks.push(
        contextBlock(
          ':warning: Algunos runbooks fallaron. Revise los logs en CloudWatch ' +
          'para mas detalles sobre los errores.'
        )
      );
    }

    return { color, blocks };
  },

  // -----------------------------------------------------------------
  //  APPROVAL_REQUEST
  //  Se dispara cuando se necesita aprobacion humana para ejecutar
  //  un runbook. Incluye botones de aprobar/rechazar que enlazan
  //  al API Gateway de aprobaciones.
  // -----------------------------------------------------------------
  APPROVAL_REQUEST: (data) => {
    const color = '#FFC107';

    // Construir la URL de aprobacion y rechazo
    const approveUrl = data.approveUrl ||
      `${APPROVAL_API_URL}/approvals/${data.approvalId}/approve?token=${data.token || ''}`;
    const rejectUrl = data.rejectUrl ||
      `${APPROVAL_API_URL}/approvals/${data.approvalId}/reject?token=${data.token || ''}`;

    // Lista de comandos que se ejecutaran
    const commandsText = (data.commands || []).length > 0
      ? (data.commands || []).join('\n')
      : 'Sin comandos especificados';

    const fields = [
      { label: 'Sistema', value: data.systemId || 'N/A' },
      { label: 'Runbook', value: data.runbookId || 'N/A' },
      { label: 'Severidad', value: data.severity || 'N/A' },
      { label: 'Metrica', value: `${data.metricName || 'N/A'} = \`${data.metricValue || 'N/A'}\`` },
    ];

    // Agregar costo estimado si esta disponible
    if (data.costEstimate) {
      fields.push({
        label: 'Costo estimado',
        value: `$${data.costEstimate.costUsd}/mes - ${data.costEstimate.description}`,
      });
    }

    // Agregar decision del Safety Gate si esta disponible
    if (data.safetyGateDecision) {
      fields.push({
        label: 'Safety Gate',
        value: `${data.safetyGateDecision}: ${data.safetyGateReason || ''}`,
      });
    }

    fields.push({ label: 'Expira', value: data.expiresAt || 'N/A' });

    const blocks = [
      headerBlock(':large_yellow_circle: SAP Spektra - Aprobacion Requerida'),
      sectionBlock(
        ':warning: *Se requiere aprobacion humana* para ejecutar una accion correctiva.'
      ),
      fieldsBlock(fields.slice(0, 8)), // Slack permite max 10 fields, usamos hasta 8
      ...(fields.length > 8 ? [fieldsBlock(fields.slice(8))] : []),
      dividerBlock(),
      sectionBlock('*Comandos que se ejecutaran:*'),
      codeBlock(commandsText),
      dividerBlock(),
      actionsBlock([
        { text: 'APROBAR', url: approveUrl, style: 'primary', actionId: 'approve_runbook' },
        { text: 'RECHAZAR', url: rejectUrl, style: 'danger', actionId: 'reject_runbook' },
      ]),
      contextBlock(
        ':clock3: Esta solicitud expira automaticamente si no se responde a tiempo.'
      ),
    ];

    return { color, blocks };
  },

  // -----------------------------------------------------------------
  //  APPROVAL_RESULT
  //  Se dispara cuando una solicitud de aprobacion es procesada
  //  (aprobada o rechazada). Informativo.
  // -----------------------------------------------------------------
  APPROVAL_RESULT: (data) => {
    const isApproved = data.status === 'APPROVED';
    const emoji = isApproved ? ':white_check_mark:' : ':no_entry_sign:';
    const color = isApproved ? '#28A745' : '#DC3545';
    const statusLabel = isApproved ? 'APROBADA' : 'RECHAZADA';

    const blocks = [
      headerBlock(`${emoji} SAP Spektra - Aprobacion ${statusLabel}`),
      fieldsBlock([
        { label: 'Sistema', value: data.systemId || 'N/A' },
        { label: 'Runbook', value: data.runbookId || 'N/A' },
        { label: 'Estado', value: data.status || 'N/A' },
        { label: 'Procesado por', value: data.processedBy || 'N/A' },
      ]),
    ];

    // Si fue aprobado, mostrar nota de que el runbook se ejecutara
    if (isApproved) {
      blocks.push(dividerBlock());
      blocks.push(
        contextBlock(
          ':rocket: El runbook se ejecutara automaticamente ahora que fue aprobado.'
        )
      );
    }

    // Si fue rechazado y tiene razon, mostrarla
    if (!isApproved && data.reason) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock(`*Razon del rechazo:*\n${data.reason}`));
    }

    return { color, blocks };
  },

  // -----------------------------------------------------------------
  //  PREDICTION_ALERT
  //  Se dispara cuando el motor preventivo detecta que una metrica
  //  va a superar su umbral en el futuro cercano. Naranja.
  // -----------------------------------------------------------------
  PREDICTION_ALERT: (data) => {
    const color = '#FD7E14';

    // Construir la lista de predicciones
    const predictionLines = (data.predictions || []).map((p) => {
      const urgency = p.minutesToBreach && p.minutesToBreach <= 30
        ? ':red_circle:'
        : ':large_orange_circle:';
      return `${urgency} *${p.metricName}*: Actual \`${p.currentValue}\` -> ` +
        `Predicho \`${p.predictedValue}\` (umbral: \`${p.threshold}\`)` +
        (p.minutesToBreach ? ` - _breach en ~${p.minutesToBreach} min_` : '');
    });

    const blocks = [
      headerBlock(':warning: SAP Spektra - Alerta Preventiva'),
      fieldsBlock([
        { label: 'Sistema', value: data.systemId || 'N/A' },
        { label: 'Predicciones', value: `${(data.predictions || []).length}` },
        { label: 'Motor IA', value: data.bedrockUsed ? 'Bedrock (Claude)' : 'Regresion lineal' },
        { label: 'Ventana', value: data.forecastWindow || '30 minutos' },
      ]),
      dividerBlock(),
      sectionBlock('*Metricas con tendencia preocupante:*'),
      ...predictionLines.map((line) => sectionBlock(line)),
      dividerBlock(),
      contextBlock(
        ':crystal_ball: Estas predicciones son estimaciones basadas en tendencias ' +
        'recientes. Monitoree activamente estas metricas.'
      ),
    ];

    return { color, blocks };
  },

  // -----------------------------------------------------------------
  //  HA_FAILOVER
  //  Se dispara cuando ocurre un failover de alta disponibilidad.
  //  Es un evento critico que requiere atencion inmediata.
  // -----------------------------------------------------------------
  HA_FAILOVER: (data) => {
    const color = '#DC3545';

    const fields = [
      { label: 'Sistema', value: data.systemId || 'N/A' },
      { label: 'Tipo de failover', value: data.failoverType || 'N/A' },
      { label: 'Nodo origen', value: data.sourceNode || 'N/A' },
      { label: 'Nodo destino', value: data.targetNode || 'N/A' },
    ];

    if (data.reason) {
      fields.push({ label: 'Razon', value: data.reason });
    }
    if (data.duration) {
      fields.push({ label: 'Duracion', value: data.duration });
    }
    if (data.haStatus) {
      fields.push({ label: 'Estado HA', value: data.haStatus });
    }
    if (data.replicationStatus) {
      fields.push({ label: 'Replicacion', value: data.replicationStatus });
    }

    const blocks = [
      headerBlock(':red_circle: SAP Spektra - HA Failover Detectado'),
      sectionBlock(
        ':rotating_light: *ALERTA CRITICA*: Se detecto un failover de alta disponibilidad. ' +
        'Requiere atencion inmediata del equipo de Basis.'
      ),
      fieldsBlock(fields.slice(0, 8)),
      ...(fields.length > 8 ? [fieldsBlock(fields.slice(8))] : []),
    ];

    // Si hay detalles adicionales del failover
    if (data.details) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock(`*Detalles:*\n${data.details}`));
    }

    // Si hay pasos de recuperacion recomendados
    if (data.recoverySteps && data.recoverySteps.length > 0) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock('*Pasos de recuperacion recomendados:*'));
      const steps = data.recoverySteps.map((step, i) => `${i + 1}. ${step}`).join('\n');
      blocks.push(sectionBlock(steps));
    }

    blocks.push(dividerBlock());
    blocks.push(
      contextBlock(
        ':hospital: Revise el estado del cluster HA inmediatamente. ' +
        'Verifique la replicacion de HANA y el estado de Pacemaker/Corosync.'
      )
    );

    return { color, blocks };
  },

  // -----------------------------------------------------------------
  //  DAILY_DIGEST
  //  Resumen ejecutivo diario con estadisticas de todos los
  //  sistemas monitoreados. Se envia una vez al dia.
  // -----------------------------------------------------------------
  DAILY_DIGEST: (data) => {
    const color = '#6F42C1';

    // Resumen global de metricas
    const totalBreaches = (data.systemsSummary || []).reduce(
      (sum, s) => sum + (s.breachCount || 0), 0
    );
    const totalRunbooks = (data.systemsSummary || []).reduce(
      (sum, s) => sum + (s.runbooksExecuted || 0), 0
    );
    const totalMetrics = (data.systemsSummary || []).reduce(
      (sum, s) => sum + (s.metricsCollected || 0), 0
    );

    // Detalle por sistema
    const systemLines = (data.systemsSummary || []).map((s) => {
      const statusIcon = (s.breachCount || 0) > 0 ? ':large_yellow_circle:' : ':green_circle:';
      return `${statusIcon} *${s.systemId}*: ` +
        `${s.metricsCollected || 0} metricas, ` +
        `${s.breachCount || 0} breaches, ` +
        `${s.runbooksExecuted || 0} runbooks`;
    });

    const blocks = [
      headerBlock(':bar_chart: SAP Spektra - Digest Ejecutivo Diario'),
      fieldsBlock([
        { label: 'Periodo', value: data.period || 'Ultimas 24h' },
        { label: 'Sistemas monitoreados', value: `${data.systemsCount || 0}` },
        { label: 'Motor IA', value: data.bedrockUsed ? 'Bedrock (Claude)' : 'Automatico' },
        { label: 'Generado', value: new Date().toISOString() },
      ]),
      dividerBlock(),
      sectionBlock(
        `:chart_with_upwards_trend: *Resumen Global*\n` +
        `- Total metricas recolectadas: *${totalMetrics}*\n` +
        `- Total breaches detectados: *${totalBreaches}*\n` +
        `- Total runbooks ejecutados: *${totalRunbooks}*`
      ),
    ];

    // Agregar detalle por sistema si hay datos
    if (systemLines.length > 0) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock('*Resumen por sistema:*'));
      systemLines.forEach((line) => blocks.push(sectionBlock(line)));
    }

    // Agregar analisis/digest si esta disponible
    if (data.digest) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock('*Analisis:*'));
      blocks.push(sectionBlock(data.digest));
    }

    // Agregar recomendaciones si estan disponibles
    if (data.recommendations && data.recommendations.length > 0) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock('*Recomendaciones:*'));
      const recs = data.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');
      blocks.push(sectionBlock(recs));
    }

    blocks.push(dividerBlock());
    blocks.push(
      contextBlock(':robot_face: SAP Spektra v1.0 - Generado automaticamente')
    );

    return { color, blocks };
  },

  // -----------------------------------------------------------------
  //  SAFETY_GATE_ALERT
  //  Se dispara cuando el Safety Gate bloquea la ejecucion
  //  automatica de un runbook por razones de seguridad.
  // -----------------------------------------------------------------
  SAFETY_GATE_ALERT: (data) => {
    const color = '#DC3545';

    const fields = [
      { label: 'Sistema', value: data.systemId || 'N/A' },
      { label: 'Runbook', value: data.runbookId || 'N/A' },
      { label: 'Decision', value: data.decision || 'BLOCKED' },
      { label: 'Razon', value: data.reason || 'N/A' },
    ];

    if (data.condition) {
      fields.push({ label: 'Condicion', value: data.condition });
    }
    if (data.alternative) {
      fields.push({ label: 'Alternativa', value: data.alternative });
    }
    if (data.riskScore !== undefined) {
      fields.push({ label: 'Puntaje de riesgo', value: `${data.riskScore}/100` });
    }
    if (data.executionsLast24h !== undefined) {
      fields.push({ label: 'Ejecuciones (24h)', value: `${data.executionsLast24h}` });
    }

    const blocks = [
      headerBlock(':shield: SAP Spektra - Safety Gate Bloqueo'),
      sectionBlock(
        ':no_entry: *El Safety Gate bloqueo una auto-ejecucion de runbook.* ' +
        'Se requiere revision humana antes de proceder.'
      ),
      fieldsBlock(fields.slice(0, 8)),
      ...(fields.length > 8 ? [fieldsBlock(fields.slice(8))] : []),
    ];

    // Si hay detalles de las condiciones evaluadas
    if (data.evaluatedConditions && data.evaluatedConditions.length > 0) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock('*Condiciones evaluadas:*'));
      data.evaluatedConditions.forEach((cond) => {
        const icon = cond.passed ? ':white_check_mark:' : ':x:';
        blocks.push(sectionBlock(`${icon} ${cond.name}: ${cond.detail || ''}`));
      });
    }

    blocks.push(dividerBlock());
    blocks.push(
      contextBlock(
        ':lock: El runbook fue redirigido a aprobacion humana. ' +
        'Revise las condiciones del Safety Gate antes de aprobar.'
      )
    );

    return { color, blocks };
  },

  // -----------------------------------------------------------------
  //  DISK_FORECAST
  //  Prediccion de llenado de disco. Muestra cuando se estima
  //  que cada punto de montaje alcanzara el 100%.
  // -----------------------------------------------------------------
  DISK_FORECAST: (data) => {
    const color = '#FFC107';

    // Construir la lista de predicciones de disco
    const forecastLines = (data.forecasts || []).map((f) => {
      const urgency = f.daysToFull <= 3
        ? ':red_circle:'
        : f.daysToFull <= 7
          ? ':large_yellow_circle:'
          : ':large_blue_circle:';
      return `${urgency} *${f.systemId || data.systemId}: ${f.mountPoint || f.metricName}*\n` +
        `    Actual: \`${f.currentPct}%\` -> Lleno en *${f.daysToFull} dias*` +
        (f.growthRatePerDay ? ` (crece ${f.growthRatePerDay}%/dia)` : '');
    });

    const blocks = [
      headerBlock(':floppy_disk: SAP Spektra - Prediccion de Disco'),
      fieldsBlock([
        { label: 'Motor IA', value: data.bedrockUsed ? 'Bedrock (Claude)' : 'Regresion lineal' },
        { label: 'Ventana', value: data.forecastWindow || '6 horas' },
        { label: 'Alertas', value: `${(data.forecasts || []).length}` },
        { label: 'Timestamp', value: data.timestamp || new Date().toISOString() },
      ]),
      dividerBlock(),
      sectionBlock('*Predicciones de llenado:*'),
      ...forecastLines.map((line) => sectionBlock(line)),
    ];

    // Agregar analisis si esta disponible
    if (data.analysis) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock(`*Analisis:*\n${data.analysis}`));
    }

    // Agregar recomendaciones de limpieza si estan disponibles
    if (data.cleanupSuggestions && data.cleanupSuggestions.length > 0) {
      blocks.push(dividerBlock());
      blocks.push(sectionBlock('*Sugerencias de limpieza:*'));
      const suggestions = data.cleanupSuggestions
        .map((s, i) => `${i + 1}. ${s}`)
        .join('\n');
      blocks.push(sectionBlock(suggestions));
    }

    blocks.push(dividerBlock());
    blocks.push(
      contextBlock(
        ':chart_with_downwards_trend: Basado en tendencias de las ultimas ' +
        `${data.forecastWindow || '6 horas'}. ` +
        'Considere limpiar logs, traces y backups antiguos.'
      )
    );

    return { color, blocks };
  },
};

// =====================================================================
//  FUNCION: buildSlackPayload
//  Toma la salida de un constructor de mensajes (color + blocks)
//  y la envuelve en el formato que Slack espera para webhooks
//  con attachments y bloques.
// =====================================================================

function buildSlackPayload(eventType, messageData) {
  const { color, blocks } = messageData;

  return {
    // Texto de fallback (se muestra en notificaciones push y previews)
    text: `SAP Spektra - ${eventType.replace(/_/g, ' ')}`,
    // Usamos attachments para la barra de color lateral
    attachments: [
      {
        color: color || EVENT_COLORS[eventType] || '#808080',
        blocks,
      },
    ],
  };
}

// =====================================================================
//  FUNCION: buildFallbackMessage
//  Cuando no hay un constructor especifico para un tipo de evento,
//  se genera un mensaje generico con los datos disponibles.
//  Esto asegura que ningun evento se pierda silenciosamente.
// =====================================================================

function buildFallbackMessage(eventType, data) {
  const blocks = [
    headerBlock(`:bell: SAP Spektra - ${eventType.replace(/_/g, ' ')}`),
    fieldsBlock([
      { label: 'Tipo de evento', value: eventType },
      { label: 'Sistema', value: data.systemId || 'N/A' },
      { label: 'Timestamp', value: data.timestamp || new Date().toISOString() },
    ]),
    dividerBlock(),
    sectionBlock(
      '*Datos del evento:*\n' +
      '```' + JSON.stringify(data, null, 2).substring(0, 2500) + '```'
    ),
    contextBlock(
      ':information_source: No existe un formato especifico para este tipo de evento. ' +
      'Mostrando datos en formato raw.'
    ),
  ];

  return {
    color: '#808080',
    blocks,
  };
}

// =====================================================================
//  HANDLER PRINCIPAL
//  Recibe eventos de SNS y envia mensajes Block Kit a Slack.
//  Procesa cada registro SNS secuencialmente para respetar
//  los rate limits de Slack (1 msg/seg por webhook).
// =====================================================================

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  const startTime = Date.now();
  const invocationId = `slack-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  log.info('SAP Spektra Slack Agent v1.0 invocado', {
    invocationId,
    recordCount: (event.Records || []).length,
  });

  try {
    const records = event.Records || [];

    // Si no hay registros SNS, terminar rapido
    if (records.length === 0) {
      log.info('No hay registros SNS para procesar', { invocationId });
      return {
        statusCode: 200,
        body: { message: 'Sin eventos', invocationId },
      };
    }

    const results = [];

    for (const record of records) {
      // Extraer el mensaje SNS
      const snsMessage = record.Sns?.Message;
      if (!snsMessage) {
        log.warn('Registro SNS sin mensaje, saltando', {
          invocationId,
          messageId: record.Sns?.MessageId,
        });
        continue;
      }

      // Parsear el JSON del mensaje
      let data;
      try {
        data = JSON.parse(snsMessage);
      } catch (parseErr) {
        log.error('Error parseando mensaje SNS', {
          invocationId,
          error: parseErr.message,
          rawMessage: snsMessage.substring(0, 500),
        });
        continue;
      }

      const eventType = data.type || 'UNKNOWN';

      log.info('Procesando evento', {
        invocationId,
        eventType,
        systemId: data.systemId || 'N/A',
        snsMessageId: record.Sns?.MessageId,
      });

      // Buscar el constructor de mensaje correspondiente
      const messageBuilder = MESSAGES[eventType];

      let messageData;
      if (messageBuilder) {
        // Usar el constructor especifico para este tipo de evento
        try {
          messageData = messageBuilder(data);
        } catch (buildErr) {
          log.error('Error construyendo mensaje Block Kit', {
            invocationId,
            eventType,
            error: buildErr.message,
          });
          // Usar mensaje de fallback si falla la construccion
          messageData = buildFallbackMessage(eventType, data);
        }
      } else {
        // No hay constructor para este tipo: usar fallback
        log.warn('No hay constructor de mensaje para tipo de evento', {
          invocationId,
          eventType,
        });
        messageData = buildFallbackMessage(eventType, data);
      }

      // Construir el payload final de Slack
      const slackPayload = buildSlackPayload(eventType, messageData);

      // Enviar a Slack
      const sendResult = await sendToSlack(slackPayload);

      results.push({
        eventType,
        systemId: data.systemId || 'N/A',
        snsMessageId: record.Sns?.MessageId || 'N/A',
        sent: sendResult.success,
        error: sendResult.error || null,
      });

      // Pequena pausa entre mensajes para no saturar el webhook
      // Slack recomienda no mas de 1 mensaje por segundo por webhook
      if (records.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.sent).length;
    const failCount = results.filter((r) => !r.sent).length;

    log.info('SAP Spektra Slack Agent v1.0 completado', {
      invocationId,
      duration: `${duration}ms`,
      totalRecords: records.length,
      messagesSent: successCount,
      messagesFailed: failCount,
      results,
    });

    return {
      statusCode: 200,
      body: {
        message: 'SAP Spektra Slack Agent v1.0 completado',
        invocationId,
        duration: `${duration}ms`,
        messagesSent: successCount,
        messagesFailed: failCount,
        results,
      },
    };

  } catch (err) {
    const duration = Date.now() - startTime;

    log.error('Error fatal en Slack Agent', {
      invocationId,
      error: err.message,
      stack: err.stack,
      duration: `${duration}ms`,
    });

    // Intentar enviar un mensaje de error a Slack como ultimo recurso
    try {
      const errorPayload = {
        text: 'SAP Spektra - Error en Slack Agent',
        attachments: [{
          color: '#DC3545',
          blocks: [
            headerBlock(':sos: SAP Spektra - Error Interno'),
            sectionBlock(
              `El Slack Agent encontro un error fatal:\n\`\`\`${err.message}\`\`\``
            ),
            contextBlock(`Invocation ID: ${invocationId} | Duracion: ${duration}ms`),
          ],
        }],
      };
      await sendToSlack(errorPayload);
    } catch (fallbackErr) {
      log.error('Error enviando mensaje de fallback a Slack', {
        invocationId,
        error: fallbackErr.message,
      });
    }

    return {
      statusCode: 500,
      body: {
        error: err.message,
        invocationId,
        duration: `${duration}ms`,
      },
    };
  }
};
