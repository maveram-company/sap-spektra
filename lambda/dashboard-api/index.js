'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — Dashboard API
//  API REST para el dashboard de monitoreo + chatbot + operaciones + admin.
//
//  ¿Qué hace este Lambda?
//  Expone endpoints HTTP via API Gateway para que un frontend
//  (dashboard web) pueda consultar el estado de los sistemas SAP:
//  - Listar sistemas monitoreados
//  - Ver métricas recientes de un sistema
//  - Ver historial de breaches y ejecuciones de runbooks
//  - Ver solicitudes de aprobación pendientes
// ═══════════════════════════════════════════════════════════════

const log = require('../utilidades/logger')('dashboard-api');
const { getSystemConfig: getTrialConfig, getModeConfig, checkActionAllowed } = require('../utilidades/trial-config');
const { safeParse } = require('../utilidades/input-validator');
const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { parsePaginationParams, buildPaginatedResponse, applyPagination } = require('../utilidades/pagination-helper');

// Clientes de AWS
const cw = new CloudWatchClient({});
const ssm = new SSMClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

// Configuración
const CW_NAMESPACE = process.env.CW_NAMESPACE || 'SAPAlwaysOps';
const METRICS_HISTORY_TABLE = process.env.METRICS_HISTORY_TABLE || 'sap-alwaysops-metrics-history';
const APPROVALS_TABLE = process.env.APPROVALS_TABLE || 'sap-alwaysops-approvals';
const SCHEDULED_OPS_TABLE = process.env.SCHEDULED_OPS_TABLE || 'sap-alwaysops-scheduled-operations';
const ADVISOR_RESULTS_TABLE = process.env.ADVISOR_RESULTS_TABLE || 'sap-alwaysops-advisor-results';
const CHATBOT_FUNCTION = process.env.CHATBOT_FUNCTION || 'sap-alwaysops-chatbot-agent';
const RUNBOOK_EXECUTIONS_TABLE = process.env.RUNBOOK_EXECUTIONS_TABLE || 'sap-alwaysops-runbook-executions';

// Caché de configuración para no leer SSM en cada request
let systemsConfigCache = null;
let configCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: respond
//  v2.0 — Importar response helper compartido para CORS y error schema consistente
// ═══════════════════════════════════════════════════════════════

const { respond: _respond, respondError, getCorrelationId, getRequestOrigin } = require('../utilidades/response-helper');

// Wrapper para mantener compatibilidad con código existente
function respond(statusCode, body) {
  return _respond(statusCode, body);
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getSystemsConfig
//  Lee la lista de sistemas SAP desde SSM Parameter Store.
//  Usa un caché de 5 minutos para no sobrecargar SSM.
// ═══════════════════════════════════════════════════════════════

async function getSystemsConfig() {
  // Verificar si el caché es válido
  if (systemsConfigCache && (Date.now() - configCacheTime) < CACHE_TTL_MS) {
    return systemsConfigCache;
  }

  try {
    const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
    const param = await ssm.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    }));

    systemsConfigCache = JSON.parse(param.Parameter.Value);
    configCacheTime = Date.now();
    return systemsConfigCache;
  } catch (err) {
    log.warn('Error leyendo SSM, usando configuracion de respaldo', { error: err.message });
    return [{
      systemId: process.env.SYSTEM_ID || 'SAP-DEFAULT',
      systemType: 'SAP_PO',
      sid: 'PRD',
      environment: 'Production',
      enabled: true,
      database: { type: 'SAP_ASE' },
    }];
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /systems
//  Lista todos los sistemas SAP monitoreados.
// ═══════════════════════════════════════════════════════════════

async function listSystems() {
  const config = await getSystemsConfig();

  // Devolver info básica de cada sistema (sin secretos)
  const systems = config.map(sys => ({
    systemId: sys.systemId,
    systemType: sys.systemType,
    sid: sys.sid,
    environment: sys.environment,
    enabled: sys.enabled,
    databaseType: sys.database?.type,
  }));

  return { systems, count: systems.length };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getMetricNamesForSystem
//  Devuelve los nombres de métricas relevantes según el tipo
//  de base de datos y aplicación del sistema.
// ═══════════════════════════════════════════════════════════════

function getMetricNamesForSystem(dbType, systemType) {
  const metrics = [];

  // Métricas de base de datos según tipo
  switch (dbType) {
    case 'SAP_ASE':
      metrics.push('DB_ASE_LogFullPct', 'DB_ASE_PhysLogPct', 'DB_ASE_PhysDataPct',
        'DB_ASE_LogLastDumpMin', 'DB_ASE_OldestTxMin', 'DB_ASE_BlockingChains',
        'DB_ASE_CacheHitRatio', 'DB_ASE_DiskScenario');
      break;
    case 'SAP_HANA':
      metrics.push('DB_HANA_MemPct', 'DB_HANA_DiskPct', 'DB_HANA_ReplicationLag',
        'DB_HANA_LongRunningStmts', 'DB_HANA_CSUnloads1h', 'DB_HANA_ActiveConns',
        'DB_HANA_LastBackupMin');
      break;
    case 'ORACLE':
      metrics.push('DB_ORA_TablespacePct', 'DB_ORA_RedoSwitches1h',
        'DB_ORA_ActiveSessions', 'DB_ORA_BlockedSessions', 'DB_ORA_LastBackupMin');
      break;
    case 'MSSQL':
      metrics.push('DB_MSSQL_LogPct', 'DB_MSSQL_DataPct', 'DB_MSSQL_ActiveConns',
        'DB_MSSQL_LastBackupMin');
      break;
    case 'IBM_DB2':
      metrics.push('DB_DB2_TablespacePct', 'DB_DB2_LogPct', 'DB_DB2_Connections',
        'DB_DB2_LastBackupMin');
      break;
    case 'MAXDB':
      metrics.push('DB_MAXDB_DataVolPct', 'DB_MAXDB_LogVolPct', 'DB_MAXDB_DataCacheHitPct',
        'DB_MAXDB_LockWaitPct', 'DB_MAXDB_LastBackupMin');
      break;
  }

  // Métricas de aplicación según tipo
  switch (systemType) {
    case 'SAP_PO':
    case 'SAP_PI':
      metrics.push('APP_JVM_HeapPct', 'APP_JVM_OldGenPct', 'APP_JVM_GCOverheadPct',
        'APP_PO_FailedMessages', 'APP_PO_StuckMessages', 'APP_ICM_ActiveConns',
        'APP_ICM_CertExpiryDays');
      break;
    case 'SAP_ECC':
    case 'SAP_S4HANA':
    case 'SAP_BW':
      metrics.push('APP_ABAP_FreeDiaWP', 'APP_ABAP_ShortDumps24h',
        'APP_ABAP_FailedJobs24h', 'APP_ABAP_LongRunningJobs', 'APP_ABAP_EnqueuePct',
        'APP_ABAP_RFCQueueDepth', 'APP_ABAP_TRFCQueueDepth', 'APP_ABAP_QRFCQueueDepth',
        'APP_ABAP_PrivModeWP', 'APP_ABAP_HoldWP', 'APP_ICM_CertExpiryDays',
        'APP_ABAP_OldSpoolJobs', 'APP_ABAP_SM21OldLogs', 'APP_ABAP_TEMSEObjects',
        'APP_ABAP_OldEnqLocks', 'APP_ABAP_LockWaitTimeSec',
        'APP_ABAP_StuckTransports', 'APP_ABAP_FailedTransports');
      break;
    case 'SAP_FIORI':
    case 'SAP_GATEWAY':
      metrics.push('APP_FIORI_ResponseTimeMs', 'APP_FIORI_SessionCount',
        'APP_ICM_ActiveConns', 'APP_ICM_PoolUsagePct', 'APP_ICM_CertExpiryDays');
      break;
  }

  // Métricas comunes
  metrics.push('DB_CollectorSuccess', 'APP_CollectorSuccess');

  // v1.6 — Health Score del sistema
  metrics.push('SYS_HealthScore');

  return metrics;
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /systems/{id}/metrics
//  Obtiene las métricas recientes de un sistema desde CloudWatch.
//  Por defecto muestra las últimas 2 horas.
// ═══════════════════════════════════════════════════════════════

async function getSystemMetrics(systemId, queryParams) {
  const config = await getSystemsConfig();
  const sysConfig = config.find(s => s.systemId === systemId);

  if (!sysConfig) {
    return { error: `Sistema no encontrado: ${systemId}` };
  }

  // Parámetros de consulta opcionales
  const hoursBack = parseInt(queryParams?.hours || '2');
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hoursBack * 60 * 60 * 1000);

  // Obtener los nombres de métricas relevantes para este sistema
  const metricNames = getMetricNamesForSystem(sysConfig.database?.type, sysConfig.systemType);

  // Construir las queries de métricas para CloudWatch GetMetricData
  const metricQueries = metricNames.map((name, index) => ({
    Id: `m${index}`,
    MetricStat: {
      Metric: {
        Namespace: CW_NAMESPACE,
        MetricName: name,
        Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
      },
      Period: 300, // 5 minutos
      Stat: 'Average',
    },
    ReturnData: true,
  }));

  try {
    // CloudWatch permite máximo 500 queries por llamada
    const result = await cw.send(new GetMetricDataCommand({
      MetricDataQueries: metricQueries,
      StartTime: startTime,
      EndTime: endTime,
    }));

    // Transformar los resultados en un formato más fácil de usar
    const metrics = {};
    (result.MetricDataResults || []).forEach((mdr, index) => {
      const name = metricNames[index];
      metrics[name] = {
        values: mdr.Values || [],
        timestamps: (mdr.Timestamps || []).map(t => t.toISOString()),
        label: mdr.Label,
        // El último valor disponible
        current: mdr.Values?.length > 0 ? mdr.Values[0] : null,
      };
    });

    return {
      systemId,
      systemType: sysConfig.systemType,
      databaseType: sysConfig.database?.type,
      period: `${hoursBack}h`,
      metricsCount: Object.keys(metrics).length,
      metrics,
    };
  } catch (err) {
    log.error('Error leyendo metricas de CloudWatch', { error: err.message });
    return { systemId, error: err.message, metrics: {} };
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /systems/{id}/breaches
//  Obtiene el historial reciente de breaches y ejecuciones de
//  runbooks desde DynamoDB.
// ═══════════════════════════════════════════════════════════════

async function getSystemBreaches(systemId, queryParams, event) {
  const pagination = parsePaginationParams(event || { queryStringParameters: queryParams });

  try {
    // Consultar breaches registrados por el runbook-engine
    const result = await ddbDoc.send(new QueryCommand({
      TableName: METRICS_HISTORY_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `RUNBOOK#${systemId}` },
      ScanIndexForward: false, // Orden descendente (más recientes primero)
      Limit: pagination.limit,
      ...(pagination.exclusiveStartKey && { ExclusiveStartKey: pagination.exclusiveStartKey }),
    }));

    const breaches = (result.Items || []).map(item => ({
      runbookId: item.runbookId,
      metricName: item.metricName,
      metricValue: item.metricValue,
      severity: item.severity,
      success: item.success,
      autoExecuted: item.autoExecuted,
      executedAt: item.executedAt,
      ssmStatus: item.ssmStatus,
    }));

    const paginatedResult = buildPaginatedResponse(breaches, result.LastEvaluatedKey, pagination.limit);
    return { systemId, ...paginatedResult };
  } catch (err) {
    log.error('Error leyendo breaches de DynamoDB', { error: err.message });
    return { systemId, items: [], count: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /approvals
//  Lista solicitudes de aprobación, opcionalmente filtradas
//  por estado (PENDING, APPROVED, REJECTED, EXPIRED).
// ═══════════════════════════════════════════════════════════════

async function listApprovals(queryParams, event) {
  const statusFilter = queryParams?.status || 'PENDING';
  const pagination = parsePaginationParams(event || { queryStringParameters: queryParams });

  try {
    const queryInput = {
      TableName: APPROVALS_TABLE,
      IndexName: 'status-created-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': statusFilter },
      Limit: pagination.limit,
      ...(pagination.exclusiveStartKey && { ExclusiveStartKey: pagination.exclusiveStartKey }),
    };

    const result = await ddbDoc.send(new QueryCommand(queryInput));

    const approvals = (result.Items || []).map(item => ({
      approvalId: item.approvalId,
      systemId: item.systemId,
      runbookId: item.runbookId,
      severity: item.severity,
      metricName: item.metricName,
      metricValue: item.metricValue,
      status: item.status,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      processedAt: item.processedAt,
      processedBy: item.processedBy,
    }));

    const paginatedResult = buildPaginatedResponse(approvals, result.LastEvaluatedKey, pagination.limit);
    return { ...paginatedResult, statusFilter };
  } catch (err) {
    log.error('Error leyendo approvals de DynamoDB', { error: err.message });
    return { items: [], count: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /approvals/{id}
//  Obtiene los detalles de una solicitud de aprobación específica.
// ═══════════════════════════════════════════════════════════════

async function getApproval(approvalId) {
  try {
    // Intentar buscar en todos los estados posibles
    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']) {
      const result = await ddbDoc.send(new GetCommand({
        TableName: APPROVALS_TABLE,
        Key: { pk: `APPROVAL#${approvalId}`, sk: status },
      }));

      if (result.Item) {
        return {
          approvalId: result.Item.approvalId,
          systemId: result.Item.systemId,
          runbookId: result.Item.runbookId,
          severity: result.Item.severity,
          metricName: result.Item.metricName,
          metricValue: result.Item.metricValue,
          status: result.Item.status,
          commands: result.Item.commands,
          createdAt: result.Item.createdAt,
          expiresAt: result.Item.expiresAt,
          processedAt: result.Item.processedAt,
          processedBy: result.Item.processedBy,
        };
      }
    }

    return { error: `Aprobacion no encontrada: ${approvalId}` };
  } catch (err) {
    log.error('Error leyendo approval de DynamoDB', { error: err.message });
    return { error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: POST /chat
//  Proxy al chatbot-agent Lambda para interacción con IA.
// ═══════════════════════════════════════════════════════════════

async function chatProxy(body) {
  try {
    const response = await lambda.send(new InvokeCommand({
      FunctionName: CHATBOT_FUNCTION,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        httpMethod: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    }));

    const payload = JSON.parse(new TextDecoder().decode(response.Payload));
    if (payload.statusCode && payload.body) {
      try {
        return typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
      } catch (parseErr) {
        log.warn('Chatbot retorno body no-JSON', { body: payload.body?.substring?.(0, 200) });
        return { response: payload.body || 'Respuesta no disponible' };
      }
    }
    return payload;
  } catch (err) {
    log.error('Error invocando chatbot', { error: err.message });
    return { error: err.message, response: 'Error conectando con el chatbot.' };
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /operations
//  Lista operaciones programadas (backups, reinicios).
// ═══════════════════════════════════════════════════════════════

async function listOperations(queryParams, event) {
  const statusFilter = queryParams?.status;
  const systemId = queryParams?.systemId;
  const pagination = parsePaginationParams(event || { queryStringParameters: queryParams });

  try {
    let result;

    if (statusFilter) {
      // Usar GSI 'status-nextRun-index' cuando filtramos por status
      const queryInput = {
        TableName: SCHEDULED_OPS_TABLE,
        IndexName: 'status-nextRun-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': statusFilter },
        Limit: pagination.limit,
        ...(pagination.exclusiveStartKey && { ExclusiveStartKey: pagination.exclusiveStartKey }),
      };

      if (systemId) {
        queryInput.FilterExpression = 'systemId = :sid';
        queryInput.ExpressionAttributeValues[':sid'] = systemId;
      }

      result = await ddbDoc.send(new QueryCommand(queryInput));
    } else if (systemId) {
      // v1.5 — Query via GSI 'system-scheduledTime-index' (PK: systemId) cuando solo hay filtro de sistema.
      const queryInput = {
        TableName: SCHEDULED_OPS_TABLE,
        IndexName: 'system-scheduledTime-index',
        KeyConditionExpression: 'systemId = :sid',
        ExpressionAttributeValues: { ':sid': systemId },
        Limit: pagination.limit,
        ScanIndexForward: false,
        ...(pagination.exclusiveStartKey && { ExclusiveStartKey: pagination.exclusiveStartKey }),
      };
      result = await ddbDoc.send(new QueryCommand(queryInput));
    } else {
      // v1.5 — Query via GSI 'entityType-scheduledTime-index' (PK: entityType = 'SCHEDULED_OP')
      // para listar todas las operaciones sin Scan.
      const queryInput = {
        TableName: SCHEDULED_OPS_TABLE,
        IndexName: 'entityType-scheduledTime-index',
        KeyConditionExpression: 'entityType = :etype',
        ExpressionAttributeValues: { ':etype': 'SCHEDULED_OP' },
        Limit: pagination.limit,
        ScanIndexForward: false,
        ...(pagination.exclusiveStartKey && { ExclusiveStartKey: pagination.exclusiveStartKey }),
      };
      result = await ddbDoc.send(new QueryCommand(queryInput));
    }

    let operations = (result.Items || []).map(item => ({
      operationId: item.operationId,
      type: item.operationType,
      systemId: item.systemId,
      sid: item.sid,
      scheduledTime: item.scheduledTime,
      status: item.status,
      requestedBy: item.requestedBy,
      requestedAt: item.requestedAt,
      riskLevel: item.riskAssessment?.riskLevel,
      completedAt: item.completedAt,
    }));

    operations.sort((a, b) => (b.scheduledTime || '').localeCompare(a.scheduledTime || ''));

    const paginatedResult = buildPaginatedResponse(operations, result.LastEvaluatedKey, pagination.limit);
    return paginatedResult;
  } catch (err) {
    log.error('Error en operaciones', { error: err.message });
    return { items: [], count: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /ai-insights
//  Genera insights IA para el dashboard (últimas recomendaciones)
// ═══════════════════════════════════════════════════════════════

async function getAIInsights(queryParams) {
  const systemId = queryParams?.systemId;
  const config = await getSystemsConfig();
  const systems = systemId
    ? config.filter(s => s.systemId === systemId)
    : config.filter(s => s.enabled);

  const insights = [];

  for (const sys of systems.slice(0, 5)) {
    try {
      const result = await ddbDoc.send(new QueryCommand({
        TableName: ADVISOR_RESULTS_TABLE,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `ADVISOR#${sys.systemId}` },
        ScanIndexForward: false,
        Limit: 5,
      }));

      (result.Items || []).forEach(item => {
        insights.push({
          systemId: sys.systemId,
          useCase: item.useCase,
          timestamp: item.timestamp,
          bedrockUsed: item.bedrockUsed,
          summary: typeof item.result === 'object'
            ? (item.result.analysis || item.result.forecast || item.result.riskLevel || JSON.stringify(item.result)).substring(0, 200)
            : String(item.result).substring(0, 200),
        });
      });
    } catch (err) { /* sin datos */ }
  }

  insights.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  return { insights: insights.slice(0, 20), count: insights.length };
}

// ═══════════════════════════════════════════════════════════════
//  v1.8 — ENDPOINT: GET /systems/{id}/anomalies
//  Devuelve anomalías detectadas y baselines de métricas
//  almacenadas por el universal-collector (v1.7).
// ═══════════════════════════════════════════════════════════════

async function getSystemAnomalies(systemId) {
  try {
    // Consultar baselines de métricas del sistema
    const result = await ddbDoc.send(new QueryCommand({
      TableName: METRICS_HISTORY_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `BASELINE#${systemId}` },
    }));

    const baselines = (result.Items || []).map(item => ({
      metricName: item.sk,
      mean: item.mean !== undefined ? parseFloat(item.mean.toFixed(2)) : null,
      variance: item.variance !== undefined ? parseFloat(item.variance.toFixed(4)) : null,
      stdDev: item.variance !== undefined ? parseFloat(Math.sqrt(item.variance).toFixed(2)) : null,
      lastValue: item.lastValue,
      count: item.count || 0,
      updatedAt: item.updatedAt,
    }));

    // Detectar cuáles tienen anomalía activa (z-score > 2)
    const anomalies = baselines.filter(b => {
      if (!b.lastValue || !b.stdDev || b.stdDev === 0 || b.count < 12) return false;
      const z = Math.abs((b.lastValue - b.mean) / b.stdDev);
      b.zScore = parseFloat(z.toFixed(2));
      b.isAnomaly = z > 2;
      b.severity = z > 3 ? 'HIGH' : z > 2 ? 'MODERATE' : 'NORMAL';
      return b.isAnomaly;
    });

    return {
      systemId,
      totalMetrics: baselines.length,
      activeAnomalies: anomalies.length,
      anomalies,
      baselines: baselines.slice(0, 50),
    };
  } catch (err) {
    log.error('Error consultando anomalias', { error: err.message });
    return { systemId, error: err.message, anomalies: [], baselines: [] };
  }
}

// ═══════════════════════════════════════════════════════════════
//  v1.8 — ENDPOINT: GET /executions
//  Historial de ejecuciones de runbooks con filtros opcionales.
//  Query params: systemId (requerido), limit, status (success/failed)
// ═══════════════════════════════════════════════════════════════

async function getExecutionHistory(queryParams, event) {
  const systemId = queryParams?.systemId;
  if (!systemId) {
    return { error: 'systemId es requerido', items: [], count: 0 };
  }

  const pagination = parsePaginationParams(event || { queryStringParameters: queryParams });
  const statusFilter = queryParams?.status; // 'success' o 'failed'

  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: METRICS_HISTORY_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `RUNBOOK#${systemId}` },
      ScanIndexForward: false,
      Limit: pagination.limit,
      ...(pagination.exclusiveStartKey && { ExclusiveStartKey: pagination.exclusiveStartKey }),
    }));

    let executions = (result.Items || []).map(item => ({
      runbookId: item.runbookId,
      metricName: item.metricName,
      severity: item.severity,
      success: item.success,
      executedAt: item.executedAt || item.sk,
      output: item.output ? String(item.output).substring(0, 500) : null,
      dryRun: item.dryRun || false,
      chainStep: item.chainStep,
      chainedFrom: item.chainedFrom,
      autoExecuted: item.autoExecuted,
      safetyGate: item.safetyGate,
    }));

    // Filtrar por status si se especificó
    if (statusFilter === 'success') {
      executions = executions.filter(e => e.success === true);
    } else if (statusFilter === 'failed') {
      executions = executions.filter(e => e.success === false);
    }

    const paginatedResult = buildPaginatedResponse(executions, result.LastEvaluatedKey, pagination.limit);
    return { systemId, ...paginatedResult };
  } catch (err) {
    log.error('Error consultando historial de ejecuciones', { error: err.message });
    return { systemId, error: err.message, items: [], count: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
//H16: RUNBOOK ANALYTICS
//  Endpoint: GET /analytics/runbooks?systemId=X&days=30
//  Proporciona métricas de rendimiento de runbooks:
//  - Tasa de éxito/fallo por runbook
//  - Tiempo promedio de ejecución
//  - Runbooks más disparados
//  - Tendencia de ejecuciones por día
// ═══════════════════════════════════════════════════════════════

async function getRunbookAnalytics(queryParams) {
  const systemId = queryParams?.systemId;
  if (!systemId) {
    return { statusCode: 400, body: { error: 'systemId es requerido' } };
  }

  const days = parseInt(queryParams?.days || '30');
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Consultar todas las ejecuciones del sistema en el período
    const result = await ddbDoc.send(new QueryCommand({
      TableName: METRICS_HISTORY_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk >= :since',
      ExpressionAttributeValues: {
        ':pk': `RUNBOOK#${systemId}`,
        ':since': sinceDate,
      },
      ScanIndexForward: false,
    }));

    const executions = result.Items || [];

    if (executions.length === 0) {
      return {
        statusCode: 200,
        body: {
          systemId,
          period: `${days} días`,
          totalExecutions: 0,
          message: 'No hay ejecuciones en el período solicitado',
        },
      };
    }

    // Calcular métricas por runbook
    const runbookStats = {};
    const dailyCounts = {};

    for (const exec of executions) {
      const rbId = exec.runbookId || exec.runbook || 'UNKNOWN';
      const success = exec.success === true || exec.status === 'Success';
      const execDate = (exec.sk || exec.timestamp || '').substring(0, 10); // YYYY-MM-DD

      // Estadísticas por runbook
      if (!runbookStats[rbId]) {
        runbookStats[rbId] = {
          runbookId: rbId,
          total: 0,
          success: 0,
          failed: 0,
          dryRun: 0,
          chained: 0,
          avgDurationMs: 0,
          totalDurationMs: 0,
          lastExecution: null,
        };
      }

      const stats = runbookStats[rbId];
      stats.total++;
      if (exec.dryRun) stats.dryRun++;
      if (exec.chained) stats.chained++;
      if (success) stats.success++;
      else stats.failed++;

      if (exec.durationMs) stats.totalDurationMs += exec.durationMs;
      if (!stats.lastExecution || (exec.sk || exec.timestamp) > stats.lastExecution) {
        stats.lastExecution = exec.sk || exec.timestamp;
      }

      // Conteo diario
      if (execDate) {
        dailyCounts[execDate] = (dailyCounts[execDate] || 0) + 1;
      }
    }

    // Calcular promedios y tasas
    const runbookList = Object.values(runbookStats).map(stats => {
      if (stats.total > 0 && stats.totalDurationMs > 0) {
        stats.avgDurationMs = Math.round(stats.totalDurationMs / stats.total);
      }
      stats.successRate = stats.total > 0 ? parseFloat(((stats.success / stats.total) * 100).toFixed(1)) : 0;
      delete stats.totalDurationMs;
      return stats;
    });

    // Ordenar por total de ejecuciones (más ejecutados primero)
    runbookList.sort((a, b) => b.total - a.total);

    // Tendencia diaria
    const dailyTrend = Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // Resumen global
    const totalExec = executions.length;
    const totalSuccess = executions.filter(e => e.success === true || e.status === 'Success').length;
    const totalFailed = totalExec - totalSuccess;

    return {
      statusCode: 200,
      body: {
        systemId,
        period: `${days} días`,
        summary: {
          totalExecutions: totalExec,
          successCount: totalSuccess,
          failedCount: totalFailed,
          globalSuccessRate: parseFloat(((totalSuccess / totalExec) * 100).toFixed(1)),
          uniqueRunbooks: runbookList.length,
          avgExecutionsPerDay: parseFloat((totalExec / days).toFixed(1)),
        },
        runbooks: runbookList,
        dailyTrend,
      },
    };
  } catch (err) {
    log.error('Error obteniendo analytics de runbooks', { error: err.message });
    return { statusCode: 500, body: { error: 'Error interno al obtener analytics' } };
  }
}

// ═══════════════════════════════════════════════════════════════
//H20: SLA / AVAILABILITY METRICS
//  Endpoint: GET /systems/{id}/sla?days=30
//  Calcula métricas de disponibilidad del sistema SAP:
//  - Availability % (basado en DB_CollectorSuccess)
//  - MTTR (Mean Time To Recover) basado en breaches resueltos
//  - MTBF (Mean Time Between Failures) basado en intervalo entre breaches
//  - Breach frequency por severidad
//  - Health Score promedio y tendencia
// ═══════════════════════════════════════════════════════════════

async function getSystemSLA(systemId, queryParams) {
  const days = parseInt(queryParams?.days || '30');
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    // 1. Availability basada en DB_CollectorSuccess
    const availabilityResult = await cw.send(new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: 'collector_success',
          MetricStat: {
            Metric: {
              Namespace: CW_NAMESPACE,
              MetricName: 'DB_CollectorSuccess',
              Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
            },
            Period: 300, // 5 minutos
            Stat: 'Average',
          },
          ReturnData: true,
        },
        {
          Id: 'health_score',
          MetricStat: {
            Metric: {
              Namespace: CW_NAMESPACE,
              MetricName: 'SYS_HealthScore',
              Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
            },
            Period: 3600, // 1 hora
            Stat: 'Average',
          },
          ReturnData: true,
        },
      ],
      StartTime: startTime,
      EndTime: endTime,
    }));

    // Calcular availability %
    const collectorValues = availabilityResult.MetricDataResults?.[0]?.Values || [];
    const totalSamples = collectorValues.length;
    const successSamples = collectorValues.filter(v => v >= 1).length;
    const availabilityPct = totalSamples > 0
      ? parseFloat(((successSamples / totalSamples) * 100).toFixed(3))
      : 0;

    // Calcular Health Score promedio y tendencia
    const healthValues = availabilityResult.MetricDataResults?.[1]?.Values || [];
    const healthTimestamps = availabilityResult.MetricDataResults?.[1]?.Timestamps || [];
    const avgHealthScore = healthValues.length > 0
      ? parseFloat((healthValues.reduce((a, b) => a + b, 0) / healthValues.length).toFixed(1))
      : -1;

    // Tendencia del Health Score (últimas 24h vs periodo completo)
    const last24hValues = healthValues.filter((_, i) => {
      const ts = new Date(healthTimestamps[i]);
      return (endTime - ts) <= 24 * 60 * 60 * 1000;
    });
    const avgLast24h = last24hValues.length > 0
      ? parseFloat((last24hValues.reduce((a, b) => a + b, 0) / last24hValues.length).toFixed(1))
      : avgHealthScore;
    const healthTrend = avgLast24h > avgHealthScore ? 'IMPROVING' : avgLast24h < avgHealthScore ? 'DEGRADING' : 'STABLE';

    // 2. Breach history para MTTR, MTBF, frequency
    const breachResult = await ddbDoc.send(new QueryCommand({
      TableName: METRICS_HISTORY_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk >= :since',
      ExpressionAttributeValues: {
        ':pk': `RUNBOOK#${systemId}`,
        ':since': startTime.toISOString(),
      },
      ScanIndexForward: true,
    }));

    const breachItems = breachResult.Items || [];
    const totalBreaches = breachItems.length;

    // Calcular MTBF (Mean Time Between Failures) en horas
    let mtbfHours = 0;
    if (totalBreaches >= 2) {
      const timestamps = breachItems
        .map(item => new Date(item.sk || item.executedAt).getTime())
        .filter(t => !isNaN(t))
        .sort((a, b) => a - b);

      if (timestamps.length >= 2) {
        const intervals = [];
        for (let i = 1; i < timestamps.length; i++) {
          intervals.push(timestamps[i] - timestamps[i - 1]);
        }
        const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        mtbfHours = parseFloat((avgIntervalMs / (1000 * 60 * 60)).toFixed(1));
      }
    } else if (totalBreaches <= 1) {
      mtbfHours = days * 24; // Sin breaches suficientes, MTBF = periodo completo
    }

    // Calcular MTTR (Mean Time To Recover) — basado en breaches exitosos
    const successfulBreaches = breachItems.filter(item => item.success === true);
    let mttrMinutes = 0;
    if (successfulBreaches.length > 0) {
      const durations = successfulBreaches
        .map(item => item.durationMs || 30000) // default 30s si no hay dato
        .filter(d => d > 0);
      if (durations.length > 0) {
        const avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;
        mttrMinutes = parseFloat((avgDurationMs / (1000 * 60)).toFixed(1));
      }
    }

    // Breach frequency por severidad
    const breachBySeverity = { CRITICAL: 0, HIGH: 0 };
    for (const item of breachItems) {
      const sev = item.severity || 'HIGH';
      breachBySeverity[sev] = (breachBySeverity[sev] || 0) + 1;
    }

    // Breach frequency por día
    const breachesPerDay = {};
    for (const item of breachItems) {
      const date = (item.sk || item.executedAt || '').substring(0, 10);
      if (date) breachesPerDay[date] = (breachesPerDay[date] || 0) + 1;
    }
    const avgBreachesPerDay = totalBreaches > 0
      ? parseFloat((totalBreaches / days).toFixed(1))
      : 0;

    // Determinar SLA tier
    let slaTier = 'PLATINUM';
    if (availabilityPct < 99.0) slaTier = 'GOLD';
    if (availabilityPct < 95.0) slaTier = 'SILVER';
    if (availabilityPct < 90.0) slaTier = 'BRONZE';
    if (availabilityPct < 80.0) slaTier = 'AT_RISK';

    // 3. Uptime streaks
    let currentUptimeHours = 0;
    if (collectorValues.length > 0) {
      // Contar desde el último fallo hacia adelante
      for (let i = 0; i < collectorValues.length; i++) {
        if (collectorValues[i] >= 1) {
          currentUptimeHours += 5 / 60; // 5 min = 0.083 horas
        } else {
          currentUptimeHours = 0; // Reset en fallo
        }
      }
      currentUptimeHours = parseFloat(currentUptimeHours.toFixed(1));
    }

    return {
      systemId,
      period: `${days} días`,
      sla: {
        availabilityPct,
        slaTier,
        totalSamples,
        failedSamples: totalSamples - successSamples,
        currentUptimeHours,
      },
      reliability: {
        mtbfHours,
        mttrMinutes,
        totalBreaches,
        breachBySeverity,
        avgBreachesPerDay,
        successRate: totalBreaches > 0
          ? parseFloat(((successfulBreaches.length / totalBreaches) * 100).toFixed(1))
          : 100,
      },
      healthScore: {
        average: avgHealthScore,
        last24hAverage: avgLast24h,
        trend: healthTrend,
        dataPoints: healthValues.length,
      },
      breachTrend: Object.entries(breachesPerDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    };
  } catch (err) {
    log.error('Error calculando SLA', { systemId, error: err.message });
    return { systemId, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /health
//  Endpoint de salud para verificar que el API está funcionando.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  version.json — SSOT para version del producto
//  Se importa una sola vez al arrancar la Lambda.
// ═══════════════════════════════════════════════════════════════
const PRODUCT_VERSION = (() => {
  try { return require('../../version.json'); }
  catch (e) { return { product: 'SAP-Spektra', version: 'unknown' }; }
})();
const LAMBDA_START = Date.now();

async function healthCheck() {
  return {
    status: 'healthy',
    service: 'SAP Spektra Dashboard API',
    version: PRODUCT_VERSION.version,
    codename: PRODUCT_VERSION.codename || '',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor((Date.now() - LAMBDA_START) / 1000)}s`,
    region: process.env.AWS_REGION || 'us-east-1',
    tables: [METRICS_HISTORY_TABLE, APPROVALS_TABLE, SCHEDULED_OPS_TABLE, RUNBOOK_EXECUTIONS_TABLE],
    features: ['monitoring', 'chatbot', 'scheduler', 'ai-insights', 'anomalies', 'execution-history', 'runbook-analytics', 'sla-metrics', 'admin-panel', 'system-onboarding', 'ha-orchestration'],
    // v1.0 — H35: Indicador de Trial Mode disponible
    trialModeAvailable: true,
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getVersionInfo
//  Retorna informacion completa de la version del producto.
// ═══════════════════════════════════════════════════════════════
function getVersionInfo() {
  return {
    ...PRODUCT_VERSION,
    runtime: process.version,
    region: process.env.AWS_REGION || 'us-east-1',
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'local',
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getHealthStatus
//  v2.0 — Deep health check para /health/spektra
//  Verifica conectividad con DynamoDB, estado de Lambda,
//  y retorna información de salud de la plataforma.
// ═══════════════════════════════════════════════════════════════

async function getHealthStatus(event) {
  const startTime = Date.now();
  const correlationId = getCorrelationId ? getCorrelationId(event) : 'health-check';

  const health = {
    status: 'healthy',
    version: '2.0',
    timestamp: new Date().toISOString(),
    correlationId,
    uptime: process.uptime(),
    components: {}
  };

  // Verificar conectividad con DynamoDB — Query rápido con Limit 1
  try {
    const metricsTable = METRICS_HISTORY_TABLE;
    await ddbDoc.send(new QueryCommand({
      TableName: metricsTable,
      Limit: 1,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'HEALTH_CHECK' }
    }));
    health.components.dynamodb = { status: 'healthy', latencyMs: Date.now() - startTime };
  } catch (err) {
    health.components.dynamodb = { status: 'unhealthy', error: err.message };
    health.status = 'degraded';
  }

  // Información del entorno Lambda
  health.components.lambda = {
    status: 'healthy',
    memoryMb: parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '0'),
    region: process.env.AWS_REGION || 'unknown',
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown'
  };

  // Información de alarmas configuradas
  health.components.alarms = {
    configured: 6,
    note: 'Use CloudWatch console to view alarm states'
  };

  health.responseTimeMs = Date.now() - startTime;

  const statusCode = health.status === 'healthy' ? 200 : 503;
  return respond(statusCode, health);
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H35: ENDPOINT: GET /trial/status
//  Estado del modo trial para el frontend.
//  Retorna configuración, límites y modo de cada sistema.
// ═══════════════════════════════════════════════════════════════

async function getTrialStatus(queryParams) {
  try {
    const systemId = queryParams?.systemId;
    const config = await getSystemsConfig();

    // Si se pidió un sistema específico
    if (systemId) {
      const sysConfig = config.find(s => s.systemId === systemId);
      if (!sysConfig) {
        return { error: `Sistema no encontrado: ${systemId}` };
      }

      try {
        const trialConfig = await getTrialConfig(systemId);
        return {
          systemId,
          mode: trialConfig.mode,
          label: trialConfig.label,
          description: trialConfig.description,
          config: {
            pollingIntervalMinutes: trialConfig.pollingIntervalMinutes,
            aiMaxCallsPerDay: trialConfig.aiMaxCallsPerDay,
            aiModel: trialConfig.aiModel,
            aiMaxTokens: trialConfig.aiMaxTokens,
            runbookExecutionMode: trialConfig.runbookExecutionMode,
            runbookMaxPerDay: trialConfig.runbookMaxPerDay,
            runbookChaining: trialConfig.runbookChaining,
            escalationLevels: trialConfig.escalationLevels,
            drDrillsEnabled: trialConfig.drDrillsEnabled,
            dashboardRefreshSeconds: trialConfig.dashboardRefreshSeconds,
            maxNotificationsPerDay: trialConfig.maxNotificationsPerDay,
            notificationChannels: trialConfig.notificationChannels,
            autoApproveInTrial: trialConfig.autoApproveInTrial,
          },
          limits: {
            aiCallsPerDay: trialConfig.aiMaxCallsPerDay,
            runbooksPerDay: trialConfig.runbookMaxPerDay,
            notificationsPerDay: trialConfig.maxNotificationsPerDay,
            maxSystems: trialConfig.maxSystemsInTrial,
            metricsRetentionDays: trialConfig.metricsRetentionDays,
          },
          estimatedCostUSD: trialConfig.estimatedMonthlyCostUSD,
        };
      } catch (err) {
        return { systemId, mode: 'UNKNOWN', error: err.message };
      }
    }

    // Si no se pidió sistema, retornar estado de todos
    const systemStatuses = [];
    for (const sys of config.filter(s => s.enabled)) {
      try {
        const trialConfig = await getTrialConfig(sys.systemId);
        systemStatuses.push({
          systemId: sys.systemId,
          sid: sys.sid,
          mode: trialConfig.mode,
          label: trialConfig.label,
        });
      } catch (err) {
        systemStatuses.push({
          systemId: sys.systemId,
          sid: sys.sid,
          mode: 'UNKNOWN',
          error: err.message,
        });
      }
    }

    // Resumen global
    const trialCount = systemStatuses.filter(s => s.mode === 'TRIAL').length;
    const prodCount = systemStatuses.filter(s => s.mode === 'PRODUCTION').length;

    return {
      totalSystems: systemStatuses.length,
      trialCount,
      productionCount: prodCount,
      trialConfig: getModeConfig('TRIAL'),
      productionConfig: getModeConfig('PRODUCTION'),
      systems: systemStatuses,
    };
  } catch (err) {
    log.error('Error obteniendo estado trial', { error: err.message });
    return { error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN ENDPOINTS — Gestión de sistemas (v1.0)
// ═══════════════════════════════════════════════════════════════

async function adminRegisterSystem(body) {
  const { systemId, sid, systemType, dbType, osType, environment, description,
          instanceId, awsRegion, snsTopicArn, approverEmail } = body;

  if (!systemId || !sid || !instanceId) {
    return { statusCode: 400, body: { error: 'systemId, sid e instanceId son obligatorios' } };
  }

  // Leer configuración actual
  const systems = await getSystemsConfig();
  if (systems.find(s => s.systemId === systemId)) {
    return { statusCode: 409, body: { error: `Sistema ${systemId} ya existe` } };
  }

  const newSystem = {
    systemId,
    sid: sid.toUpperCase(),
    systemType: systemType || 'ABAP',
    database: { type: dbType || 'SAP_HANA' },
    dbType: dbType || 'SAP_HANA',
    osType: osType || 'LINUX',
    environment: environment || 'DEV',
    description: description || '',
    instanceId,
    awsRegion: awsRegion || process.env.AWS_REGION || 'us-east-1',
    snsTopicArn: snsTopicArn || '',
    approverEmail: approverEmail || '',
    enabled: true,
    active: true,
    createdAt: new Date().toISOString(),
  };

  systems.push(newSystem);

  // Guardar en SSM
  const { SSMClient: SSMCli, PutParameterCommand } = require('@aws-sdk/client-ssm');
  const ssmWrite = new SSMCli({});
  const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
  await ssmWrite.send(new PutParameterCommand({
    Name: paramName,
    Value: JSON.stringify(systems),
    Type: 'String',
    Overwrite: true,
  }));

  // Invalidar caché
  systemsConfigCache = null;
  configCacheTime = 0;

  log.info('Sistema registrado exitosamente', { systemId });
  return { statusCode: 201, body: { message: `Sistema ${systemId} registrado`, system: newSystem } };
}

async function adminUpdateSystem(systemId, body) {
  const systems = await getSystemsConfig();
  const idx = systems.findIndex(s => s.systemId === systemId);
  if (idx === -1) {
    return { statusCode: 404, body: { error: `Sistema ${systemId} no encontrado` } };
  }

  // Merge campos actualizables
  const updatable = ['sid', 'systemType', 'dbType', 'osType', 'environment', 'description',
                     'instanceId', 'awsRegion', 'snsTopicArn', 'approverEmail', 'enabled', 'active'];
  for (const key of updatable) {
    if (body[key] !== undefined) {
      systems[idx][key] = body[key];
      if (key === 'dbType') systems[idx].database = { type: body[key] };
    }
  }
  systems[idx].updatedAt = new Date().toISOString();

  // Guardar en SSM
  const { SSMClient: SSMCli, PutParameterCommand } = require('@aws-sdk/client-ssm');
  const ssmWrite = new SSMCli({});
  const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
  await ssmWrite.send(new PutParameterCommand({
    Name: paramName,
    Value: JSON.stringify(systems),
    Type: 'String',
    Overwrite: true,
  }));

  systemsConfigCache = null;
  configCacheTime = 0;

  log.info('Sistema actualizado', { systemId });
  return { statusCode: 200, body: { message: `Sistema ${systemId} actualizado`, system: systems[idx] } };
}

async function adminDeleteSystem(systemId) {
  const systems = await getSystemsConfig();
  const idx = systems.findIndex(s => s.systemId === systemId);
  if (idx === -1) {
    return { statusCode: 404, body: { error: `Sistema ${systemId} no encontrado` } };
  }

  const removed = systems.splice(idx, 1)[0];

  // Guardar en SSM
  const { SSMClient: SSMCli, PutParameterCommand } = require('@aws-sdk/client-ssm');
  const ssmWrite = new SSMCli({});
  const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
  await ssmWrite.send(new PutParameterCommand({
    Name: paramName,
    Value: JSON.stringify(systems),
    Type: 'String',
    Overwrite: true,
  }));

  systemsConfigCache = null;
  configCacheTime = 0;

  log.info('Sistema eliminado', { systemId });
  return { statusCode: 200, body: { message: `Sistema ${systemId} eliminado`, system: removed } };
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — Proxy generico para invocar otras Lambdas
// ═══════════════════════════════════════════════════════════════

async function proxyLambdaCall(envVarName, payload) {
  const functionArn = process.env[envVarName] || '';
  if (!functionArn) {
    return { message: `${envVarName} no configurado`, data: [] };
  }

  try {
    const { LambdaClient: LC, InvokeCommand: IC } = require('@aws-sdk/client-lambda');
    const client = new LC({ region: process.env.AWS_REGION || 'us-east-1' });

    const result = await client.send(new IC({
      FunctionName: functionArn,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    }));

    const response = JSON.parse(Buffer.from(result.Payload).toString());
    if (response.statusCode && response.body) {
      return typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    }
    return response;
  } catch (err) {
    log.error('Error invocando Lambda', { envVarName, error: err.message, stack: err.stack });
    return { error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H37: Approve/Reject desde Dashboard
//  Proxy al approval-gateway Lambda para aprobar o rechazar
// ═══════════════════════════════════════════════════════════════

async function proxyApprovalAction(approvalId, action, queryParams) {
  const approvalFunctionArn = process.env.APPROVAL_FUNCTION_ARN || '';

  if (!approvalFunctionArn) {
    return { statusCode: 501, body: { error: 'APPROVAL_FUNCTION_ARN no configurado' } };
  }

  const token = queryParams.token;
  if (!token) {
    return { statusCode: 400, body: { error: 'Token de aprobacion requerido (query param: token)' } };
  }

  try {
    // Invocar el approval-gateway Lambda directamente
    const { LambdaClient: LambdaCli, InvokeCommand: InvokeCmd } = require('@aws-sdk/client-lambda');
    const lambdaClient = new LambdaCli({ region: process.env.AWS_REGION || 'us-east-1' });

    const payload = {
      httpMethod: 'GET',
      path: `/${action}`,
      queryStringParameters: {
        id: approvalId,
        token: token,
        action: action,
      },
    };

    const result = await lambdaClient.send(new InvokeCmd({
      FunctionName: approvalFunctionArn,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    }));

    const responsePayload = JSON.parse(Buffer.from(result.Payload).toString());
    const body = typeof responsePayload.body === 'string'
      ? JSON.parse(responsePayload.body)
      : responsePayload.body;

    return {
      statusCode: responsePayload.statusCode || 200,
      body: body || { message: `Accion ${action} ejecutada para aprobacion ${approvalId}` },
    };
  } catch (err) {
    log.error('Error en proxy approval', { action, error: err.message, stack: err.stack });
    return { statusCode: 500, body: { error: `Error procesando ${action}: ${err.message}` } };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: proxyToApprovalGateway
//  Proxy genérico al approval-gateway Lambda para delegaciones
//  y otras operaciones que requieren el approval-gateway.
// ═══════════════════════════════════════════════════════════════

async function proxyToApprovalGateway(httpMethod, path, body, queryParams) {
  const approvalFunctionArn = process.env.APPROVAL_FUNCTION_ARN || '';
  if (!approvalFunctionArn) {
    return { statusCode: 501, body: { error: 'APPROVAL_FUNCTION_ARN no configurado' } };
  }

  try {
    const result = await lambda.send(new InvokeCommand({
      FunctionName: approvalFunctionArn,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        httpMethod,
        path,
        body: body ? JSON.stringify(body) : null,
        queryStringParameters: queryParams || {},
        pathParameters: {},
      }),
    }));

    const responsePayload = JSON.parse(Buffer.from(result.Payload).toString());
    const responseBody = typeof responsePayload.body === 'string'
      ? JSON.parse(responsePayload.body)
      : responsePayload.body;

    return {
      statusCode: responsePayload.statusCode || 200,
      body: responseBody || {},
    };
  } catch (err) {
    log.error('Error en proxy a approval-gateway', { error: err.message, stack: err.stack });
    return { statusCode: 500, body: { error: `Error en proxy: ${err.message}` } };
  }
}

// ═══════════════════════════════════════════════════════════════
//  DISCOVERY ENGINE — Funciones de consulta y invocacion
// ═══════════════════════════════════════════════════════════════

const DISCOVERED_INSTANCES_TABLE = process.env.DISCOVERED_INSTANCES_TABLE || 'sap-alwaysops-discovered-instances';
const LANDSCAPE_TOPOLOGY_TABLE = process.env.LANDSCAPE_TOPOLOGY_TABLE || 'sap-alwaysops-landscape-topology';
const DISCOVERY_ENGINE_FUNCTION = process.env.DISCOVERY_ENGINE_FUNCTION || 'sap-alwaysops-discovery-engine';

async function getLandscapeTopology() {
  // v1.5 — Query via GSI 'entityType-index' (PK: entityType = 'TOPOLOGY_ENTRY') en lugar de Scan.
  // Todas las entradas de topología se escriben con entityType='TOPOLOGY_ENTRY'.
  const result = await ddbDoc.send(new QueryCommand({
    TableName: LANDSCAPE_TOPOLOGY_TABLE,
    IndexName: 'entityType-index',
    KeyConditionExpression: 'entityType = :etype',
    ExpressionAttributeValues: { ':etype': 'TOPOLOGY_ENTRY' },
  }));

  // Agrupar por SID
  const landscapes = {};
  for (const item of (result.Items || [])) {
    const sid = item.sid || item.pk?.replace('LANDSCAPE#', '');
    if (!landscapes[sid]) {
      landscapes[sid] = { sid, instances: [] };
    }
    landscapes[sid].instances.push(item);
  }

  return Object.values(landscapes);
}

async function getInstanceDiscovery(instanceId) {
  const result = await ddbDoc.send(new QueryCommand({
    TableName: DISCOVERED_INSTANCES_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': `INSTANCE#${instanceId}`,
    },
    ScanIndexForward: false,
    Limit: 10,
  }));

  const items = result.Items || [];
  const latest = items.find(i => i.sk === 'LATEST') || null;
  const history = items.filter(i => i.sk?.startsWith('HISTORY#'));

  return { latest, history };
}

async function invokeDiscoveryEngine(instanceIds) {
  try {
    const result = await lambda.send(new InvokeCommand({
      FunctionName: DISCOVERY_ENGINE_FUNCTION,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ instanceIds }),
    }));

    const responsePayload = JSON.parse(Buffer.from(result.Payload).toString());
    const body = typeof responsePayload.body === 'string'
      ? JSON.parse(responsePayload.body)
      : responsePayload.body || responsePayload;

    return { success: true, ...body };
  } catch (err) {
    log.error('Error invocando discovery-engine', { error: err.message });
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Router HTTP que dirige cada request al endpoint correcto.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Dashboard API invocado');
  const startTime = Date.now();

  try {
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
    let path = event.path || event.rawPath || '/';
    const queryParams = event.queryStringParameters || {};
    const pathParams = event.pathParameters || {};

    // Strip /api prefix (API Gateway routes use /api/*)
    path = path.replace(/^\/api/, '') || '/';

    log.info(`${method} ${path}`);

    // ─── CORS preflight (backward compat for invocaciones directas) ───
    if (method === 'OPTIONS') {
      return respond(200, { message: 'OK' });
    }

    // ─── RBAC: Verificar permisos basados en grupos Cognito ───
    const jwtClaims = event.requestContext?.authorizer?.jwt?.claims;
    if (jwtClaims) {
      const cognitoGroups = jwtClaims['cognito:groups'] || '';
      const userGroups = typeof cognitoGroups === 'string'
        ? (cognitoGroups.startsWith('[')
          ? JSON.parse(cognitoGroups.replace(/'/g, '"'))
          : cognitoGroups.split(',').map(s => s.trim()).filter(Boolean))
        : (Array.isArray(cognitoGroups) ? cognitoGroups : []);
      const isAdmin = userGroups.includes('admins');
      const isOperator = userGroups.includes('operators');

      // Admin routes: solo grupo admins
      if (path.startsWith('/admin/') && !isAdmin) {
        return respond(403, { error: 'Acceso denegado: se requiere rol de administrador' });
      }

      // Operaciones de escritura: admins u operators
      if (['POST', 'PUT', 'DELETE'].includes(method) && !path.startsWith('/admin/') && !isAdmin && !isOperator) {
        return respond(403, { error: 'Acceso denegado: se requiere rol de administrador u operador' });
      }
    }

    // ─── Router ───
    // GET /health/spektra — Platform deep health check (unauthenticated)
    if (method === 'GET' && path === '/health/spektra') {
      return await getHealthStatus(event);
    }

    // GET /health
    if (method === 'GET' && path === '/health') {
      return respond(200, await healthCheck());
    }

    // GET /version — Informacion completa de version del producto
    if (method === 'GET' && (path === '/version' || path === '/version/')) {
      return respond(200, getVersionInfo());
    }

    // GET /systems
    if (method === 'GET' && (path === '/systems' || path === '/systems/')) {
      return respond(200, await listSystems());
    }

    // GET /systems/{id}/metrics
    if (method === 'GET' && path.match(/^\/systems\/[^/]+\/metrics\/?$/)) {
      const systemId = pathParams.id || path.split('/')[2];
      return respond(200, await getSystemMetrics(systemId, queryParams));
    }

    // GET /systems/{id}/breaches
    if (method === 'GET' && path.match(/^\/systems\/[^/]+\/breaches\/?$/)) {
      const systemId = pathParams.id || path.split('/')[2];
      return respond(200, await getSystemBreaches(systemId, queryParams, event));
    }

    // GET /approvals
    if (method === 'GET' && (path === '/approvals' || path === '/approvals/')) {
      return respond(200, await listApprovals(queryParams, event));
    }

    // GET /approvals/{id}
    if (method === 'GET' && path.match(/^\/approvals\/[^/]+\/?$/)) {
      const approvalId = pathParams.id || path.split('/')[2];
      return respond(200, await getApproval(approvalId));
    }

    // POST /chat — Chatbot IA
    if (method === 'POST' && (path === '/chat' || path === '/chat/')) {
      const body = safeParse(event.body);
      if (!body) return respond(400, { error: 'Cuerpo de request invalido o JSON malformado' });
      return respond(200, await chatProxy(body));
    }

    // GET /operations — Operaciones programadas
    if (method === 'GET' && (path === '/operations' || path === '/operations/')) {
      return respond(200, await listOperations(queryParams, event));
    }

    // GET /ai-insights — Insights de IA
    if (method === 'GET' && (path === '/ai-insights' || path === '/ai-insights/')) {
      return respond(200, await getAIInsights(queryParams));
    }

    // v1.8 — GET /systems/{id}/anomalies — Anomalías y baselines
    if (method === 'GET' && path.match(/^\/systems\/[^/]+\/anomalies\/?$/)) {
      const systemId = pathParams.id || path.split('/')[2];
      return respond(200, await getSystemAnomalies(systemId));
    }

    // v1.8 — GET /executions — Historial de ejecuciones
    if (method === 'GET' && (path === '/executions' || path === '/executions/')) {
      return respond(200, await getExecutionHistory(queryParams, event));
    }

    // GET /systems/{id}/sla — Métricas de SLA y disponibilidad
    if (method === 'GET' && path.match(/^\/systems\/[^/]+\/sla\/?$/)) {
      const systemId = pathParams.id || path.split('/')[2];
      return respond(200, await getSystemSLA(systemId, queryParams));
    }

    // GET /analytics/runbooks — Métricas de rendimiento de runbooks
    if (method === 'GET' && path.startsWith('/analytics/runbooks')) {
      const result = await getRunbookAnalytics(event.queryStringParameters);
      return respond(result.statusCode, result.body);
    }

    // v1.0 — H35: GET /trial/status — Estado del modo trial para el frontend
    if (method === 'GET' && (path === '/trial/status' || path === '/trial/status/')) {
      return respond(200, await getTrialStatus(queryParams));
    }

    // v1.0 — H38: GET /alert-rules — Listar reglas de alerta
    if (method === 'GET' && (path === '/alert-rules' || path === '/alert-rules/')) {
      return respond(200, await proxyLambdaCall('ALERT_RULES_ENGINE_ARN', { action: 'listRules', systemId: queryParams.systemId }));
    }

    // v1.0 — H38: POST /alert-rules — Crear regla de alerta
    if (method === 'POST' && (path === '/alert-rules' || path === '/alert-rules/')) {
      const body = safeParse(event.body);
      if (!body) return respond(400, { error: 'Cuerpo de request invalido o JSON malformado' });
      return respond(200, await proxyLambdaCall('ALERT_RULES_ENGINE_ARN', { action: 'createRule', rule: body }));
    }

    // v1.0 — H38: PUT /alert-rules/{id} — Actualizar regla
    if (method === 'PUT' && path.match(/^\/alert-rules\/[^/]+\/?$/)) {
      const ruleId = path.split('/')[2];
      const body = safeParse(event.body);
      if (!body) return respond(400, { error: 'Cuerpo de request invalido o JSON malformado' });
      return respond(200, await proxyLambdaCall('ALERT_RULES_ENGINE_ARN', { action: 'updateRule', ruleId, rule: body }));
    }

    // v1.0 — H38: DELETE /alert-rules/{id} — Eliminar regla
    if (method === 'DELETE' && path.match(/^\/alert-rules\/[^/]+\/?$/)) {
      const ruleId = path.split('/')[2];
      return respond(200, await proxyLambdaCall('ALERT_RULES_ENGINE_ARN', { action: 'deleteRule', ruleId }));
    }

    // v1.4 — POST /alerts/{id}/ack — Tomar alerta en gestion (idempotente)
    if (method === 'POST' && path.match(/^\/alerts\/[^/]+\/ack\/?$/)) {
      const alertId = pathParams.id || path.split('/')[2];
      const body = safeParse(event.body) || {};
      return respond(200, await proxyLambdaCall('ALERT_RULES_ENGINE_ARN', {
        action: 'ackAlert',
        alertId,
        ackBy: body.ackBy || user?.email || 'unknown',
        ackAt: new Date().toISOString(),
      }));
    }

    // v1.4 — POST /alerts/{id}/resolve — Resolver alerta con evidencia
    if (method === 'POST' && path.match(/^\/alerts\/[^/]+\/resolve\/?$/)) {
      const alertId = pathParams.id || path.split('/')[2];
      const body = safeParse(event.body) || {};
      if (!body.resolutionNote || !body.resolutionCategory) {
        return respond(400, { error: 'resolutionNote y resolutionCategory son obligatorios' });
      }
      const validCategories = ['false_positive', 'mitigated', 'accepted_risk', 'fixed', 'workaround_applied'];
      if (!validCategories.includes(body.resolutionCategory)) {
        return respond(400, { error: 'resolutionCategory invalida. Validas: ' + validCategories.join(', ') });
      }
      return respond(200, await proxyLambdaCall('ALERT_RULES_ENGINE_ARN', {
        action: 'resolveAlert',
        alertId,
        resolvedBy: body.resolvedBy || user?.email || 'unknown',
        resolvedAt: new Date().toISOString(),
        resolutionNote: body.resolutionNote,
        resolutionCategory: body.resolutionCategory,
      }));
    }

    // v1.0 — H40: GET /benchmarks — Benchmarks globales o por sistema
    if (method === 'GET' && (path === '/benchmarks' || path === '/benchmarks/')) {
      return respond(200, await proxyLambdaCall('BENCHMARK_ENGINE_ARN', { action: 'getBenchmarks', systemId: queryParams.systemId, window: queryParams.window }));
    }

    // v1.0 — H40: GET /benchmarks/comparison — Comparacion entre sistemas
    if (method === 'GET' && path.startsWith('/benchmarks/comparison')) {
      return respond(200, await proxyLambdaCall('BENCHMARK_ENGINE_ARN', { action: 'getComparison', metricName: queryParams.metric }));
    }

    // v1.0 — H39: GET /compliance — Reporte de compliance
    if (method === 'GET' && (path === '/compliance' || path === '/compliance/')) {
      return respond(200, await proxyLambdaCall('AUDIT_REPORTER_ARN', { action: 'complianceReport', systemId: queryParams.systemId, framework: queryParams.framework }));
    }

    // v1.0 — POST /admin/systems — Registrar nuevo sistema
    if (method === 'POST' && (path === '/admin/systems' || path === '/admin/systems/')) {
      const body = safeParse(event.body);
      if (!body) return respond(400, { error: 'Cuerpo de request invalido o JSON malformado' });
      const result = await adminRegisterSystem(body);
      return respond(result.statusCode, result.body);
    }

    // v1.0 — PUT /admin/systems/{id} — Actualizar sistema
    if (method === 'PUT' && path.match(/^\/admin\/systems\/[^/]+\/?$/)) {
      const systemId = pathParams.id || path.split('/')[3];
      const body = safeParse(event.body);
      if (!body) return respond(400, { error: 'Cuerpo de request invalido o JSON malformado' });
      const result = await adminUpdateSystem(systemId, body);
      return respond(result.statusCode, result.body);
    }

    // v1.0 — DELETE /admin/systems/{id} — Eliminar sistema
    if (method === 'DELETE' && path.match(/^\/admin\/systems\/[^/]+\/?$/)) {
      const systemId = pathParams.id || path.split('/')[3];
      const result = await adminDeleteSystem(systemId);
      return respond(result.statusCode, result.body);
    }

    // v1.0 — H37: POST /approvals/{id}/approve — Aprobar desde dashboard
    if (method === 'POST' && path.match(/^\/approvals\/[^/]+\/approve\/?$/)) {
      const approvalId = pathParams.id || path.split('/')[2];
      const result = await proxyApprovalAction(approvalId, 'approve', queryParams);
      return respond(result.statusCode, result.body);
    }

    // v1.0 — H37: POST /approvals/{id}/reject — Rechazar desde dashboard
    if (method === 'POST' && path.match(/^\/approvals\/[^/]+\/reject\/?$/)) {
      const approvalId = pathParams.id || path.split('/')[2];
      const result = await proxyApprovalAction(approvalId, 'reject', queryParams);
      return respond(result.statusCode, result.body);
    }

    // ─── Discovery Engine — Landscape y detalle de instancias ───

    // GET /landscape — Topologia de landscape SAP agrupada por SID
    if (method === 'GET' && (path === '/landscape' || path === '/landscape/')) {
      const landscapes = await getLandscapeTopology();
      return respond(200, { success: true, landscapes });
    }

    // GET /instances/{id}/discovery — Detalle de descubrimiento de una instancia
    if (method === 'GET' && path.match(/^\/instances\/[^/]+\/discovery\/?$/)) {
      const instanceId = pathParams.id || path.split('/')[2];
      const discovery = await getInstanceDiscovery(instanceId);
      return respond(200, { success: true, discovery });
    }

    // POST /discovery/run — Ejecutar descubrimiento profundo (invoca discovery-engine Lambda)
    if (method === 'POST' && (path === '/discovery/run' || path === '/discovery/run/')) {
      const body = safeParse(event.body);
      if (!body) return respond(400, { error: 'Cuerpo de request invalido o JSON malformado' });
      const instanceIds = body?.instanceIds || [];
      if (instanceIds.length === 0) {
        return respond(400, { error: 'instanceIds requerido (array)' });
      }
      const result = await invokeDiscoveryEngine(instanceIds);
      return respond(200, result);
    }

    // ─── Delegaciones (proxy a approval-gateway) ───

    // POST /delegations — Crear delegacion
    if (method === 'POST' && (path === '/delegations' || path === '/delegations/')) {
      const body = safeParse(event.body);
      if (!body) return respond(400, { error: 'Cuerpo de request invalido o JSON malformado' });
      const result = await proxyToApprovalGateway('POST', '/delegations', body);
      return respond(result.statusCode, result.body);
    }

    // GET /delegations?email=X — Listar delegaciones
    if (method === 'GET' && (path === '/delegations' || path === '/delegations/')) {
      const result = await proxyToApprovalGateway('GET', '/delegations', null, queryParams);
      return respond(result.statusCode, result.body);
    }

    // DELETE /delegations/{email}/{id} — Revocar delegacion
    if (method === 'DELETE' && path.match(/^\/delegations\/.+\/.+/)) {
      const result = await proxyToApprovalGateway('DELETE', path);
      return respond(result.statusCode, result.body);
    }

    // ─── Ruta no encontrada ───
    const duration = Date.now() - startTime;
    return respond(404, {
      error: 'Ruta no encontrada',
      path,
      method,
      availableRoutes: [
        'GET /health',
        'GET /version',
        'GET /systems',
        'GET /systems/{id}/metrics?hours=2',
        'GET /systems/{id}/breaches?limit=50',
        'GET /approvals?status=PENDING',
        'GET /approvals/{id}',
        'POST /chat',
        'GET /operations?status=SCHEDULED',
        'GET /ai-insights?systemId=SAP-PRD-01',
        'GET /systems/{id}/anomalies',
        'GET /executions?systemId=SAP-PRD-01&limit=50&status=success',
        'GET /systems/{id}/sla?days=30',
        'GET /analytics/runbooks?systemId=X&days=30',
        'GET /trial/status?systemId=SAP-PRD-01',
        'POST /admin/systems',
        'PUT /admin/systems/{id}',
        'DELETE /admin/systems/{id}',
        'POST /approvals/{id}/approve?token=X',
        'POST /approvals/{id}/reject?token=X',
        'GET /alert-rules?systemId=X',
        'POST /alert-rules',
        'PUT /alert-rules/{id}',
        'DELETE /alert-rules/{id}',
        'POST /alerts/{id}/ack',
        'POST /alerts/{id}/resolve',
        'GET /benchmarks?systemId=X&window=30d',
        'GET /benchmarks/comparison?metric=X',
        'GET /compliance?systemId=X&framework=SOX|GxP|ISO27001',
        'GET /landscape',
        'GET /instances/{id}/discovery',
        'POST /discovery/run',
        'POST /delegations',
        'GET /delegations?email=X',
        'DELETE /delegations/{email}/{delegationId}',
      ],
      duration: `${duration}ms`,
    });

  } catch (err) {
    log.error('Error fatal en Dashboard API', { error: err.message, stack: err.stack });
    return respond(500, { error: err.message });
  }
};
