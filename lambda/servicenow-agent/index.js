'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — ServiceNow Agent
//  Agente de integración con ServiceNow ITSM para gestión de
//  incidentes.
//
//  ¿Qué hace este Lambda?
//  Está suscrito al SNS topic sap-alwaysops-alerts (AlertsTopic).
//  Cuando recibe un evento (breach, resultado de runbook,
//  resultado de aprobación), crea o actualiza incidentes en
//  ServiceNow via su API REST (Table API).
//  Almacena el mapeo de incidentes en DynamoDB para
//  deduplicación y correlación de eventos posteriores.
//  Usa el módulo HTTPS nativo de Node.js (no necesita axios).
//
//  Endpoints de ServiceNow utilizados:
//    POST  /api/now/table/incident          → Crear incidente
//    PATCH /api/now/table/incident/{sys_id}  → Actualizar incidente
//    GET   /api/now/table/incident           → Consultar incidentes
// ═══════════════════════════════════════════════════════════════

const https = require('https');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

// ─── Structured JSON logging para CloudWatch Logs Insights ───
// Permite hacer queries como: fields @timestamp, systemId, sysId
// filter action = "CREATE_INCIDENT" | stats count(*) by eventType
function structuredLog(level, action, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'servicenow-agent',
    action,
    ...data,
  };
  console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](`[SERVICENOW] ${JSON.stringify(entry)}`);
}

// ─── Clientes de AWS (se crean una sola vez, se reutilizan entre invocaciones) ───
const secretsMgr = new SecretsManagerClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ─── Configuración desde variables de entorno ───
const SERVICENOW_SECRET_ARN = process.env.SERVICENOW_SECRET_ARN || '';
const SERVICENOW_TICKETS_TABLE = process.env.SERVICENOW_TICKETS_TABLE || 'sap-alwaysops-servicenow-tickets';
const ASSIGNMENT_GROUP = process.env.ASSIGNMENT_GROUP || 'SAP Basis';

// ─── Caché de credenciales para no leer Secrets Manager en cada invocación ───
// Se almacena en memoria del contenedor Lambda y persiste entre invocaciones tibias
let cachedCredentials = null;

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getServiceNowCredentials
//  Obtiene las credenciales de ServiceNow desde AWS Secrets
//  Manager. El secreto debe contener:
//    - instanceUrl: URL de la instancia (ej: https://company.service-now.com)
//    - username: usuario de integración
//    - password: contraseña del usuario
//  Cachea el resultado en memoria para evitar llamadas repetidas.
// ═══════════════════════════════════════════════════════════════

async function getServiceNowCredentials() {
  // Si ya están en caché, usarlas directamente
  if (cachedCredentials) return cachedCredentials;

  if (!SERVICENOW_SECRET_ARN) {
    structuredLog('ERROR', 'CREDENTIALS_MISSING', {
      message: 'No se configuró SERVICENOW_SECRET_ARN. No se puede conectar a ServiceNow.',
    });
    return null;
  }

  try {
    const res = await secretsMgr.send(new GetSecretValueCommand({
      SecretId: SERVICENOW_SECRET_ARN,
    }));

    const secret = JSON.parse(res.SecretString);

    // Validar que todos los campos requeridos estén presentes
    if (!secret.instanceUrl || !secret.username || !secret.password) {
      structuredLog('ERROR', 'CREDENTIALS_INCOMPLETE', {
        message: 'El secreto debe contener instanceUrl, username y password.',
        hasInstanceUrl: !!secret.instanceUrl,
        hasUsername: !!secret.username,
        hasPassword: !!secret.password,
      });
      return null;
    }

    // Normalizar instanceUrl: quitar trailing slash si existe
    const instanceUrl = secret.instanceUrl.replace(/\/+$/, '');

    cachedCredentials = {
      instanceUrl,
      username: secret.username,
      password: secret.password,
    };

    structuredLog('INFO', 'CREDENTIALS_LOADED', {
      source: 'SecretsManager',
      instanceUrl: instanceUrl.replace(/https?:\/\//, '').split('.')[0] + '.service-now.com',
    });

    return cachedCredentials;

  } catch (err) {
    structuredLog('ERROR', 'CREDENTIALS_ERROR', {
      error: err.message,
      secretArn: SERVICENOW_SECRET_ARN.substring(0, 40) + '...',
    });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: serviceNowRequest
//  Hace una petición HTTP a la API REST de ServiceNow usando
//  el módulo HTTPS nativo de Node.js. Incluye autenticación
//  Basic, reintentos (hasta 2) y manejo de errores.
//
//  Parámetros:
//    method  → GET, POST, PATCH
//    path    → Ruta relativa (ej: /api/now/table/incident)
//    body    → Objeto a enviar como JSON (null para GET)
//    retryCount → Contador interno de reintentos
// ═══════════════════════════════════════════════════════════════

async function serviceNowRequest(method, path, body, retryCount = 0) {
  const credentials = await getServiceNowCredentials();
  if (!credentials) {
    return { success: false, error: 'Credenciales de ServiceNow no disponibles' };
  }

  const { instanceUrl, username, password } = credentials;

  return new Promise((resolve) => {
    const url = new URL(`${instanceUrl}${path}`);
    const payload = body ? JSON.stringify(body) : null;

    // Autenticación Basic: base64(username:password)
    const authString = Buffer.from(`${username}:${password}`).toString('base64');

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${authString}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    structuredLog('INFO', 'API_REQUEST', {
      method,
      path,
      hostname: url.hostname,
      hasBody: !!payload,
    });

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        // ── Rate limit (429) — reintentar con backoff exponencial ──
        if (res.statusCode === 429 && retryCount < 2) {
          const retryAfter = parseInt(res.headers['retry-after'], 10) || (5 * (retryCount + 1));
          const waitMs = retryAfter * 1000;
          structuredLog('WARN', 'RATE_LIMITED', {
            statusCode: 429,
            retryCount,
            retryAfterSeconds: retryAfter,
            path,
          });
          setTimeout(() => {
            serviceNowRequest(method, path, body, retryCount + 1).then(resolve);
          }, waitMs);
          return;
        }

        // ── Error de servidor (5xx) — reintentar una vez ──
        if (res.statusCode >= 500 && retryCount < 2) {
          const waitMs = 3000 * (retryCount + 1);
          structuredLog('WARN', 'SERVER_ERROR_RETRY', {
            statusCode: res.statusCode,
            retryCount,
            waitMs,
            path,
          });
          setTimeout(() => {
            serviceNowRequest(method, path, body, retryCount + 1).then(resolve);
          }, waitMs);
          return;
        }

        // ── Autenticación fallida (401) — invalidar caché ──
        if (res.statusCode === 401) {
          structuredLog('ERROR', 'AUTH_FAILED', {
            statusCode: 401,
            path,
            message: 'Credenciales inválidas o expiradas. Invalidando caché.',
          });
          cachedCredentials = null;
          resolve({
            success: false,
            error: 'Autenticación fallida (401). Verifique credenciales en Secrets Manager.',
            statusCode: 401,
          });
          return;
        }

        // ── Respuesta exitosa (2xx) ──
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let parsed = null;
          try {
            parsed = responseBody ? JSON.parse(responseBody) : {};
          } catch (e) {
            parsed = { raw: responseBody };
          }
          structuredLog('INFO', 'API_SUCCESS', {
            method,
            path,
            statusCode: res.statusCode,
          });
          resolve({ success: true, data: parsed, statusCode: res.statusCode });
        } else {
          // ── Cualquier otro error (4xx, etc.) ──
          let errorDetail = responseBody;
          try {
            const errorParsed = JSON.parse(responseBody);
            errorDetail = errorParsed.error?.message || errorParsed.error?.detail || responseBody;
          } catch (e) {
            // Mantener responseBody tal cual
          }
          structuredLog('ERROR', 'API_ERROR', {
            method,
            path,
            statusCode: res.statusCode,
            error: typeof errorDetail === 'string' ? errorDetail.substring(0, 500) : JSON.stringify(errorDetail).substring(0, 500),
          });
          resolve({
            success: false,
            error: `HTTP ${res.statusCode}: ${typeof errorDetail === 'string' ? errorDetail.substring(0, 200) : 'Error desconocido'}`,
            statusCode: res.statusCode,
            response: responseBody,
          });
        }
      });
    });

    req.on('error', (err) => {
      // ── Error de red — reintentar una vez ──
      if (retryCount < 2) {
        const waitMs = 3000 * (retryCount + 1);
        structuredLog('WARN', 'NETWORK_ERROR_RETRY', {
          error: err.message,
          retryCount,
          waitMs,
          path,
        });
        setTimeout(() => {
          serviceNowRequest(method, path, body, retryCount + 1).then(resolve);
        }, waitMs);
        return;
      }
      structuredLog('ERROR', 'NETWORK_ERROR', { error: err.message, path });
      resolve({ success: false, error: err.message });
    });

    // Timeout de 30 segundos para la conexión
    req.setTimeout(30000, () => {
      req.destroy();
      structuredLog('ERROR', 'REQUEST_TIMEOUT', { path, method, timeoutMs: 30000 });
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
//  ServiceNow. Los valores numéricos de ServiceNow son:
//    1 = High (Crítico)
//    2 = Medium (Alto)
//    3 = Low (Advertencia)
// ═══════════════════════════════════════════════════════════════

function mapSeverityToUrgency(severity) {
  switch (severity) {
    case 'CRITICAL':
      return '1'; // High
    case 'HIGH':
      return '2'; // Medium
    case 'WARNING':
      return '3'; // Low
    default:
      return '3'; // Low por defecto
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: mapEnvironmentToImpact
//  Mapea el ambiente del sistema SAP al impacto del incidente
//  en ServiceNow. Producción tiene el mayor impacto.
//    PRD = 1 (High)
//    QAS = 2 (Medium)
//    DEV = 3 (Low)
// ═══════════════════════════════════════════════════════════════

function mapEnvironmentToImpact(env) {
  switch ((env || '').toUpperCase()) {
    case 'PRD':
    case 'PROD':
    case 'PRODUCTION':
      return '1'; // High
    case 'QAS':
    case 'QA':
    case 'STAGING':
      return '2'; // Medium
    case 'DEV':
    case 'DEVELOPMENT':
    case 'SANDBOX':
      return '3'; // Low
    default:
      return '2'; // Medium por defecto — ser conservador con ambientes desconocidos
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: buildShortDescription
//  Construye el short_description del incidente en ServiceNow.
//  Formato: [Avvale SAP AlwaysOps] SEVERITY: SystemId - Metric(s)
//  ServiceNow tiene un límite de 160 caracteres para este campo.
// ═══════════════════════════════════════════════════════════════

function buildShortDescription(eventType, data) {
  const systemId = data.systemId || 'UNKNOWN';

  switch (eventType) {
    case 'BREACH_DETECTED': {
      const metrics = (data.breaches || []).map(b => b.metricName).join(', ');
      const severity = data.breaches?.some(b => b.severity === 'CRITICAL') ? 'CRITICAL'
        : data.breaches?.some(b => b.severity === 'HIGH') ? 'HIGH' : 'WARNING';
      const desc = `[Avvale SAP AlwaysOps] ${severity}: ${systemId} - Breach en ${metrics}`;
      // Truncar a 160 caracteres si es necesario
      return desc.length > 160 ? desc.substring(0, 157) + '...' : desc;
    }
    case 'RUNBOOK_EXECUTED': {
      const runbooks = (data.results || []).map(r => r.runbookId).join(', ');
      const allSuccess = (data.results || []).every(r => r.success);
      const status = allSuccess ? 'OK' : 'FALLO';
      const desc = `[Avvale SAP AlwaysOps] Runbook ${status}: ${systemId} - ${runbooks}`;
      return desc.length > 160 ? desc.substring(0, 157) + '...' : desc;
    }
    case 'APPROVAL_RESULT': {
      const desc = `[Avvale SAP AlwaysOps] Aprobacion ${data.status}: ${systemId} - ${data.runbookId || 'N/A'}`;
      return desc.length > 160 ? desc.substring(0, 157) + '...' : desc;
    }
    default:
      return `[Avvale SAP AlwaysOps] ${eventType}: ${systemId}`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: buildDescription
//  Construye la descripción completa del incidente con todos
//  los detalles del breach. ServiceNow soporta texto plano
//  en el campo description.
// ═══════════════════════════════════════════════════════════════

function buildDescription(eventType, data) {
  const timestamp = new Date().toISOString();
  const separator = '─'.repeat(50);

  switch (eventType) {
    case 'BREACH_DETECTED': {
      const lines = [
        'SAP ALWAYSOPS - BREACH DETECTADO',
        separator,
        `Sistema:     ${data.systemId || 'N/A'}`,
        `Tipo:        ${data.systemType || 'N/A'} / ${data.dbType || 'N/A'}`,
        `SID:         ${data.sid || 'N/A'}`,
        `Ambiente:    ${data.env || 'N/A'}`,
        `Timestamp:   ${timestamp}`,
        `Breach ID:   ${data.breachId || 'N/A'}`,
        '',
        `BREACHES DETECTADOS (${(data.breaches || []).length})`,
        separator,
      ];

      (data.breaches || []).forEach((b, idx) => {
        lines.push(`  [${idx + 1}] Metrica:   ${b.metricName}`);
        lines.push(`      Valor:     ${b.value}`);
        lines.push(`      Umbral:    ${b.threshold}`);
        lines.push(`      Severidad: ${b.severity}`);
        lines.push(`      Runbook:   ${b.runbook || 'N/A'}`);
        lines.push('');
      });

      lines.push(separator);
      lines.push('Los runbooks marcados como costSafe se ejecutan automaticamente.');
      lines.push('Los demas requieren aprobacion manual via Avvale SAP AlwaysOps.');
      lines.push('');
      lines.push(`Generado automaticamente por Avvale SAP AlwaysOps v1.0`);

      return lines.join('\n');
    }

    case 'RUNBOOK_EXECUTED': {
      const allSuccess = (data.results || []).every(r => r.success);
      const lines = [
        'SAP ALWAYSOPS - RESULTADO DE RUNBOOK',
        separator,
        `Sistema:        ${data.systemId || 'N/A'}`,
        `Estado General: ${allSuccess ? 'TODOS EXITOSOS' : 'CON FALLOS'}`,
        `Breach ID:      ${data.breachId || 'N/A'}`,
        `Timestamp:      ${timestamp}`,
        '',
        'RESULTADOS DE EJECUCION',
        separator,
      ];

      (data.results || []).forEach((r, idx) => {
        const status = r.success ? 'OK' : 'FALLO';
        lines.push(`  [${idx + 1}] Runbook:  ${r.runbookId}`);
        lines.push(`      Metrica:  ${r.metricName || 'N/A'}`);
        lines.push(`      Estado:   ${status}`);
        lines.push(`      Tipo:     ${r.autoExecuted ? 'Auto' : 'Aprobado'}`);
        lines.push(`      Output:   ${r.output || 'N/A'}`);
        lines.push('');
      });

      lines.push(separator);
      lines.push(`Generado automaticamente por Avvale SAP AlwaysOps v1.0`);

      return lines.join('\n');
    }

    case 'APPROVAL_RESULT': {
      const lines = [
        `SAP ALWAYSOPS - APROBACION ${data.status}`,
        separator,
        `Sistema:       ${data.systemId || 'N/A'}`,
        `Runbook:       ${data.runbookId || 'N/A'}`,
        `Estado:        ${data.status}`,
        `Procesado por: ${data.processedBy || 'N/A'}`,
        `Breach ID:     ${data.breachId || 'N/A'}`,
        `Timestamp:     ${timestamp}`,
        '',
      ];

      if (data.executionResult) {
        lines.push('RESULTADO DE EJECUCION POST-APROBACION');
        lines.push(separator);
        lines.push(`  Exito:  ${data.executionResult.success ? 'SI' : 'NO'}`);
        lines.push(`  Output: ${data.executionResult.output || 'N/A'}`);
        lines.push('');
      }

      lines.push(separator);
      lines.push(`Generado automaticamente por Avvale SAP AlwaysOps v1.0`);

      return lines.join('\n');
    }

    default:
      return [
        `SAP ALWAYSOPS - ${eventType}`,
        separator,
        `Sistema:   ${data.systemId || 'N/A'}`,
        `Timestamp: ${timestamp}`,
        '',
        JSON.stringify(data, null, 2),
        '',
        separator,
        `Generado automaticamente por Avvale SAP AlwaysOps v1.0`,
      ].join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: buildWorkNote
//  Construye una nota de trabajo (work_notes) para agregar
//  a un incidente existente. Las work_notes son internas y
//  solo visibles para el equipo de soporte.
// ═══════════════════════════════════════════════════════════════

function buildWorkNote(eventType, data) {
  const timestamp = new Date().toISOString();

  switch (eventType) {
    case 'RUNBOOK_EXECUTED': {
      const allSuccess = (data.results || []).every(r => r.success);
      const lines = [
        `[Avvale SAP AlwaysOps] Runbook ejecutado - ${allSuccess ? 'EXITOSO' : 'CON FALLOS'}`,
        `Timestamp: ${timestamp}`,
        '',
      ];

      (data.results || []).forEach(r => {
        const status = r.success ? 'OK' : 'FALLO';
        lines.push(`- ${r.runbookId}: ${status} (${r.autoExecuted ? 'Auto' : 'Aprobado'}) ${r.output || ''}`);
      });

      if (allSuccess) {
        lines.push('');
        lines.push('Todos los runbooks se ejecutaron exitosamente. Resolviendo incidente automaticamente.');
      }

      return lines.join('\n');
    }

    case 'APPROVAL_RESULT': {
      const lines = [
        `[Avvale SAP AlwaysOps] Aprobacion: ${data.status}`,
        `Runbook: ${data.runbookId || 'N/A'}`,
        `Procesado por: ${data.processedBy || 'N/A'}`,
        `Timestamp: ${timestamp}`,
      ];

      if (data.status === 'APPROVED' && data.executionResult) {
        lines.push('');
        lines.push(`Resultado de ejecucion: ${data.executionResult.success ? 'EXITOSO' : 'FALLIDO'}`);
        if (data.executionResult.output) {
          lines.push(`Output: ${data.executionResult.output}`);
        }
        if (data.executionResult.success) {
          lines.push('');
          lines.push('Ejecucion post-aprobacion exitosa. Resolviendo incidente automaticamente.');
        }
      } else if (data.status === 'REJECTED') {
        lines.push('');
        lines.push('Aprobacion rechazada. El runbook no sera ejecutado.');
      }

      return lines.join('\n');
    }

    default:
      return `[Avvale SAP AlwaysOps] ${eventType} - ${data.systemId || 'N/A'} - ${timestamp}`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: createIncident
//  Crea un nuevo incidente en ServiceNow via POST a la Table
//  API (/api/now/table/incident). Retorna el sys_id y number
//  del incidente creado.
// ═══════════════════════════════════════════════════════════════

async function createIncident(incidentData) {
  const payload = {
    short_description: incidentData.shortDescription,
    description: incidentData.description,
    urgency: incidentData.urgency || '3',
    impact: incidentData.impact || '2',
    category: 'SAP',
    subcategory: incidentData.subcategory || 'Performance',
    assignment_group: incidentData.assignmentGroup || ASSIGNMENT_GROUP,
    caller_id: 'sap-alwaysops',
    correlation_id: incidentData.correlationId || '',
    correlation_display: 'Avvale SAP AlwaysOps Breach',
    // Campos personalizados de ServiceNow se pueden agregar aqui
    // u_sap_system_id: incidentData.systemId,
    // u_sap_sid: incidentData.sid,
  };

  structuredLog('INFO', 'CREATE_INCIDENT', {
    shortDescription: incidentData.shortDescription,
    urgency: incidentData.urgency,
    impact: incidentData.impact,
    correlationId: incidentData.correlationId,
  });

  const result = await serviceNowRequest('POST', '/api/now/table/incident', payload);

  if (result.success && result.data?.result) {
    const incident = result.data.result;
    structuredLog('INFO', 'INCIDENT_CREATED', {
      sysId: incident.sys_id,
      number: incident.number,
      shortDescription: incidentData.shortDescription,
    });
    return {
      success: true,
      sysId: incident.sys_id,
      number: incident.number,
      data: incident,
    };
  }

  structuredLog('ERROR', 'INCIDENT_CREATE_FAILED', {
    error: result.error,
    statusCode: result.statusCode,
  });
  return { success: false, error: result.error };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: updateIncident
//  Actualiza un incidente existente en ServiceNow via PATCH
//  a /api/now/table/incident/{sys_id}. Se usa para agregar
//  work_notes, cambiar estado, o resolver el incidente.
// ═══════════════════════════════════════════════════════════════

async function updateIncident(sysId, updateData) {
  if (!sysId) {
    structuredLog('ERROR', 'UPDATE_INCIDENT_NO_SYSID', {
      message: 'No se proporcionó sys_id para actualizar.',
    });
    return { success: false, error: 'sys_id no proporcionado' };
  }

  structuredLog('INFO', 'UPDATE_INCIDENT', {
    sysId,
    fields: Object.keys(updateData),
  });

  const result = await serviceNowRequest('PATCH', `/api/now/table/incident/${sysId}`, updateData);

  if (result.success && result.data?.result) {
    const incident = result.data.result;
    structuredLog('INFO', 'INCIDENT_UPDATED', {
      sysId,
      number: incident.number,
      state: incident.state,
    });
    return {
      success: true,
      sysId: incident.sys_id,
      number: incident.number,
      data: incident,
    };
  }

  structuredLog('ERROR', 'INCIDENT_UPDATE_FAILED', {
    sysId,
    error: result.error,
    statusCode: result.statusCode,
  });
  return { success: false, error: result.error };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: resolveIncident
//  Resuelve un incidente en ServiceNow estableciendo:
//    state = 6 (Resolved)
//    close_code = 'Solved (Permanently)'
//    close_notes = Notas de resolución
//  Opcionalmente agrega work_notes con el detalle.
// ═══════════════════════════════════════════════════════════════

async function resolveIncident(sysId, closeNotes, workNote) {
  if (!sysId) {
    structuredLog('ERROR', 'RESOLVE_INCIDENT_NO_SYSID', {
      message: 'No se proporcionó sys_id para resolver.',
    });
    return { success: false, error: 'sys_id no proporcionado' };
  }

  const updatePayload = {
    state: '6',  // 6 = Resolved en ServiceNow
    close_code: 'Solved (Permanently)',
    close_notes: closeNotes || 'Resuelto automaticamente por Avvale SAP AlwaysOps via runbook.',
  };

  // Agregar work_notes si se proporcionaron
  if (workNote) {
    updatePayload.work_notes = workNote;
  }

  structuredLog('INFO', 'RESOLVE_INCIDENT', { sysId, closeCode: updatePayload.close_code });

  return updateIncident(sysId, updatePayload);
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: findIncidentByCorrelation
//  Busca un incidente en ServiceNow por correlation_id.
//  Esto permite deduplicación: si ya existe un incidente para
//  el mismo breachId, se actualiza en lugar de crear uno nuevo.
// ═══════════════════════════════════════════════════════════════

async function findIncidentByCorrelation(correlationId) {
  if (!correlationId) return null;

  const query = `correlation_id=${encodeURIComponent(correlationId)}^stateNOT IN6,7,8`;
  const path = `/api/now/table/incident?sysparm_query=${query}&sysparm_limit=1&sysparm_fields=sys_id,number,state,correlation_id`;

  structuredLog('INFO', 'QUERY_INCIDENT', { correlationId, query });

  const result = await serviceNowRequest('GET', path, null);

  if (result.success && result.data?.result && result.data.result.length > 0) {
    const incident = result.data.result[0];
    structuredLog('INFO', 'INCIDENT_FOUND_BY_CORRELATION', {
      correlationId,
      sysId: incident.sys_id,
      number: incident.number,
    });
    return incident;
  }

  structuredLog('INFO', 'NO_INCIDENT_FOR_CORRELATION', { correlationId });
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: saveTicketMapping
//  Guarda el mapeo entre el incidente de ServiceNow y el
//  evento de Avvale SAP AlwaysOps en DynamoDB. Esto permite:
//    - Encontrar el sys_id de ServiceNow dado un breachId
//    - Rastrear el historial de incidentes por sistema
//    - Deduplicar creación de incidentes
//
//  Esquema DynamoDB:
//    PK: ticketId (string) — identificador único del ticket
//    SK: systemId (string) — ID del sistema SAP
//    Atributos: sysId, number, state, createdAt, updatedAt, breachId
// ═══════════════════════════════════════════════════════════════

async function saveTicketMapping(ticketId, systemId, mappingData) {
  const now = new Date().toISOString();

  const item = {
    ticketId,
    systemId,
    sysId: mappingData.sysId,
    number: mappingData.number || 'N/A',
    state: mappingData.state || 'NEW',
    breachId: mappingData.breachId || 'N/A',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ddbDoc.send(new PutCommand({
      TableName: SERVICENOW_TICKETS_TABLE,
      Item: item,
    }));

    structuredLog('INFO', 'MAPPING_SAVED', {
      ticketId,
      systemId,
      sysId: mappingData.sysId,
      number: mappingData.number,
    });
  } catch (err) {
    structuredLog('ERROR', 'MAPPING_SAVE_ERROR', {
      error: err.message,
      ticketId,
      systemId,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getTicketMapping
//  Busca un mapeo existente en DynamoDB por ticketId y systemId.
//  Se usa para encontrar el sys_id de ServiceNow cuando llega
//  un evento de actualización (runbook result, approval).
// ═══════════════════════════════════════════════════════════════

async function getTicketMapping(ticketId, systemId) {
  try {
    const result = await ddbDoc.send(new GetCommand({
      TableName: SERVICENOW_TICKETS_TABLE,
      Key: {
        ticketId,
        systemId,
      },
    }));

    if (result.Item) {
      structuredLog('INFO', 'MAPPING_FOUND', {
        ticketId,
        systemId,
        sysId: result.Item.sysId,
        number: result.Item.number,
      });
      return result.Item;
    }

    structuredLog('INFO', 'MAPPING_NOT_FOUND', { ticketId, systemId });
    return null;

  } catch (err) {
    structuredLog('ERROR', 'MAPPING_GET_ERROR', {
      error: err.message,
      ticketId,
      systemId,
    });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: findMappingByBreach
//  Busca un mapeo en DynamoDB usando el breachId como ticketId.
//  Se usa cuando un RUNBOOK_EXECUTED o APPROVAL_RESULT llega
//  con un breachId para encontrar el incidente asociado.
// ═══════════════════════════════════════════════════════════════

async function findMappingByBreach(breachId, systemId) {
  // Intentar primero la búsqueda directa con breachId como ticketId
  const directResult = await getTicketMapping(breachId, systemId);
  if (directResult) return directResult;

  // Si no se encuentra, hacer query secundario buscando por breachId en atributos
  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: SERVICENOW_TICKETS_TABLE,
      IndexName: 'breachId-index',
      KeyConditionExpression: 'breachId = :breachId',
      FilterExpression: 'systemId = :systemId',
      ExpressionAttributeValues: {
        ':breachId': breachId,
        ':systemId': systemId,
      },
      Limit: 1,
    }));

    if (result.Items && result.Items.length > 0) {
      structuredLog('INFO', 'MAPPING_FOUND_BY_BREACH', {
        breachId,
        systemId,
        sysId: result.Items[0].sysId,
      });
      return result.Items[0];
    }
  } catch (err) {
    // Si el GSI no existe, loguear warning y continuar
    structuredLog('WARN', 'BREACH_INDEX_QUERY_ERROR', {
      error: err.message,
      breachId,
      systemId,
      hint: 'Verifique que el GSI breachId-index exista en la tabla DynamoDB.',
    });
  }

  structuredLog('INFO', 'NO_MAPPING_FOR_BREACH', { breachId, systemId });
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: updateTicketMapping
//  Actualiza el estado y updatedAt del mapeo en DynamoDB.
//  Se usa cuando el incidente cambia de estado (resuelto, etc).
// ═══════════════════════════════════════════════════════════════

async function updateTicketMapping(ticketId, systemId, newState) {
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: SERVICENOW_TICKETS_TABLE,
      Key: {
        ticketId,
        systemId,
      },
      UpdateExpression: 'SET #state = :state, updatedAt = :now',
      ExpressionAttributeNames: {
        '#state': 'state',
      },
      ExpressionAttributeValues: {
        ':state': newState,
        ':now': new Date().toISOString(),
      },
    }));

    structuredLog('INFO', 'MAPPING_UPDATED', { ticketId, systemId, newState });
  } catch (err) {
    structuredLog('ERROR', 'MAPPING_UPDATE_ERROR', {
      error: err.message,
      ticketId,
      systemId,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  PROCESADORES DE EVENTOS
//  Cada tipo de evento SNS tiene su propio procesador que
//  decide si crear o actualizar un incidente en ServiceNow.
// ═══════════════════════════════════════════════════════════════

const EVENT_PROCESSORS = {

  // ─── BREACH_DETECTED ───────────────────────────────────────
  // Cuando se detecta un breach, creamos un nuevo incidente en
  // ServiceNow. Si ya existe uno abierto para el mismo breachId
  // (deduplicación), lo actualizamos con los nuevos datos.
  // ────────────────────────────────────────────────────────────
  BREACH_DETECTED: async (data) => {
    const systemId = data.systemId || 'UNKNOWN';
    const breachId = data.breachId || `breach-${systemId}-${Date.now()}`;

    // Determinar severidad máxima entre todos los breaches
    const severity = data.breaches?.some(b => b.severity === 'CRITICAL') ? 'CRITICAL'
      : data.breaches?.some(b => b.severity === 'HIGH') ? 'HIGH' : 'WARNING';

    const urgency = mapSeverityToUrgency(severity);
    const impact = mapEnvironmentToImpact(data.env);
    const shortDescription = buildShortDescription('BREACH_DETECTED', data);
    const description = buildDescription('BREACH_DETECTED', data);

    // ── Deduplicación: verificar si ya existe un incidente abierto ──
    const existingIncident = await findIncidentByCorrelation(breachId);

    if (existingIncident) {
      // Ya existe — actualizar con work_notes
      structuredLog('INFO', 'DUPLICATE_BREACH', {
        breachId,
        existingSysId: existingIncident.sys_id,
        existingNumber: existingIncident.number,
      });

      const workNote = `[Avvale SAP AlwaysOps] Breach recurrente detectado.\n${description}`;
      const updateResult = await updateIncident(existingIncident.sys_id, {
        work_notes: workNote,
        urgency,
        impact,
      });

      return {
        eventType: 'BREACH_DETECTED',
        systemId,
        breachId,
        action: 'UPDATED_EXISTING',
        sysId: existingIncident.sys_id,
        number: existingIncident.number,
        success: updateResult.success,
        error: updateResult.error,
      };
    }

    // ── No existe — crear nuevo incidente ──
    const createResult = await createIncident({
      shortDescription,
      description,
      urgency,
      impact,
      correlationId: breachId,
      subcategory: 'Performance',
      assignmentGroup: ASSIGNMENT_GROUP,
      systemId,
      sid: data.sid,
    });

    if (createResult.success) {
      // Guardar mapeo en DynamoDB para futuras correlaciones
      await saveTicketMapping(breachId, systemId, {
        sysId: createResult.sysId,
        number: createResult.number,
        state: 'NEW',
        breachId,
      });
    }

    return {
      eventType: 'BREACH_DETECTED',
      systemId,
      breachId,
      action: 'CREATED_NEW',
      sysId: createResult.sysId || null,
      number: createResult.number || null,
      success: createResult.success,
      error: createResult.error,
    };
  },

  // ─── RUNBOOK_EXECUTED ──────────────────────────────────────
  // Cuando un runbook se ejecuta (automática o manualmente),
  // buscamos el incidente asociado al breach y lo actualizamos
  // con las work_notes del resultado. Si todos los runbooks
  // fueron exitosos, resolvemos el incidente automáticamente.
  // ────────────────────────────────────────────────────────────
  RUNBOOK_EXECUTED: async (data) => {
    const systemId = data.systemId || 'UNKNOWN';
    const breachId = data.breachId || null;
    const results = data.results || [];
    const allSuccess = results.every(r => r.success);

    // Buscar incidente asociado al breach
    let mapping = null;
    if (breachId) {
      mapping = await findMappingByBreach(breachId, systemId);
    }

    // Si no se encuentra por breachId, intentar por correlation_id en ServiceNow
    if (!mapping && breachId) {
      const snIncident = await findIncidentByCorrelation(breachId);
      if (snIncident) {
        mapping = {
          sysId: snIncident.sys_id,
          number: snIncident.number,
          ticketId: breachId,
          systemId,
        };
      }
    }

    if (mapping && mapping.sysId) {
      // ── Incidente encontrado: actualizar con work_notes ──
      const workNote = buildWorkNote('RUNBOOK_EXECUTED', data);

      if (allSuccess) {
        // Todos exitosos → resolver el incidente automáticamente
        const closeNotes = `Resuelto automaticamente por Avvale SAP AlwaysOps. Runbooks ejecutados: ${results.map(r => r.runbookId).join(', ')}`;
        const resolveResult = await resolveIncident(mapping.sysId, closeNotes, workNote);

        // Actualizar el estado en DynamoDB
        if (resolveResult.success) {
          await updateTicketMapping(mapping.ticketId || breachId, systemId, 'RESOLVED');
        }

        return {
          eventType: 'RUNBOOK_EXECUTED',
          systemId,
          breachId,
          action: 'RESOLVED',
          sysId: mapping.sysId,
          number: mapping.number,
          allSuccess: true,
          success: resolveResult.success,
          error: resolveResult.error,
        };
      } else {
        // Algunos fallaron → agregar work_notes pero no resolver
        const updateResult = await updateIncident(mapping.sysId, {
          work_notes: workNote,
        });

        // Actualizar estado en DynamoDB
        if (updateResult.success) {
          await updateTicketMapping(mapping.ticketId || breachId, systemId, 'IN_PROGRESS');
        }

        return {
          eventType: 'RUNBOOK_EXECUTED',
          systemId,
          breachId,
          action: 'UPDATED',
          sysId: mapping.sysId,
          number: mapping.number,
          allSuccess: false,
          failedRunbooks: results.filter(r => !r.success).map(r => r.runbookId),
          success: updateResult.success,
          error: updateResult.error,
        };
      }
    }

    // ── No se encontró incidente asociado: crear uno nuevo informativo ──
    structuredLog('WARN', 'NO_MATCHING_INCIDENT_RUNBOOK', { systemId, breachId });

    const shortDescription = buildShortDescription('RUNBOOK_EXECUTED', data);
    const description = buildDescription('RUNBOOK_EXECUTED', data);

    const createResult = await createIncident({
      shortDescription,
      description,
      urgency: '3',   // Low — es un resultado, no un breach nuevo
      impact: mapEnvironmentToImpact(data.env),
      correlationId: breachId || `runbook-${systemId}-${Date.now()}`,
      subcategory: 'Automation',
      assignmentGroup: ASSIGNMENT_GROUP,
      systemId,
    });

    if (createResult.success) {
      const ticketId = breachId || `runbook-${systemId}-${Date.now()}`;
      await saveTicketMapping(ticketId, systemId, {
        sysId: createResult.sysId,
        number: createResult.number,
        state: allSuccess ? 'RESOLVED' : 'IN_PROGRESS',
        breachId: breachId || 'N/A',
      });

      // Si todos fueron exitosos, resolver inmediatamente
      if (allSuccess) {
        const closeNotes = `Resuelto automaticamente. Runbooks: ${results.map(r => r.runbookId).join(', ')}`;
        await resolveIncident(createResult.sysId, closeNotes, null);
        await updateTicketMapping(ticketId, systemId, 'RESOLVED');
      }
    }

    return {
      eventType: 'RUNBOOK_EXECUTED',
      systemId,
      breachId,
      action: 'CREATED_NEW',
      sysId: createResult.sysId || null,
      number: createResult.number || null,
      allSuccess,
      success: createResult.success,
      error: createResult.error,
    };
  },

  // ─── APPROVAL_RESULT ───────────────────────────────────────
  // Cuando se resuelve una solicitud de aprobación, buscamos
  // el incidente asociado y lo actualizamos:
  //   - APPROVED + ejecución exitosa → resolver incidente
  //   - APPROVED + ejecución fallida → agregar work_notes
  //   - REJECTED → agregar work_notes informativas
  // ────────────────────────────────────────────────────────────
  APPROVAL_RESULT: async (data) => {
    const systemId = data.systemId || 'UNKNOWN';
    const breachId = data.breachId || null;
    const approvalStatus = data.status || 'UNKNOWN';

    // Buscar incidente asociado al breach
    let mapping = null;
    if (breachId) {
      mapping = await findMappingByBreach(breachId, systemId);
    }

    if (!mapping && breachId) {
      const snIncident = await findIncidentByCorrelation(breachId);
      if (snIncident) {
        mapping = {
          sysId: snIncident.sys_id,
          number: snIncident.number,
          ticketId: breachId,
          systemId,
        };
      }
    }

    if (mapping && mapping.sysId) {
      const workNote = buildWorkNote('APPROVAL_RESULT', data);

      // ── Aprobado + ejecución exitosa → resolver ──
      if (approvalStatus === 'APPROVED' && data.executionResult?.success) {
        const closeNotes = `Aprobacion concedida por ${data.processedBy || 'N/A'}. Runbook ${data.runbookId || 'N/A'} ejecutado exitosamente.`;
        const resolveResult = await resolveIncident(mapping.sysId, closeNotes, workNote);

        if (resolveResult.success) {
          await updateTicketMapping(mapping.ticketId || breachId, systemId, 'RESOLVED');
        }

        return {
          eventType: 'APPROVAL_RESULT',
          systemId,
          breachId,
          approvalStatus,
          action: 'RESOLVED',
          sysId: mapping.sysId,
          number: mapping.number,
          success: resolveResult.success,
          error: resolveResult.error,
        };
      }

      // ── Aprobado pero ejecución fallida, o rechazado → actualizar con work_notes ──
      const updateResult = await updateIncident(mapping.sysId, {
        work_notes: workNote,
      });

      if (updateResult.success) {
        const newState = approvalStatus === 'REJECTED' ? 'REJECTED' : 'IN_PROGRESS';
        await updateTicketMapping(mapping.ticketId || breachId, systemId, newState);
      }

      return {
        eventType: 'APPROVAL_RESULT',
        systemId,
        breachId,
        approvalStatus,
        action: 'UPDATED',
        sysId: mapping.sysId,
        number: mapping.number,
        success: updateResult.success,
        error: updateResult.error,
      };
    }

    // ── No se encontró incidente asociado: crear uno informativo ──
    structuredLog('WARN', 'NO_MATCHING_INCIDENT_APPROVAL', { systemId, breachId, approvalStatus });

    const shortDescription = buildShortDescription('APPROVAL_RESULT', data);
    const description = buildDescription('APPROVAL_RESULT', data);

    const createResult = await createIncident({
      shortDescription,
      description,
      urgency: '3',
      impact: mapEnvironmentToImpact(data.env),
      correlationId: breachId || `approval-${systemId}-${Date.now()}`,
      subcategory: 'Automation',
      assignmentGroup: ASSIGNMENT_GROUP,
      systemId,
    });

    if (createResult.success) {
      const ticketId = breachId || `approval-${systemId}-${Date.now()}`;
      await saveTicketMapping(ticketId, systemId, {
        sysId: createResult.sysId,
        number: createResult.number,
        state: approvalStatus === 'APPROVED' && data.executionResult?.success ? 'RESOLVED' : 'OPEN',
        breachId: breachId || 'N/A',
      });

      // Si fue aprobado y ejecutado con éxito, resolver inmediatamente
      if (approvalStatus === 'APPROVED' && data.executionResult?.success) {
        const closeNotes = `Aprobacion por ${data.processedBy || 'N/A'}. Ejecucion exitosa.`;
        await resolveIncident(createResult.sysId, closeNotes, null);
        await updateTicketMapping(ticketId, systemId, 'RESOLVED');
      }
    }

    return {
      eventType: 'APPROVAL_RESULT',
      systemId,
      breachId,
      approvalStatus,
      action: 'CREATED_NEW',
      sysId: createResult.sysId || null,
      number: createResult.number || null,
      success: createResult.success,
      error: createResult.error,
    };
  },
};

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Recibe eventos de SNS (AlertsTopic sap-alwaysops-alerts)
//  y crea/actualiza incidentes en ServiceNow según el tipo
//  de evento. Procesa cada registro SNS de forma secuencial
//  para respetar el orden de eventos y evitar condiciones de
//  carrera al actualizar el mismo incidente.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event) => {
  structuredLog('INFO', 'INVOKED', {
    message: 'Avvale SAP AlwaysOps ServiceNow Agent v1.0 invocado',
    memoryLimitMB: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 'N/A',
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'N/A',
  });

  const startTime = Date.now();

  try {
    const records = event.Records || [];

    if (records.length === 0) {
      structuredLog('INFO', 'NO_RECORDS', { message: 'No hay registros SNS para procesar' });
      return {
        statusCode: 200,
        body: { message: 'Sin eventos para procesar', eventsProcessed: 0 },
      };
    }

    structuredLog('INFO', 'PROCESSING_BATCH', { recordCount: records.length });

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Procesar cada registro SNS de forma secuencial
    for (const record of records) {
      const snsMessage = record.Sns?.Message;
      if (!snsMessage) {
        structuredLog('WARN', 'EMPTY_SNS_MESSAGE', { messageId: record.Sns?.MessageId });
        continue;
      }

      // Parsear el mensaje JSON del SNS
      let data;
      try {
        data = JSON.parse(snsMessage);
      } catch (parseErr) {
        structuredLog('ERROR', 'PARSE_ERROR', {
          error: parseErr.message,
          messageId: record.Sns?.MessageId,
          raw: snsMessage.substring(0, 200),
        });
        errorCount++;
        results.push({
          messageId: record.Sns?.MessageId,
          error: `Error parseando mensaje: ${parseErr.message}`,
        });
        continue;
      }

      const eventType = data.type;
      const systemId = data.systemId || 'N/A';

      structuredLog('INFO', 'PROCESSING_EVENT', {
        eventType,
        systemId,
        breachId: data.breachId || 'N/A',
        messageId: record.Sns?.MessageId,
      });

      // Buscar el procesador correspondiente al tipo de evento
      const processor = EVENT_PROCESSORS[eventType];
      if (!processor) {
        structuredLog('WARN', 'UNKNOWN_EVENT_TYPE', {
          eventType,
          systemId,
          supportedTypes: Object.keys(EVENT_PROCESSORS),
        });
        results.push({
          eventType,
          systemId,
          error: `Tipo de evento no soportado: ${eventType}`,
        });
        continue;
      }

      // Ejecutar el procesador con manejo de errores
      try {
        const result = await processor(data);
        results.push(result);

        if (result.success !== false) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (processorErr) {
        structuredLog('ERROR', 'PROCESSOR_ERROR', {
          eventType,
          systemId,
          error: processorErr.message,
          stack: processorErr.stack,
        });
        errorCount++;
        results.push({
          eventType,
          systemId,
          error: processorErr.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    structuredLog('INFO', 'COMPLETED', {
      message: 'Avvale SAP AlwaysOps ServiceNow Agent v1.0 completado',
      duration: `${duration}ms`,
      eventsProcessed: results.length,
      successCount,
      errorCount,
    });

    return {
      statusCode: 200,
      body: {
        message: 'Avvale SAP AlwaysOps ServiceNow Agent v1.0 completado',
        duration: `${duration}ms`,
        eventsProcessed: results.length,
        successCount,
        errorCount,
        results,
      },
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    structuredLog('ERROR', 'FATAL_ERROR', {
      error: err.message,
      stack: err.stack,
      duration: `${duration}ms`,
    });
    return {
      statusCode: 500,
      body: { error: err.message, duration: `${duration}ms` },
    };
  }
};
