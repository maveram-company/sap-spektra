'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Chatbot Agent (Interaccion con Cliente)
//  Chatbot inteligente con IA para autoservicio del cliente.
//
//  Capacidades:
//  - Consultar estado de sistemas SAP
//  - Programar backups bajo demanda
//  - Solicitar reinicios de sistema
//  - Consultar metricas e incidentes
//  - Recomendaciones IA personalizadas
//  - Consultar/cancelar operaciones programadas
//
//  Trigger: Lambda Function URL (POST /chat)
// ═══════════════════════════════════════════════════════════════

const log = require('../utilidades/logger')('chatbot-agent');
const { trackTokens, checkDailyLimit } = require('../utilidades/token-tracker');
const { createCircuitBreaker } = require('../utilidades/circuit-breaker');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchClient, GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Clientes de AWS
const bedrock = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || 'us-east-1' });
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cw = new CloudWatchClient({});
const ssm = new SSMClient({});
const lambda = new LambdaClient({});

// Circuit breaker para llamadas a Bedrock
const chatbotCircuitBreaker = createCircuitBreaker('chatbot-bedrock', {
  failureThreshold: 5,
  resetTimeoutMs: 10 * 60 * 1000,
});

// Configuracion
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-4-5-20251001';
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'sap-alwaysops-conversations';
const SCHEDULED_OPS_TABLE = process.env.SCHEDULED_OPS_TABLE || 'sap-alwaysops-scheduled-operations';
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'sap-alwaysops-incidents';
const ADVISOR_RESULTS_TABLE = process.env.ADVISOR_RESULTS_TABLE || 'sap-alwaysops-advisor-results';
const CW_NAMESPACE = process.env.CW_NAMESPACE || 'SAPAlwaysOps';
const MAX_HISTORY = 10;

// ═══════════════════════════════════════════════════════════════
//  Respuesta HTTP con CORS
// ═══════════════════════════════════════════════════════════════

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

// ═══════════════════════════════════════════════════════════════
//  SISTEMA DE PROMPTS — Contexto IA para el chatbot
// ═══════════════════════════════════════════════════════════════

const CHATBOT_SYSTEM_PROMPT = `Eres el asistente virtual de Avvale SAP AlwaysOps, un sistema de monitoreo inteligente para SAP.
Tu nombre es "AlwaysOps AI" y ayudas a los clientes a gestionar sus sistemas SAP.

CAPACIDADES que puedes ofrecer:
1. ESTADO: Consultar el estado actual de un sistema SAP
2. BACKUP: Programar backups de base de datos (ASE, HANA, Oracle, MSSQL, DB2, MaxDB)
3. REINICIO: Solicitar reinicio de servicios SAP (requiere evaluacion de riesgo)
4. METRICAS: Mostrar metricas actuales de un sistema
5. INCIDENTES: Consultar incidentes recientes
6. RECOMENDACION: Dar recomendaciones personalizadas basadas en IA
7. OPERACIONES: Ver operaciones programadas pendientes
8. CANCELAR: Cancelar una operacion programada
9. AYUDA: Mostrar que puedes hacer

REGLAS:
1. Responde SIEMPRE en espanol
2. Se amigable pero profesional
3. Cuando el usuario pida una accion (backup, reinicio), SIEMPRE confirma los detalles antes
4. Para reinicios, advierte sobre el impacto potencial
5. Incluye IDs de sistema cuando sea relevante
6. Si no entiendes algo, pide aclaracion
7. Nunca inventes datos — si no tienes informacion, dilo claramente

FORMATO DE RESPUESTA:
Responde SIEMPRE con un JSON valido con esta estructura:
{
  "intent": "STATUS|BACKUP|RESTART|METRICS|INCIDENTS|RECOMMENDATION|OPERATIONS|CANCEL|HELP|CONVERSATION",
  "systemId": "ID del sistema si se menciona o null",
  "parameters": {},
  "response": "tu respuesta conversacional al usuario",
  "requiresConfirmation": true/false,
  "actionSummary": "resumen de la accion a ejecutar si aplica o null"
}`;

// ═══════════════════════════════════════════════════════════════
//  FUNCION: callBedrock
//  Llama a Amazon Bedrock con mensajes de conversacion
// ═══════════════════════════════════════════════════════════════

async function callBedrock(messages, systemPrompt, maxTokens) {
  // Circuit breaker check
  if (!chatbotCircuitBreaker.canExecute()) {
    log.warn('Circuit breaker OPEN — saltando llamada a Bedrock');
    return { success: false, error: 'Chatbot temporalmente no disponible (circuit breaker)', circuitOpen: true };
  }

  // Daily token limit check
  try {
    const limitCheck = await checkDailyLimit(100000);
    if (!limitCheck.allowed) {
      log.warn('Limite diario de tokens alcanzado', { usage: limitCheck.usage, limit: limitCheck.limit });
      return { success: false, error: 'Limite diario de tokens alcanzado', dailyLimitReached: true };
    }
  } catch (err) {
    // No bloquear por error en limit check
  }

  try {
    log.info(`Invocando Bedrock ${MODEL_ID} con ${messages.length} mensajes`);

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens || 1024,
      system: systemPrompt || CHATBOT_SYSTEM_PROMPT,
      messages: messages,
    });

    const response = await bedrock.send(new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: body,
    }));

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const text = responseBody.content[0].text;

    // Registrar tokens consumidos
    const inputTokens = responseBody.usage?.input_tokens || 0;
    const outputTokens = responseBody.usage?.output_tokens || 0;
    trackTokens('chatbot', inputTokens, outputTokens, MODEL_ID).catch(() => {});

    log.info(`Respuesta Bedrock recibida (${text.length} chars, ${inputTokens}+${outputTokens} tokens)`);
    chatbotCircuitBreaker.recordSuccess();
    return { success: true, text, inputTokens, outputTokens };
  } catch (err) {
    log.error('Error Bedrock', { error: err.message });
    chatbotCircuitBreaker.recordFailure();
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: loadConversationHistory
//  Carga los ultimos N mensajes de la conversacion desde DynamoDB
// ═══════════════════════════════════════════════════════════════

async function loadConversationHistory(sessionId) {
  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: CONVERSATIONS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
      ScanIndexForward: false,
      Limit: MAX_HISTORY * 2,
    }));

    const items = (result.Items || []).reverse();
    return items.map(item => ({
      role: item.role,
      content: item.content,
    }));
  } catch (err) {
    log.warn('Error cargando historial', { error: err.message });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: saveConversationTurn
//  Guarda un turno de conversacion en DynamoDB
// ═══════════════════════════════════════════════════════════════

async function saveConversationTurn(sessionId, role, content, metadata) {
  try {
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    await ddbDoc.send(new PutCommand({
      TableName: CONVERSATIONS_TABLE,
      Item: {
        pk: `SESSION#${sessionId}`,
        sk: `${new Date().toISOString()}#${role}`,
        role,
        content,
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
        ttl,
      },
    }));
  } catch (err) {
    log.warn('Error guardando turno', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: loadSystemsConfig
//  Lee la lista de sistemas SAP desde SSM Parameter Store
// ═══════════════════════════════════════════════════════════════

let systemsConfigCache = null;
let configCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function loadSystemsConfig() {
  if (systemsConfigCache && (Date.now() - configCacheTime) < CACHE_TTL) {
    return systemsConfigCache;
  }
  try {
    const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
    const param = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
    systemsConfigCache = JSON.parse(param.Parameter.Value);
    configCacheTime = Date.now();
    return systemsConfigCache;
  } catch (err) {
    log.warn('Error cargando config', { error: err.message });
    return [{
      systemId: process.env.SYSTEM_ID || 'SAP-DEFAULT',
      systemType: 'SAP_PO', sid: 'PRD', environment: 'Production',
      enabled: true, database: { type: 'SAP_ASE' },
    }];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: getSystemStatus
//  Obtiene estado actual del sistema desde CloudWatch
// ═══════════════════════════════════════════════════════════════

async function getSystemStatus(systemId) {
  log.info('Consultando estado de sistema', { systemId });
  const config = await loadSystemsConfig();
  const sys = config.find(s => s.systemId === systemId || s.sid === systemId);

  if (!sys) {
    return { found: false, message: `Sistema '${systemId}' no encontrado. Sistemas disponibles: ${config.map(s => s.systemId).join(', ')}` };
  }

  const metricsToCheck = getKeyMetrics(sys.database?.type, sys.systemType);
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 30 * 60 * 1000);
  const currentMetrics = {};

  for (const metricName of metricsToCheck) {
    try {
      const result = await cw.send(new GetMetricStatisticsCommand({
        Namespace: CW_NAMESPACE,
        MetricName: metricName,
        Dimensions: [{ Name: 'SAPSystemId', Value: sys.systemId }],
        StartTime: startTime, EndTime: endTime,
        Period: 300, Statistics: ['Average', 'Maximum'],
      }));
      const dp = result.Datapoints?.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))[0];
      if (dp) {
        currentMetrics[metricName] = { average: dp.Average?.toFixed(2), maximum: dp.Maximum?.toFixed(2) };
      }
    } catch (err) { /* metrica no disponible */ }
  }

  let recentIncidents = 0;
  try {
    const incResult = await ddbDoc.send(new QueryCommand({
      TableName: INCIDENTS_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk > :since',
      ExpressionAttributeValues: {
        ':pk': `INCIDENT#${sys.systemId}`,
        ':since': new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      Select: 'COUNT',
    }));
    recentIncidents = incResult.Count || 0;
  } catch (err) { /* sin datos */ }

  return {
    found: true, systemId: sys.systemId, systemType: sys.systemType,
    sid: sys.sid, environment: sys.environment, databaseType: sys.database?.type,
    metrics: currentMetrics, recentIncidents, metricsCount: Object.keys(currentMetrics).length,
  };
}

function getKeyMetrics(dbType, systemType) {
  const metrics = [];
  switch (dbType) {
    case 'SAP_ASE': metrics.push('DB_ASE_LogFullPct', 'DB_ASE_PhysLogPct', 'DB_ASE_PhysDataPct', 'DB_ASE_BlockingChains'); break;
    case 'SAP_HANA': metrics.push('DB_HANA_MemPct', 'DB_HANA_DiskPct', 'DB_HANA_ReplicationLag'); break;
    case 'ORACLE': metrics.push('DB_ORA_TablespacePct', 'DB_ORA_ActiveSessions'); break;
    case 'MSSQL': metrics.push('DB_MSSQL_LogPct', 'DB_MSSQL_DataPct'); break;
    case 'IBM_DB2': metrics.push('DB_DB2_TablespacePct', 'DB_DB2_LogPct'); break;
  }
  switch (systemType) {
    case 'SAP_PO': case 'SAP_PI': metrics.push('APP_JVM_HeapPct', 'APP_PO_FailedMessages'); break;
    case 'SAP_ECC': case 'SAP_S4HANA': metrics.push('APP_ABAP_FreeDiaWP', 'APP_ABAP_ShortDumps24h'); break;
  }
  return metrics;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: getRecentIncidents
//  Consulta incidentes recientes de DynamoDB
// ═══════════════════════════════════════════════════════════════

async function getRecentIncidents(systemId, hours) {
  log.info('Consultando incidentes recientes', { systemId: systemId || 'todos', hours });
  const config = await loadSystemsConfig();
  const systems = systemId
    ? config.filter(s => s.systemId === systemId || s.sid === systemId)
    : config.filter(s => s.enabled);

  const allIncidents = [];
  const since = new Date(Date.now() - (hours || 24) * 60 * 60 * 1000).toISOString();

  for (const sys of systems) {
    try {
      const result = await ddbDoc.send(new QueryCommand({
        TableName: INCIDENTS_TABLE,
        KeyConditionExpression: 'pk = :pk AND sk > :since',
        ExpressionAttributeValues: { ':pk': `INCIDENT#${sys.systemId}`, ':since': since },
        ScanIndexForward: false, Limit: 20,
      }));
      (result.Items || []).forEach(item => {
        allIncidents.push({
          systemId: sys.systemId, severity: item.severity,
          metricName: item.metricName, value: item.metricValue,
          timestamp: item.sk?.split('#')[0] || item.timestamp, runbook: item.runbookId,
        });
      });
    } catch (err) { /* sin datos */ }
  }

  return allIncidents.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).slice(0, 30);
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: scheduleOperation
//  Programa una operacion (backup, reinicio) en DynamoDB
// ═══════════════════════════════════════════════════════════════

async function scheduleOperation(operationType, systemId, scheduledTime, requestedBy, parameters) {
  log.info('Programando operacion', { operationType, systemId, scheduledTime });

  const config = await loadSystemsConfig();
  const sys = config.find(s => s.systemId === systemId || s.sid === systemId);
  if (!sys) {
    return { success: false, message: `Sistema '${systemId}' no encontrado` };
  }

  const operationId = `OP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const commands = generateOperationCommands(operationType, sys, parameters);
  const needsRiskAssessment = operationType === 'RESTART' || operationType === 'MAINTENANCE';

  let parsedTime;
  if (scheduledTime === 'now' || scheduledTime === 'ahora') {
    parsedTime = new Date(Date.now() + 2 * 60 * 1000);
  } else {
    parsedTime = parseScheduledTime(scheduledTime);
  }

  if (!parsedTime || isNaN(parsedTime.getTime())) {
    return { success: false, message: `No pude interpretar la hora '${scheduledTime}'. Usa formato como '3:00 AM', '15:00', 'manana a las 2am', o 'ahora'.` };
  }

  const ttl = Math.floor(parsedTime.getTime() / 1000) + 7 * 24 * 60 * 60;
  const item = {
    pk: `OPERATION#${sys.systemId}`,
    sk: `${parsedTime.toISOString()}#${operationId}`,
    operationId, operationType, systemId: sys.systemId, sid: sys.sid,
    systemType: sys.systemType, databaseType: sys.database?.type,
    scheduledTime: parsedTime.toISOString(), status: 'SCHEDULED',
    requestedBy: requestedBy || 'chatbot-user',
    requestedAt: new Date().toISOString(),
    commands, needsRiskAssessment, parameters: parameters || {},
    riskAssessment: null, executionResult: null, ttl,
  };

  try {
    await ddbDoc.send(new PutCommand({ TableName: SCHEDULED_OPS_TABLE, Item: item }));
    return {
      success: true, operationId, systemId: sys.systemId, operationType,
      scheduledTime: parsedTime.toISOString(),
      scheduledTimeLocal: parsedTime.toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      needsRiskAssessment, commands: commands.length,
    };
  } catch (err) {
    log.error('Error programando operacion', { error: err.message, stack: err.stack });
    return { success: false, message: `Error guardando operacion: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: parseScheduledTime
//  Interpreta expresiones de tiempo en lenguaje natural
// ═══════════════════════════════════════════════════════════════

function parseScheduledTime(input) {
  if (!input) return null;
  const str = input.toLowerCase().trim();
  const now = new Date();

  // ISO directo
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);

  // "ahora"
  if (/^(ahora|ya|now|inmediatamente)$/.test(str)) {
    return new Date(now.getTime() + 2 * 60 * 1000);
  }

  // "en X minutos/horas"
  const inMatch = str.match(/^en\s+(\d+)\s+(minutos?|mins?|horas?|hrs?)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].startsWith('h') ? 60 : 1;
    return new Date(now.getTime() + amount * unit * 60 * 1000);
  }

  // "a las HH:MM" o "HH:MM" o "H AM/PM"
  const timeMatch = str.match(/(?:a\s+las?\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2] || '0');
    const ampm = (timeMatch[3] || '').replace(/\./g, '').toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const scheduled = new Date(now);
    scheduled.setHours(hours, minutes, 0, 0);
    if (scheduled.getTime() <= now.getTime()) scheduled.setDate(scheduled.getDate() + 1);
    if (str.includes('manana') || str.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      scheduled.setFullYear(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    }
    return scheduled;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: generateOperationCommands
//  Genera los comandos SSM segun tipo de operacion y sistema
// ═══════════════════════════════════════════════════════════════

function generateOperationCommands(operationType, sys, parameters) {
  const sid = sys.sid;
  const sidLower = sid.toLowerCase();
  const dbType = sys.database?.type;
  const osType = sys.osType || 'LINUX';

  if (operationType === 'BACKUP') return generateBackupCommands(dbType, sid, sidLower, parameters, osType);
  if (operationType === 'RESTART') return generateRestartCommands(sys.systemType, sid, sidLower, parameters);
  return [`echo "Operacion ${operationType} no soportada"`];
}

function generateBackupCommands(dbType, sid, sidLower, params, osType) {
  const backupType = params?.backupType || 'full';
  switch (dbType) {
    case 'SAP_ASE':
      if (backupType === 'log') {
        return [
          `echo "=== Backup de LOG de transacciones ASE para SID=${sid} ==="`,
          `su - syb${sidLower} -c "isql -Usa -P$(cat /sybase/.sapwd) -S${sid} -w999 <<EOSQL\ndump transaction ${sid} to '/sybase/${sid}/backup/${sid}_log_$(date +%Y%m%d_%H%M%S).dmp'\ngo\nEOSQL"`,
          `echo "Backup de log completado para ${sid}"`,
        ];
      }
      return [
        `echo "=== Backup FULL de ASE para SID=${sid} ==="`,
        `su - syb${sidLower} -c "isql -Usa -P$(cat /sybase/.sapwd) -S${sid} -w999 <<EOSQL\ndump database ${sid} to '/sybase/${sid}/backup/${sid}_full_$(date +%Y%m%d_%H%M%S).dmp'\ngo\nEOSQL"`,
        `echo "Backup full completado para ${sid}"`,
        `ls -lh /sybase/${sid}/backup/*$(date +%Y%m%d)* 2>/dev/null || echo "Verificar archivos de backup"`,
      ];
    case 'SAP_HANA':
      return [
        `echo "=== Backup HANA para SID=${sid} ==="`,
        `su - ${sidLower}adm -c "hdbsql -U SYSTEM -d SYSTEMDB \\"BACKUP DATA USING FILE ('${sid}_backup_$(date +%Y%m%d_%H%M%S)')\\""`,
        `echo "Backup HANA completado para ${sid}"`,
      ];
    case 'ORACLE':
      return [
        `echo "=== Backup RMAN Oracle para SID=${sid} ==="`,
        `su - ora${sidLower} -c "rman target / <<EOF\nBACKUP DATABASE PLUS ARCHIVELOG;\nEOF"`,
        `echo "Backup Oracle completado para ${sid}"`,
      ];
    case 'MSSQL':
      return [
        `echo "=== Backup MSSQL para SID=${sid} ==="`,
        `sqlcmd -S localhost -Q "BACKUP DATABASE [${sid}] TO DISK='/var/opt/mssql/backup/${sid}_$(date +%Y%m%d_%H%M%S).bak' WITH COMPRESSION"`,
      ];
    case 'IBM_DB2':
      return [
        `echo "=== Backup DB2 para SID=${sid} ==="`,
        `su - db2${sidLower} -c "db2 backup database ${sid} to /db2/${sid}/backup/ compress"`,
      ];
    case 'MAXDB':
      return [
        `echo "=== Backup MaxDB para SID=${sid} ==="`,
        osType === 'WINDOWS'
          ? `& "C:\\sapdb\\programs\\bin\\dbmcli.exe" -d ${sid} -u CONTROL,managed backup_start DATA EXTERNAL`
          : `su - sdb${sidLower} -c "dbmcli -d ${sid} -u CONTROL,managed backup_start DATA EXTERNAL"`,
      ];
    default:
      return [`echo "Tipo de DB '${dbType}' no soportado para backup automatico"`];
  }
}

function generateRestartCommands(systemType, sid, sidLower, params) {
  const restartType = params?.restartType || 'graceful';
  switch (systemType) {
    case 'SAP_PO': case 'SAP_PI':
      if (restartType === 'force') {
        return [
          `echo "=== Reinicio FORZADO de SAP PO/PI SID=${sid} ==="`,
          `su - ${sidLower}adm -c "stopsap ${sid}"`, `sleep 30`,
          `su - ${sidLower}adm -c "cleanipc ${sid} remove"`,
          `su - ${sidLower}adm -c "startsap ${sid}"`, `sleep 60`,
          `su - ${sidLower}adm -c "sapcontrol -nr 00 -function GetProcessList"`,
        ];
      }
      return [
        `echo "=== Reinicio GRACEFUL de SAP PO/PI SID=${sid} ==="`,
        `su - ${sidLower}adm -c "sapcontrol -nr 00 -function RestartSystem"`,
        `sleep 120`,
        `su - ${sidLower}adm -c "sapcontrol -nr 00 -function GetProcessList"`,
      ];
    case 'SAP_ECC': case 'SAP_S4HANA': case 'SAP_BW':
      return [
        `echo "=== Reinicio ABAP System SID=${sid} ==="`,
        `su - ${sidLower}adm -c "sapcontrol -nr 00 -function Stop"`, `sleep 60`,
        `su - ${sidLower}adm -c "sapcontrol -nr 00 -function Start"`, `sleep 120`,
        `su - ${sidLower}adm -c "sapcontrol -nr 00 -function GetProcessList"`,
      ];
    case 'SAP_FIORI': case 'SAP_GATEWAY':
      return [
        `echo "=== Reinicio ICM/Gateway SID=${sid} ==="`,
        `su - ${sidLower}adm -c "sapcontrol -nr 00 -function RestartService"`,
        `sleep 60`,
        `su - ${sidLower}adm -c "sapcontrol -nr 00 -function GetProcessList"`,
      ];
    default:
      return [`echo "Tipo de sistema '${systemType}' no soportado para reinicio"`];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: listScheduledOperations
//  Lista operaciones programadas
// ═══════════════════════════════════════════════════════════════

async function listScheduledOperations(systemId) {
  const config = await loadSystemsConfig();
  const systems = systemId
    ? config.filter(s => s.systemId === systemId || s.sid === systemId)
    : config.filter(s => s.enabled);

  const operations = [];
  for (const sys of systems) {
    try {
      const result = await ddbDoc.send(new QueryCommand({
        TableName: SCHEDULED_OPS_TABLE,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `OPERATION#${sys.systemId}` },
        ScanIndexForward: false, Limit: 20,
      }));
      (result.Items || []).forEach(item => {
        if (['SCHEDULED', 'EXECUTING', 'PENDING_APPROVAL'].includes(item.status)) {
          operations.push({
            operationId: item.operationId, type: item.operationType,
            systemId: item.systemId, scheduledTime: item.scheduledTime,
            status: item.status, requestedBy: item.requestedBy,
          });
        }
      });
    } catch (err) { /* sin datos */ }
  }
  return operations;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: cancelOperation
//  Cancela una operacion programada
// ═══════════════════════════════════════════════════════════════

async function cancelOperation(operationId) {
  log.info('Cancelando operacion', { operationId });
  const config = await loadSystemsConfig();

  for (const sys of config) {
    try {
      const result = await ddbDoc.send(new QueryCommand({
        TableName: SCHEDULED_OPS_TABLE,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `OPERATION#${sys.systemId}` },
        ScanIndexForward: false, Limit: 50,
      }));
      const item = (result.Items || []).find(i => i.operationId === operationId);
      if (item) {
        if (item.status !== 'SCHEDULED') {
          return { success: false, message: `Operacion ${operationId} no se puede cancelar (estado: ${item.status})` };
        }
        await ddbDoc.send(new UpdateCommand({
          TableName: SCHEDULED_OPS_TABLE,
          Key: { pk: item.pk, sk: item.sk },
          UpdateExpression: 'SET #status = :cancelled, cancelledAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':cancelled': 'CANCELLED', ':now': new Date().toISOString() },
        }));
        return { success: true, operationId, message: `Operacion ${operationId} cancelada exitosamente` };
      }
    } catch (err) { /* continuar buscando */ }
  }
  return { success: false, message: `Operacion ${operationId} no encontrada` };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: getAIRecommendation
//  Genera recomendaciones IA basadas en el estado actual
// ═══════════════════════════════════════════════════════════════

async function getAIRecommendation(systemId) {
  log.info('Generando recomendacion IA', { systemId });
  const status = await getSystemStatus(systemId);
  if (!status.found) return { recommendation: status.message };

  const incidents = await getRecentIncidents(systemId, 72);

  let lastAdvisorResult = '';
  try {
    const advResult = await ddbDoc.send(new QueryCommand({
      TableName: ADVISOR_RESULTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `ADVISOR#${status.systemId}` },
      ScanIndexForward: false, Limit: 3,
    }));
    if (advResult.Items?.length > 0) {
      lastAdvisorResult = advResult.Items.map(i =>
        `[${i.useCase}] ${JSON.stringify(i.result).substring(0, 200)}`
      ).join('\n');
    }
  } catch (err) { /* sin datos */ }

  const metricsText = Object.entries(status.metrics)
    .map(([k, v]) => `  ${k}: avg=${v.average}, max=${v.maximum}`)
    .join('\n');

  const incidentsText = incidents.length > 0
    ? incidents.slice(0, 10).map(i => `  [${i.severity}] ${i.metricName}=${i.value} (${i.timestamp})`).join('\n')
    : '  Sin incidentes recientes';

  const prompt = `RECOMENDACION — Sistema: ${status.systemId} (${status.systemType}/${status.databaseType}, SID=${status.sid})

METRICAS ACTUALES:
${metricsText || '  Sin metricas disponibles'}

INCIDENTES ULTIMAS 72 HORAS (${incidents.length} total):
${incidentsText}

RECOMENDACIONES PREVIAS:
${lastAdvisorResult || '  Sin recomendaciones previas'}

Genera recomendacion personalizada:
1. ESTADO_GENERAL: Evaluacion general
2. TOP_3_ACCIONES: 3 acciones concretas por prioridad
3. PREDICCION_24H: Que podria pasar en las proximas 24 horas
4. SUGERENCIA_BACKUP: Mejor horario para backup
5. OPTIMIZACION: Sugerencia de optimizacion a largo plazo`;

  const result = await callBedrock([{ role: 'user', content: prompt }], CHATBOT_SYSTEM_PROMPT, 1200);

  return {
    recommendation: result.success ? result.text : 'No pude generar recomendacion. Datos disponibles en el dashboard.',
    bedrockUsed: result.success, systemId: status.systemId,
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: processIntent
//  Ejecuta la accion correspondiente al intent detectado
// ═══════════════════════════════════════════════════════════════

async function processIntent(parsed, userId, confirmed) {
  const intent = parsed.intent;
  const systemId = parsed.systemId;
  const params = parsed.parameters || {};

  switch (intent) {
    case 'STATUS': {
      if (!systemId) {
        const config = await loadSystemsConfig();
        return { availableSystems: config.filter(s => s.enabled).map(s => ({ id: s.systemId, type: s.systemType, sid: s.sid })) };
      }
      return await getSystemStatus(systemId);
    }
    case 'BACKUP': {
      if (!systemId) return { error: 'needSystemId', message: 'Se necesita especificar el sistema para el backup' };
      if (parsed.requiresConfirmation && !confirmed) return { awaitingConfirmation: true, action: 'BACKUP', systemId };
      const time = params.scheduledTime || params.time || params.hora || 'ahora';
      return await scheduleOperation('BACKUP', systemId, time, userId, params);
    }
    case 'RESTART': {
      if (!systemId) return { error: 'needSystemId', message: 'Se necesita especificar el sistema para el reinicio' };
      if (parsed.requiresConfirmation && !confirmed) return { awaitingConfirmation: true, action: 'RESTART', systemId };
      const time = params.scheduledTime || params.time || params.hora || 'ahora';
      return await scheduleOperation('RESTART', systemId, time, userId, params);
    }
    case 'METRICS': {
      if (!systemId) {
        const config = await loadSystemsConfig();
        return { availableSystems: config.filter(s => s.enabled).map(s => s.systemId) };
      }
      return await getSystemStatus(systemId);
    }
    case 'INCIDENTS': {
      const hours = params.hours || params.horas || 24;
      return { incidents: await getRecentIncidents(systemId, hours) };
    }
    case 'RECOMMENDATION': {
      if (!systemId) {
        const config = await loadSystemsConfig();
        const first = config.find(s => s.enabled);
        return first ? await getAIRecommendation(first.systemId) : { recommendation: 'No hay sistemas configurados' };
      }
      return await getAIRecommendation(systemId);
    }
    case 'OPERATIONS': return { operations: await listScheduledOperations(systemId) };
    case 'CANCEL': {
      const opId = params.operationId || params.id;
      if (!opId) return { error: 'Se necesita el ID de la operacion a cancelar' };
      return await cancelOperation(opId);
    }
    case 'HELP': return {
      capabilities: [
        { command: 'Estado', example: 'Como esta SAP-PRD-01?', description: 'Consultar estado del sistema' },
        { command: 'Backup', example: 'Programar backup de SAP-PRD-01 a las 3am', description: 'Programar backup de base de datos' },
        { command: 'Reiniciar', example: 'Reiniciar SAP-DEV-01 manana a las 5am', description: 'Programar reinicio de sistema' },
        { command: 'Metricas', example: 'Metricas de SAP-PRD-01', description: 'Ver metricas actuales' },
        { command: 'Incidentes', example: 'Que incidentes hubo hoy?', description: 'Ver incidentes recientes' },
        { command: 'Recomendar', example: 'Que recomiendas para SAP-PRD-01?', description: 'Recomendacion IA personalizada' },
        { command: 'Operaciones', example: 'Que operaciones hay programadas?', description: 'Ver operaciones pendientes' },
        { command: 'Cancelar', example: 'Cancelar operacion OP-123456', description: 'Cancelar operacion programada' },
      ],
    };
    default: return {};
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: fallbackIntentDetection
//  Deteccion de intent basica cuando Bedrock no esta disponible
// ═══════════════════════════════════════════════════════════════

function fallbackIntentDetection(message) {
  const msg = message.toLowerCase();
  const intentDefs = [
    { intent: 'BACKUP', keywords: ['backup', 'respaldo', 'copia de seguridad', 'copia'] },
    { intent: 'RESTART', keywords: ['reiniciar', 'restart', 'reboot', 'reinicio'] },
    { intent: 'STATUS', keywords: ['estado', 'como esta', 'status', 'salud', 'health'] },
    { intent: 'METRICS', keywords: ['metrica', 'valores', 'datos', 'monitoreo'] },
    { intent: 'INCIDENTS', keywords: ['incidente', 'alerta', 'problema', 'breach', 'error'] },
    { intent: 'RECOMMENDATION', keywords: ['recomienda', 'sugieres', 'consejo', 'optimizar', 'mejorar'] },
    { intent: 'OPERATIONS', keywords: ['operaciones', 'programadas', 'scheduled', 'pendientes'] },
    { intent: 'CANCEL', keywords: ['cancelar', 'cancel', 'eliminar operacion'] },
    { intent: 'HELP', keywords: ['ayuda', 'help', 'que puedes', 'comandos', 'hola'] },
  ];

  let detectedIntent = 'CONVERSATION';
  for (const { intent, keywords } of intentDefs) {
    if (keywords.some(kw => msg.includes(kw))) { detectedIntent = intent; break; }
  }

  const sysMatch = msg.match(/sap[-_]?\w+[-_]?\d+/i);
  const systemId = sysMatch ? sysMatch[0].toUpperCase().replace(/_/g, '-') : null;
  const needsConfirmation = ['BACKUP', 'RESTART', 'CANCEL'].includes(detectedIntent);

  return {
    intent: detectedIntent, systemId, parameters: {},
    response: `Entendido. Procesando tu solicitud de ${detectedIntent}...`,
    requiresConfirmation: needsConfirmation, actionSummary: null,
  };
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Chatbot Agent invocado');
  const startTime = Date.now();

  try {
    const method = event.httpMethod || event.requestContext?.http?.method || 'POST';
    if (method === 'OPTIONS') return respond(200, { message: 'OK' });
    if (method !== 'POST') return respond(405, { error: 'Metodo no permitido. Usar POST.' });

    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      return respond(400, { error: 'Body JSON invalido' });
    }

    const { message, userId, sessionId, confirmed } = body;
    if (!message || typeof message !== 'string') return respond(400, { error: 'Campo "message" requerido' });

    const session = sessionId || `session-${Date.now()}`;
    const user = userId || 'anonymous';
    log.info('Mensaje recibido', { userId: user, messagePreview: message.substring(0, 100) });

    // Paso 1: Cargar historial de conversacion
    const history = await loadConversationHistory(session);

    // Paso 2: Construir mensajes para Bedrock con contexto
    const systemsConfig = await loadSystemsConfig();
    const systemsList = systemsConfig.filter(s => s.enabled)
      .map(s => `${s.systemId} (${s.systemType}/${s.database?.type}, SID=${s.sid})`).join(', ');

    const enrichedMessage = `[CONTEXTO: Sistemas SAP disponibles: ${systemsList}]
[HORA ACTUAL: ${new Date().toISOString()} / ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} Colombia]
${confirmed ? '[NOTA: El usuario CONFIRMA la accion solicitada]' : ''}

Mensaje del usuario: ${message}`;

    const messages = [...history, { role: 'user', content: enrichedMessage }];

    // Paso 3: Llamar a Bedrock para analisis del mensaje
    const bedrockResult = await callBedrock(messages, CHATBOT_SYSTEM_PROMPT, 1200);

    let parsed;
    if (bedrockResult.success) {
      try {
        const jsonMatch = bedrockResult.text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch (e) {
        parsed = null;
      }
    }
    if (!parsed) parsed = fallbackIntentDetection(message);

    // Paso 4: Ejecutar la accion del intent
    const contextData = await processIntent(parsed, user, confirmed);

    // Paso 5: Generar respuesta enriquecida con datos reales
    let finalResponse = parsed.response || 'Lo siento, no pude procesar tu solicitud.';

    if (Object.keys(contextData).length > 0 && parsed.intent !== 'HELP' && parsed.intent !== 'CONVERSATION') {
      const contextPrompt = `El usuario pidio: "${message}"
Intent: ${parsed.intent} | Sistema: ${parsed.systemId || 'no especificado'}

DATOS REALES DEL SISTEMA:
${JSON.stringify(contextData, null, 2).substring(0, 3000)}

Genera una respuesta conversacional clara y util basandote en los datos reales.
${contextData.awaitingConfirmation ? 'IMPORTANTE: Pide confirmacion explicando que va a pasar.' : ''}
${contextData.success === false ? 'IMPORTANTE: Hubo un error. Explica el problema.' : ''}
Responde SOLO con el texto de la respuesta (sin JSON).`;

      const enrichedResult = await callBedrock(
        [{ role: 'user', content: contextPrompt }],
        'Eres AlwaysOps AI, asistente de Avvale SAP AlwaysOps. Responde en espanol, amigable y profesional. No inventes datos.',
        800
      );
      if (enrichedResult.success) finalResponse = enrichedResult.text;
    }

    // Paso 6: Guardar conversacion
    await saveConversationTurn(session, 'user', message, { userId: user });
    await saveConversationTurn(session, 'assistant', finalResponse, {
      intent: parsed.intent, systemId: parsed.systemId,
    });

    // Paso 7: Construir respuesta
    const duration = Date.now() - startTime;
    return respond(200, {
      response: finalResponse, intent: parsed.intent, systemId: parsed.systemId,
      sessionId: session, requiresConfirmation: contextData.awaitingConfirmation || false,
      actionResult: contextData.operationId ? {
        operationId: contextData.operationId, type: contextData.operationType,
        scheduledTime: contextData.scheduledTime, scheduledTimeLocal: contextData.scheduledTimeLocal,
      } : null,
      bedrockUsed: bedrockResult.success, duration: `${duration}ms`,
    });

  } catch (err) {
    log.error('Error fatal', { error: err.message, stack: err.stack });
    return respond(500, {
      response: 'Lo siento, ocurrio un error interno. Por favor intenta de nuevo.',
      error: err.message,
    });
  }
};
