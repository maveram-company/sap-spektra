'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Movidesk Agent
//  Agente de integración con Movidesk para gestión de tickets.
//
//  ¿Qué hace este Lambda?
//  Está suscrito al SNS topic sap-alwaysops-alerts.
//  Cuando recibe un evento (breach, runbook result, alerta
//  preventiva, resultado de aprobación), crea o actualiza
//  tickets en Movidesk via su API REST.
//  Almacena el mapeo de tickets en DynamoDB para poder
//  correlacionar eventos posteriores con tickets existentes.
//  Usa el módulo HTTPS nativo de Node.js (no necesita axios).
// ═══════════════════════════════════════════════════════════════

const https = require('https');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// ─── Structured JSON logging para CloudWatch Logs Insights ───
// Permite hacer queries como: fields @timestamp, systemId, movideskTicketId
// filter action = "CREATE_TICKET" | stats count(*) by eventType
function structuredLog(level, action, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'movidesk-agent',
    action,
    ...data,
  };
  console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](`[MOVIDESK] ${JSON.stringify(entry)}`);
}

// Clientes de AWS (se crean una sola vez, se reutilizan entre invocaciones)
const secretsMgr = new SecretsManagerClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ─── Configuración desde variables de entorno ───
const MOVIDESK_TOKEN_SECRET_ARN = process.env.MOVIDESK_TOKEN_SECRET_ARN || '';
const MOVIDESK_TOKEN_ENV = process.env.MOVIDESK_TOKEN || '';
const MOVIDESK_API_URL = process.env.MOVIDESK_API_URL || 'https://api.movidesk.com/public/v1';
const MOVIDESK_AGENT_ID = process.env.MOVIDESK_AGENT_ID || '';
const MOVIDESK_CLIENT_ID = process.env.MOVIDESK_CLIENT_ID || '';
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'sap-alwaysops-incidents';

// Caché del token para no leer Secrets Manager en cada invocación
let cachedToken = null;

// ─── Control de rate limit (10 req/min según límites de Movidesk) ───
let requestTimestamps = [];
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getMovideskToken
//  Obtiene el token de API de Movidesk. Primero intenta desde
//  Secrets Manager, luego cae a la variable de entorno.
//  Cachea el valor en memoria para evitar llamadas repetidas.
// ═══════════════════════════════════════════════════════════════

async function getMovideskToken() {
  // Si ya está en caché, usarlo
  if (cachedToken) return cachedToken;

  // Intentar desde Secrets Manager primero
  if (MOVIDESK_TOKEN_SECRET_ARN) {
    try {
      const res = await secretsMgr.send(new GetSecretValueCommand({ SecretId: MOVIDESK_TOKEN_SECRET_ARN }));
      const secret = JSON.parse(res.SecretString);
      cachedToken = secret.token || secret.apiToken || secret.movideskToken || res.SecretString;
      structuredLog('INFO', 'TOKEN_LOADED', { source: 'SecretsManager' });
      return cachedToken;
    } catch (err) {
      structuredLog('WARN', 'TOKEN_SM_ERROR', { error: err.message });
    }
  }

  // Fallback a variable de entorno
  if (MOVIDESK_TOKEN_ENV) {
    cachedToken = MOVIDESK_TOKEN_ENV;
    structuredLog('INFO', 'TOKEN_LOADED', { source: 'EnvVar' });
    return cachedToken;
  }

  structuredLog('ERROR', 'TOKEN_MISSING', { message: 'No se encontró token de Movidesk ni en Secrets Manager ni en env var' });
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: waitForRateLimit
//  Espera si es necesario para respetar el rate limit de
//  Movidesk (10 requests por minuto). Limpia timestamps
//  viejos y pausa si estamos en el límite.
// ═══════════════════════════════════════════════════════════════

async function waitForRateLimit() {
  const now = Date.now();
  // Limpiar timestamps fuera de la ventana
  requestTimestamps = requestTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (requestTimestamps.length >= RATE_LIMIT_MAX) {
    // Calcular cuánto esperar hasta que el timestamp más viejo salga de la ventana
    const oldestTs = requestTimestamps[0];
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - oldestTs) + 100; // +100ms de margen
    structuredLog('WARN', 'RATE_LIMIT_WAIT', { waitMs, currentRequests: requestTimestamps.length });
    await new Promise(resolve => setTimeout(resolve, waitMs));
    // Limpiar de nuevo después de esperar
    requestTimestamps = requestTimestamps.filter(ts => Date.now() - ts < RATE_LIMIT_WINDOW_MS);
  }

  requestTimestamps.push(Date.now());
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: movideskRequest
//  Hace una petición HTTP a la API de Movidesk usando el
//  módulo HTTPS nativo. Incluye reintentos (1 retry) y
//  manejo de rate limit.
// ═══════════════════════════════════════════════════════════════

async function movideskRequest(method, path, body, retryCount = 0) {
  const token = await getMovideskToken();
  if (!token) {
    return { success: false, error: 'Token de Movidesk no disponible' };
  }

  // Respetar rate limit antes de cada request
  await waitForRateLimit();

  // Construir URL completa con token como query parameter
  const separator = path.includes('?') ? '&' : '?';
  const fullUrl = `${MOVIDESK_API_URL}${path}${separator}token=${token}`;

  return new Promise((resolve, reject) => {
    const url = new URL(fullUrl);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        // Rate limit alcanzado (429) — reintentar una vez
        if (res.statusCode === 429 && retryCount < 1) {
          structuredLog('WARN', 'RATE_LIMITED', { statusCode: 429, retryCount, path });
          // Esperar 10 segundos antes de reintentar
          setTimeout(() => {
            movideskRequest(method, path, body, retryCount + 1).then(resolve).catch(reject);
          }, 10000);
          return;
        }

        // Error de servidor (5xx) — reintentar una vez
        if (res.statusCode >= 500 && retryCount < 1) {
          structuredLog('WARN', 'SERVER_ERROR_RETRY', { statusCode: res.statusCode, retryCount, path });
          setTimeout(() => {
            movideskRequest(method, path, body, retryCount + 1).then(resolve).catch(reject);
          }, 3000);
          return;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          let parsed = null;
          try {
            parsed = responseBody ? JSON.parse(responseBody) : {};
          } catch (e) {
            parsed = { raw: responseBody };
          }
          structuredLog('INFO', 'API_SUCCESS', { method, path, statusCode: res.statusCode });
          resolve({ success: true, data: parsed, statusCode: res.statusCode });
        } else {
          structuredLog('ERROR', 'API_ERROR', {
            method,
            path,
            statusCode: res.statusCode,
            response: responseBody.substring(0, 500),
          });
          resolve({ success: false, error: `HTTP ${res.statusCode}`, statusCode: res.statusCode, response: responseBody });
        }
      });
    });

    req.on('error', (err) => {
      // Error de red — reintentar una vez
      if (retryCount < 1) {
        structuredLog('WARN', 'NETWORK_ERROR_RETRY', { error: err.message, retryCount, path });
        setTimeout(() => {
          movideskRequest(method, path, body, retryCount + 1).then(resolve).catch(reject);
        }, 3000);
        return;
      }
      structuredLog('ERROR', 'NETWORK_ERROR', { error: err.message, path });
      resolve({ success: false, error: err.message });
    });

    // Timeout de 30 segundos
    req.setTimeout(30000, () => {
      req.destroy();
      structuredLog('ERROR', 'REQUEST_TIMEOUT', { path, method });
      resolve({ success: false, error: 'Request timeout (30s)' });
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: mapSeverityToUrgency
//  Mapea la severidad de Avvale SAP AlwaysOps a la urgencia de
//  Movidesk. También retorna si el ticket es urgente.
//
//  WARNING    → Baixa (baja prioridad)
//  HIGH       → Alta
//  CRITICAL   → Alta + isUrgent = true
//  PREDICTIVE → Baixa (alerta predictiva, no es urgente aún)
// ═══════════════════════════════════════════════════════════════

function mapSeverityToUrgency(severity) {
  switch (severity) {
    case 'CRITICAL':
      return { urgency: 'Alta', isUrgent: true };
    case 'HIGH':
      return { urgency: 'Alta', isUrgent: false };
    case 'WARNING':
      return { urgency: 'Baixa', isUrgent: false };
    case 'PREDICTIVE':
      return { urgency: 'Baixa', isUrgent: false };
    default:
      return { urgency: 'Baixa', isUrgent: false };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: buildTicketSubject
//  Construye el asunto del ticket incluyendo el systemId
//  y la métrica afectada para fácil identificación.
// ═══════════════════════════════════════════════════════════════

function buildTicketSubject(eventType, data) {
  const systemId = data.systemId || 'UNKNOWN';

  switch (eventType) {
    case 'BREACH_DETECTED': {
      const metrics = (data.breaches || []).map(b => b.metricName).join(', ');
      const severity = data.breaches?.some(b => b.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH';
      return `[Avvale SAP AlwaysOps] ${severity}: ${systemId} - Breach en ${metrics}`;
    }
    case 'RUNBOOK_RESULT': {
      const runbooks = (data.results || []).map(r => r.runbookId).join(', ');
      return `[Avvale SAP AlwaysOps] Runbook ejecutado: ${systemId} - ${runbooks}`;
    }
    case 'PREVENTIVE_ALERT': {
      const predMetrics = (data.predictions || []).map(p => p.metricName).join(', ');
      return `[Avvale SAP AlwaysOps] Alerta Preventiva: ${systemId} - ${predMetrics}`;
    }
    case 'APPROVAL_RESULT': {
      return `[Avvale SAP AlwaysOps] Aprobacion ${data.status}: ${systemId} - ${data.runbookId}`;
    }
    default:
      return `[Avvale SAP AlwaysOps] ${eventType}: ${systemId}`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: buildTicketDescription
//  Construye la descripción HTML del ticket con todos los
//  detalles relevantes del evento. Usa tablas HTML para
//  formato legible en Movidesk.
// ═══════════════════════════════════════════════════════════════

function buildTicketDescription(eventType, data) {
  const timestamp = new Date().toISOString();

  switch (eventType) {
    // ─── Breach detectado: detalle de cada métrica en breach ───
    case 'BREACH_DETECTED': {
      const severity = data.breaches?.some(b => b.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH';
      const severityColor = severity === 'CRITICAL' ? '#dc3545' : '#fd7e14';

      let breachRows = '';
      (data.breaches || []).forEach(b => {
        const color = b.severity === 'CRITICAL' ? '#dc3545' : '#fd7e14';
        breachRows += `<tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${b.metricName}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;color:${color};">${b.value}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${b.threshold}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;color:${color};">${b.severity}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${b.runbook || 'N/A'}</td>
        </tr>`;
      });

      return `<div style="font-family:Arial,sans-serif;">
        <h2 style="color:${severityColor};">Avvale SAP AlwaysOps - Breach Detectado (${severity})</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Sistema</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.systemId}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Tipo</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.systemType || 'N/A'} / ${data.dbType || 'N/A'}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">SID</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.sid || 'N/A'}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Ambiente</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.env || 'N/A'}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Timestamp</td><td style="padding:6px 10px;border:1px solid #ddd;">${timestamp}</td></tr>
        </table>
        <h3>Breaches Detectados (${(data.breaches || []).length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#f5f5f5;">
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">M&eacute;trica</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Valor</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Umbral</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Severidad</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Runbook</th>
          </tr>
          ${breachRows}
        </table>
        <p style="color:#666;font-size:12px;margin-top:16px;">
          Los runbooks marcados como <strong>costSafe</strong> se ejecutan autom&aacute;ticamente.
          Los dem&aacute;s requieren aprobaci&oacute;n manual via Avvale SAP AlwaysOps.
        </p>
        <hr><p style="font-size:11px;color:#999;">Generado autom&aacute;ticamente por Avvale SAP AlwaysOps v1.0</p>
      </div>`;
    }

    // ─── Resultado de runbook: detalle de la ejecución ───
    case 'RUNBOOK_RESULT': {
      let resultRows = '';
      (data.results || []).forEach(r => {
        const color = r.success ? '#28a745' : '#dc3545';
        resultRows += `<tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.runbookId}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.metricName || 'N/A'}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;color:${color};font-weight:bold;">${r.success ? 'OK' : 'FALLO'}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.autoExecuted ? 'Auto' : 'Aprobado'}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.output || 'N/A'}</td>
        </tr>`;
      });

      const allSuccess = (data.results || []).every(r => r.success);
      const statusColor = allSuccess ? '#28a745' : '#dc3545';

      return `<div style="font-family:Arial,sans-serif;">
        <h2 style="color:${statusColor};">Avvale SAP AlwaysOps - Resultado de Runbook</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Sistema</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.systemId}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Estado General</td><td style="padding:6px 10px;border:1px solid #ddd;color:${statusColor};font-weight:bold;">${allSuccess ? 'TODOS EXITOSOS' : 'CON FALLOS'}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Timestamp</td><td style="padding:6px 10px;border:1px solid #ddd;">${timestamp}</td></tr>
        </table>
        <h3>Resultados de Ejecuci&oacute;n</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#f5f5f5;">
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Runbook</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">M&eacute;trica</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Estado</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Tipo</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Output</th>
          </tr>
          ${resultRows}
        </table>
        <hr><p style="font-size:11px;color:#999;">Generado autom&aacute;ticamente por Avvale SAP AlwaysOps v1.0</p>
      </div>`;
    }

    // ─── Alerta preventiva: métricas con tendencia preocupante ───
    case 'PREVENTIVE_ALERT': {
      let predRows = '';
      (data.predictions || []).forEach(p => {
        predRows += `<tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${p.metricName}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${p.currentValue}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;color:#fd7e14;font-weight:bold;">${p.predictedValue}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${p.threshold}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${p.minutesToBreach ? p.minutesToBreach + ' min' : 'N/A'}</td>
        </tr>`;
      });

      return `<div style="font-family:Arial,sans-serif;">
        <h2 style="color:#fd7e14;">Avvale SAP AlwaysOps - Alerta Preventiva</h2>
        <p>El motor preventivo detect&oacute; m&eacute;tricas con tendencia a superar sus umbrales.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Sistema</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.systemId}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Predicciones</td><td style="padding:6px 10px;border:1px solid #ddd;">${(data.predictions || []).length}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Timestamp</td><td style="padding:6px 10px;border:1px solid #ddd;">${timestamp}</td></tr>
        </table>
        <h3>M&eacute;tricas con Tendencia Preocupante</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#f5f5f5;">
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">M&eacute;trica</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Actual</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Predicho</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Umbral</th>
            <th style="padding:8px 10px;text-align:left;border:1px solid #ddd;">Tiempo al Breach</th>
          </tr>
          ${predRows}
        </table>
        <hr><p style="font-size:11px;color:#999;">Generado autom&aacute;ticamente por Avvale SAP AlwaysOps v1.0</p>
      </div>`;
    }

    // ─── Resultado de aprobación ───
    case 'APPROVAL_RESULT': {
      const isApproved = data.status === 'APPROVED';
      const statusColor = isApproved ? '#28a745' : '#dc3545';

      return `<div style="font-family:Arial,sans-serif;">
        <h2 style="color:${statusColor};">Avvale SAP AlwaysOps - Aprobaci&oacute;n ${data.status}</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Sistema</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.systemId}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Runbook</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.runbookId || 'N/A'}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Estado</td><td style="padding:6px 10px;border:1px solid #ddd;color:${statusColor};font-weight:bold;">${data.status}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Procesado por</td><td style="padding:6px 10px;border:1px solid #ddd;">${data.processedBy || 'N/A'}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Timestamp</td><td style="padding:6px 10px;border:1px solid #ddd;">${timestamp}</td></tr>
        </table>
        <hr><p style="font-size:11px;color:#999;">Generado autom&aacute;ticamente por Avvale SAP AlwaysOps v1.0</p>
      </div>`;
    }

    default:
      return `<div style="font-family:Arial,sans-serif;">
        <h2>Avvale SAP AlwaysOps - ${eventType}</h2>
        <p>Sistema: ${data.systemId || 'N/A'}</p>
        <p>Timestamp: ${timestamp}</p>
        <pre>${JSON.stringify(data, null, 2)}</pre>
        <hr><p style="font-size:11px;color:#999;">Generado autom&aacute;ticamente por Avvale SAP AlwaysOps v1.0</p>
      </div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: createTicket
//  Crea un nuevo ticket en Movidesk via POST a /tickets.
//  El objeto ticketData debe incluir: subject, description (HTML),
//  urgency, isUrgent, y opcionalmente category y tags.
// ═══════════════════════════════════════════════════════════════

async function createTicket(ticketData) {
  // Estructura del ticket según la API de Movidesk
  const ticket = {
    subject: ticketData.subject,
    type: 2, // 2 = Ticket público
    status: 'New',
    urgency: ticketData.urgency || 'Baixa',
    category: ticketData.category || 'Avvale SAP AlwaysOps',
    isUrgent: ticketData.isUrgent || false,
    tags: ticketData.tags || ['sap-alwaysops', 'automatico'],
    actions: [
      {
        type: 2, // 2 = Acción pública
        description: ticketData.description,
        htmlDescription: ticketData.description,
      },
    ],
    // Asignar agente y cliente si están configurados
    ...(MOVIDESK_AGENT_ID ? {
      owner: {
        id: MOVIDESK_AGENT_ID,
        personType: 1, // 1 = Agente
      },
    } : {}),
    ...(MOVIDESK_CLIENT_ID ? {
      clients: [
        {
          id: MOVIDESK_CLIENT_ID,
          personType: 2, // 2 = Cliente
        },
      ],
    } : {}),
  };

  structuredLog('INFO', 'CREATE_TICKET', { subject: ticketData.subject, urgency: ticketData.urgency });

  const result = await movideskRequest('POST', '/tickets', ticket);

  if (result.success && result.data) {
    structuredLog('INFO', 'TICKET_CREATED', {
      ticketId: result.data.id,
      subject: ticketData.subject,
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: updateTicket
//  Actualiza un ticket existente en Movidesk via PATCH.
//  Permite agregar acciones (comentarios), cambiar estado,
//  o modificar otros campos del ticket.
// ═══════════════════════════════════════════════════════════════

async function updateTicket(ticketId, updateData) {
  structuredLog('INFO', 'UPDATE_TICKET', { ticketId, fields: Object.keys(updateData) });

  const result = await movideskRequest('PATCH', `/tickets?id=${ticketId}`, updateData);

  if (result.success) {
    structuredLog('INFO', 'TICKET_UPDATED', { ticketId });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: findOpenTicket
//  Busca en DynamoDB un ticket abierto para el systemId y
//  metricName dados. Se usa cuando llega un RUNBOOK_RESULT
//  para encontrar el ticket de breach correspondiente y
//  actualizarlo con la resolución.
// ═══════════════════════════════════════════════════════════════

async function findOpenTicket(systemId, metricName) {
  try {
    const pk = `MOVIDESK#${systemId}`;

    const result = await ddbDoc.send(new QueryCommand({
      TableName: INCIDENTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      FilterExpression: '#status <> :resolved AND contains(metricName, :metric)',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':pk': pk,
        ':resolved': 'RESOLVED',
        ':metric': metricName,
      },
      // Orden descendente para obtener el más reciente primero
      ScanIndexForward: false,
      Limit: 1,
    }));

    if (result.Items && result.Items.length > 0) {
      const item = result.Items[0];
      structuredLog('INFO', 'OPEN_TICKET_FOUND', {
        systemId,
        metricName,
        movideskTicketId: item.movideskTicketId,
      });
      return item;
    }

    structuredLog('INFO', 'NO_OPEN_TICKET', { systemId, metricName });
    return null;

  } catch (err) {
    structuredLog('ERROR', 'FIND_TICKET_ERROR', { systemId, metricName, error: err.message });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: saveTicketMapping
//  Guarda el mapeo entre el ticket de Movidesk y el evento
//  de Avvale SAP AlwaysOps en DynamoDB para futuras correlaciones.
// ═══════════════════════════════════════════════════════════════

async function saveTicketMapping(systemId, metricName, movideskTicketId, severity, status) {
  const now = new Date().toISOString();

  const item = {
    pk: `MOVIDESK#${systemId}`,
    sk: `${now}#${metricName}`,
    movideskTicketId: String(movideskTicketId),
    systemId,
    metricName,
    severity: severity || 'UNKNOWN',
    status: status || 'OPEN',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ddbDoc.send(new PutCommand({
      TableName: INCIDENTS_TABLE,
      Item: item,
    }));

    structuredLog('INFO', 'MAPPING_SAVED', {
      pk: item.pk,
      sk: item.sk,
      movideskTicketId: String(movideskTicketId),
    });
  } catch (err) {
    structuredLog('ERROR', 'MAPPING_SAVE_ERROR', { error: err.message, systemId, metricName });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: updateTicketMapping
//  Actualiza el estado y updatedAt del mapeo en DynamoDB.
// ═══════════════════════════════════════════════════════════════

async function updateTicketMapping(pk, sk, newStatus) {
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: INCIDENTS_TABLE,
      Key: { pk, sk },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': newStatus,
        ':now': new Date().toISOString(),
      },
    }));

    structuredLog('INFO', 'MAPPING_UPDATED', { pk, sk, newStatus });
  } catch (err) {
    structuredLog('ERROR', 'MAPPING_UPDATE_ERROR', { error: err.message, pk, sk });
  }
}

// ═══════════════════════════════════════════════════════════════
//  PROCESADORES DE EVENTOS
//  Cada tipo de evento SNS tiene su propio procesador que
//  decide si crear o actualizar un ticket en Movidesk.
// ═══════════════════════════════════════════════════════════════

const EVENT_PROCESSORS = {
  // ─── BREACH_DETECTED: Crear ticket nuevo con alta/critica prioridad ───
  BREACH_DETECTED: async (data) => {
    const severity = data.breaches?.some(b => b.severity === 'CRITICAL') ? 'CRITICAL'
      : data.breaches?.some(b => b.severity === 'HIGH') ? 'HIGH' : 'WARNING';
    const { urgency, isUrgent } = mapSeverityToUrgency(severity);
    const subject = buildTicketSubject('BREACH_DETECTED', data);
    const description = buildTicketDescription('BREACH_DETECTED', data);

    const result = await createTicket({
      subject,
      description,
      urgency,
      isUrgent,
      tags: ['sap-alwaysops', 'breach', severity.toLowerCase(), data.systemId],
      category: 'Avvale SAP AlwaysOps - Breach',
    });

    if (result.success && result.data?.id) {
      // Guardar mapeo para cada breach individual
      const metrics = (data.breaches || []).map(b => b.metricName).join(',');
      await saveTicketMapping(data.systemId, metrics, result.data.id, severity, 'OPEN');
    }

    return {
      eventType: 'BREACH_DETECTED',
      systemId: data.systemId,
      ticketCreated: result.success,
      movideskTicketId: result.data?.id || null,
      error: result.error,
    };
  },

  // ─── RUNBOOK_RESULT: Buscar ticket abierto y actualizarlo con la resolución ───
  RUNBOOK_RESULT: async (data) => {
    const results = data.results || [];
    const processedResults = [];

    for (const r of results) {
      const metricName = r.metricName || 'N/A';

      // Buscar ticket abierto para esta métrica y sistema
      const openTicket = await findOpenTicket(data.systemId, metricName);

      if (openTicket && openTicket.movideskTicketId) {
        // Construir descripción de resolución
        const resolutionHtml = buildTicketDescription('RUNBOOK_RESULT', data);
        const allSuccess = results.every(res => res.success);

        // Actualizar el ticket en Movidesk
        const updateResult = await updateTicket(openTicket.movideskTicketId, {
          status: allSuccess ? 'Resolved' : 'In Progress',
          justification: allSuccess ? 'Runbook ejecutado exitosamente' : 'Runbook ejecutado con fallos',
          actions: [
            {
              type: 2,
              description: resolutionHtml,
              htmlDescription: resolutionHtml,
            },
          ],
        });

        // Actualizar el mapeo en DynamoDB
        if (updateResult.success) {
          const newStatus = allSuccess ? 'RESOLVED' : 'IN_PROGRESS';
          await updateTicketMapping(openTicket.pk, openTicket.sk, newStatus);
        }

        processedResults.push({
          runbookId: r.runbookId,
          metricName,
          ticketUpdated: updateResult.success,
          movideskTicketId: openTicket.movideskTicketId,
          error: updateResult.error,
        });
      } else {
        // No se encontró ticket abierto — crear uno nuevo con el resultado
        structuredLog('WARN', 'NO_MATCHING_TICKET', { systemId: data.systemId, metricName });

        const subject = buildTicketSubject('RUNBOOK_RESULT', data);
        const description = buildTicketDescription('RUNBOOK_RESULT', data);
        const allSuccess = results.every(res => res.success);

        const createResult = await createTicket({
          subject,
          description,
          urgency: 'Baixa',
          isUrgent: false,
          tags: ['sap-alwaysops', 'runbook-result', data.systemId],
          category: 'Avvale SAP AlwaysOps - Runbook',
        });

        if (createResult.success && createResult.data?.id) {
          await saveTicketMapping(data.systemId, metricName, createResult.data.id, 'INFO', allSuccess ? 'RESOLVED' : 'IN_PROGRESS');
        }

        processedResults.push({
          runbookId: r.runbookId,
          metricName,
          ticketCreated: createResult.success,
          movideskTicketId: createResult.data?.id || null,
          error: createResult.error,
        });
      }
    }

    return {
      eventType: 'RUNBOOK_RESULT',
      systemId: data.systemId,
      results: processedResults,
    };
  },

  // ─── PREVENTIVE_ALERT: Crear ticket de baja prioridad ───
  PREVENTIVE_ALERT: async (data) => {
    const { urgency, isUrgent } = mapSeverityToUrgency('PREDICTIVE');
    const subject = buildTicketSubject('PREVENTIVE_ALERT', data);
    const description = buildTicketDescription('PREVENTIVE_ALERT', data);

    const result = await createTicket({
      subject,
      description,
      urgency,
      isUrgent,
      tags: ['sap-alwaysops', 'preventive', 'predictivo', data.systemId],
      category: 'Avvale SAP AlwaysOps - Preventivo',
    });

    if (result.success && result.data?.id) {
      const metrics = (data.predictions || []).map(p => p.metricName).join(',');
      await saveTicketMapping(data.systemId, metrics, result.data.id, 'PREDICTIVE', 'OPEN');
    }

    return {
      eventType: 'PREVENTIVE_ALERT',
      systemId: data.systemId,
      ticketCreated: result.success,
      movideskTicketId: result.data?.id || null,
      error: result.error,
    };
  },

  // ─── APPROVAL_RESULT: Actualizar ticket cuando la aprobación se resuelve ───
  APPROVAL_RESULT: async (data) => {
    const systemId = data.systemId;
    const metricName = data.metricName || data.runbookId || 'N/A';

    // Buscar ticket abierto asociado
    const openTicket = await findOpenTicket(systemId, metricName);

    if (openTicket && openTicket.movideskTicketId) {
      const description = buildTicketDescription('APPROVAL_RESULT', data);
      const isApproved = data.status === 'APPROVED';

      const updateResult = await updateTicket(openTicket.movideskTicketId, {
        actions: [
          {
            type: 2,
            description: description,
            htmlDescription: description,
          },
        ],
      });

      if (updateResult.success && !isApproved) {
        // Si fue rechazado, marcar el ticket como cerrado sin resolución
        await updateTicketMapping(openTicket.pk, openTicket.sk, 'REJECTED');
      }

      return {
        eventType: 'APPROVAL_RESULT',
        systemId,
        ticketUpdated: updateResult.success,
        movideskTicketId: openTicket.movideskTicketId,
        approvalStatus: data.status,
        error: updateResult.error,
      };
    }

    // Si no hay ticket abierto, crear uno nuevo informativo
    structuredLog('WARN', 'NO_MATCHING_TICKET_APPROVAL', { systemId, metricName });

    const subject = buildTicketSubject('APPROVAL_RESULT', data);
    const description = buildTicketDescription('APPROVAL_RESULT', data);

    const createResult = await createTicket({
      subject,
      description,
      urgency: 'Baixa',
      isUrgent: false,
      tags: ['sap-alwaysops', 'approval', data.status?.toLowerCase(), data.systemId],
      category: 'Avvale SAP AlwaysOps - Aprobacion',
    });

    if (createResult.success && createResult.data?.id) {
      await saveTicketMapping(systemId, metricName, createResult.data.id, 'INFO', data.status === 'APPROVED' ? 'APPROVED' : 'REJECTED');
    }

    return {
      eventType: 'APPROVAL_RESULT',
      systemId,
      ticketCreated: createResult.success,
      movideskTicketId: createResult.data?.id || null,
      approvalStatus: data.status,
      error: createResult.error,
    };
  },
};

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Recibe eventos de SNS (sap-alwaysops-alerts) y crea/actualiza
//  tickets en Movidesk según el tipo de evento.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event) => {
  structuredLog('INFO', 'INVOKED', { message: 'Avvale SAP AlwaysOps Movidesk Agent v1.0 invocado' });
  const startTime = Date.now();

  try {
    const records = event.Records || [];

    if (records.length === 0) {
      structuredLog('INFO', 'NO_RECORDS', { message: 'No hay registros SNS para procesar' });
      return { statusCode: 200, body: { message: 'Sin eventos' } };
    }

    const results = [];

    for (const record of records) {
      const snsMessage = record.Sns?.Message;
      if (!snsMessage) continue;

      let data;
      try {
        data = JSON.parse(snsMessage);
      } catch (parseErr) {
        structuredLog('ERROR', 'PARSE_ERROR', { error: parseErr.message, raw: snsMessage.substring(0, 200) });
        continue;
      }

      const eventType = data.type;

      structuredLog('INFO', 'PROCESSING_EVENT', {
        eventType,
        systemId: data.systemId || 'N/A',
      });

      // Buscar el procesador correspondiente
      const processor = EVENT_PROCESSORS[eventType];
      if (!processor) {
        structuredLog('WARN', 'UNKNOWN_EVENT_TYPE', { eventType });
        continue;
      }

      // Procesar el evento
      try {
        const result = await processor(data);
        results.push(result);
      } catch (processorErr) {
        structuredLog('ERROR', 'PROCESSOR_ERROR', {
          eventType,
          systemId: data.systemId || 'N/A',
          error: processorErr.message,
        });
        results.push({
          eventType,
          systemId: data.systemId || 'N/A',
          error: processorErr.message,
        });
      }
    }

    const duration = Date.now() - startTime;
    structuredLog('INFO', 'COMPLETED', {
      message: 'Avvale SAP AlwaysOps Movidesk Agent v1.0 completado',
      duration: `${duration}ms`,
      eventsProcessed: results.length,
    });

    return {
      statusCode: 200,
      body: {
        message: 'Avvale SAP AlwaysOps Movidesk Agent v1.0 completado',
        duration: `${duration}ms`,
        eventsProcessed: results.length,
        results,
      },
    };

  } catch (err) {
    structuredLog('ERROR', 'FATAL_ERROR', { error: err.message, stack: err.stack });
    return { statusCode: 500, body: { error: err.message } };
  }
};
