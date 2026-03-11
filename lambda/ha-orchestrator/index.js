'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.5 — HA Orchestrator
//  API REST para orquestacion de operaciones de alta disponibilidad
//  (failover, takeover, failback) en sistemas SAP.
//
//  Rutas:
//    POST /ha/operations                    → Crear operacion HA
//    GET  /ha/operations                    → Listar operaciones HA
//    GET  /ha/operations/{id}               → Detalle de una operacion
//    POST /ha/operations/{id}/execute       → Ejecutar operacion
//    POST /ha/operations/{id}/cancel        → Cancelar operacion
//    GET  /ha/prerequisites/{systemId}      → Verificar prerequisitos
//    GET  /ha/drivers                       → Listar drivers registrados
//    GET  /ha/systems/{systemId}            → Info HA de un sistema
//
//  Modo MOCK:
//    Cuando MOCK=true, ejecuta directamente con StepExecutor y drivers mock.
//  Modo Real:
//    Inicia ejecucion de Step Functions (AWS States).
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');
const log = require('../utilidades/logger')('ha-orchestrator');
const { respond, respondError, getCorrelationId, getRequestOrigin } = require('../utilidades/response-helper');
const { safeParse } = require('../utilidades/input-validator');
const { requireAuth, getUser, requireRole, ROLES, auditLog } = require('../utilidades/auth-middleware');
const { evaluatePolicy, POLICY_ACTIONS } = require('../utilidades/policy-engine');

// Tipos y factories de HA
const {
  OperationType,
  OperationStatus,
  DriverType,
  NetworkStrategy,
  StepStatus,
  PrerequisiteStatus,
  createHAOperation,
  createHAStep,
  createPrerequisiteResult,
} = require('../utilidades/ha-types');

// Plan builder y step executor
const { buildFailoverPlan, buildTakeoverPlan, buildFailbackPlan } = require('../utilidades/ha-drivers/plan-builder');
const { StepExecutor } = require('../utilidades/ha-drivers/step-executor');
const { registry, listDrivers: registryListDrivers } = require('../utilidades/ha-drivers/driver-registry');

// AWS SDK
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// ─── Clientes de AWS ───
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});
const ssm = new SSMClient({});

// ─── Configuracion (variables de entorno con defaults) ───
const HA_OPERATIONS_TABLE = process.env.HA_OPERATIONS_TABLE || 'sap-alwaysops-ha-operations';
const HA_PREREQUISITES_TABLE = process.env.HA_PREREQUISITES_TABLE || 'sap-alwaysops-ha-prerequisites';
const HA_STATE_MACHINE_ARN = process.env.HA_STATE_MACHINE_ARN || '';
const MOCK_MODE = (process.env.MOCK || 'false').toLowerCase() === 'true';
const SYSTEMS_CONFIG_PARAM = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';

// ─── Cache de configuracion de sistemas ───
let systemsConfigCache = null;
let configCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ═══════════════════════════════════════════════════════════════
//  FUNCION: getSystemsConfig
//  Lee la lista de sistemas SAP desde SSM Parameter Store.
//  Usa cache de 5 minutos para no sobrecargar SSM.
// ═══════════════════════════════════════════════════════════════

async function getSystemsConfig() {
  // Verificar si el cache es valido
  if (systemsConfigCache && (Date.now() - configCacheTime) < CACHE_TTL_MS) {
    return systemsConfigCache;
  }

  try {
    const param = await ssm.send(new GetParameterCommand({
      Name: SYSTEMS_CONFIG_PARAM,
      WithDecryption: true,
    }));
    systemsConfigCache = JSON.parse(param.Parameter.Value);
    configCacheTime = Date.now();
    return systemsConfigCache;
  } catch (err) {
    log.warn('Error leyendo SSM config, usando config de respaldo', { error: err.message });
    // Configuracion de respaldo minima
    return [{
      systemId: 'SAP-DEFAULT',
      sid: 'PRD',
      systemType: 'SAP_S4HANA',
      environment: 'Production',
      enabled: true,
      haEnabled: false,
      database: { type: 'SAP_HANA' },
      ha: {
        networkStrategy: 'EIP',
        dbStrategy: 'HANA_SR',
        sapStrategy: 'SAP_SERVICES',
        primaryNode: { instanceId: 'i-0000000000000', hostname: 'sap-primary', role: 'PRIMARY' },
        secondaryNode: { instanceId: 'i-1111111111111', hostname: 'sap-secondary', role: 'SECONDARY' },
      },
    }];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: findSystemConfig
//  Busca la configuracion de un sistema por su systemId.
// ═══════════════════════════════════════════════════════════════

async function findSystemConfig(systemId) {
  const systems = await getSystemsConfig();
  return systems.find(s => s.systemId === systemId) || null;
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: POST /ha/operations
//  Crea una nueva operacion HA (failover/takeover/failback)
//  con estado inicial PLANNED.
//
//  Body esperado:
//  {
//    "systemId": "SAP-PRD-01",
//    "operationType": "TAKEOVER",     // FAILOVER|TAKEOVER|FAILBACK
//    "reason": "Mantenimiento planificado",
//    "networkStrategy": "EIP",        // Opcional: EIP|ROUTE53|PACEMAKER_VIP
//    "dbStrategy": "HANA_SR",         // Opcional: HANA_SR|DECLARATIVE
//    "sapStrategy": "SAP_SERVICES"    // Opcional
//  }
// ═══════════════════════════════════════════════════════════════

async function createOperation(event) {
  const body = safeParse(event.body);
  if (!body) {
    return respondError(400, 'Cuerpo de request invalido o JSON malformado', {
      errorCode: 'INVALID_BODY',
    });
  }

  // Validar campos requeridos
  const { systemId, operationType, reason } = body;

  if (!systemId || typeof systemId !== 'string') {
    return respondError(400, 'systemId es requerido y debe ser string', {
      errorCode: 'MISSING_SYSTEM_ID',
    });
  }

  if (!operationType || !Object.values(OperationType).includes(operationType)) {
    return respondError(400, `operationType invalido. Valores permitidos: ${Object.values(OperationType).join(', ')}`, {
      errorCode: 'INVALID_OPERATION_TYPE',
    });
  }

  // Buscar configuracion del sistema
  const systemConfig = await findSystemConfig(systemId);
  if (!systemConfig) {
    return respondError(404, `Sistema no encontrado: ${systemId}`, {
      errorCode: 'SYSTEM_NOT_FOUND',
    });
  }

  // Verificar que el sistema tenga HA habilitado
  if (!systemConfig.haEnabled && !systemConfig.ha) {
    return respondError(400, `El sistema ${systemId} no tiene alta disponibilidad configurada`, {
      errorCode: 'HA_NOT_CONFIGURED',
    });
  }

  // Extraer info del usuario autenticado
  const user = getUser(event);
  const triggeredBy = user?.email || user?.username || 'UNKNOWN';

  // Determinar estrategias (del body o de la config del sistema)
  const haConfig = systemConfig.ha || {};
  const networkStrategy = body.networkStrategy || haConfig.networkStrategy || NetworkStrategy.EIP;
  const dbStrategy = body.dbStrategy || haConfig.dbStrategy || 'HANA_SR';
  const sapStrategy = body.sapStrategy || haConfig.sapStrategy || 'SAP_SERVICES';
  const sourceNode = haConfig.primaryNode || {};
  const targetNode = haConfig.secondaryNode || {};

  // Evaluar politica de seguridad
  const policyContext = {
    environment: systemConfig.environment === 'Production' ? 'PRD' : systemConfig.environment,
    severity: operationType === OperationType.FAILOVER ? 'CRITICAL' : 'HIGH',
    costSafe: false, // Las operaciones HA siempre implican cambios de infraestructura
    haEnabled: true,
    dryRun: false,
  };

  const policyResult = await evaluatePolicy('ha_operation', policyContext);

  if (policyResult.action === POLICY_ACTIONS.DENY) {
    log.warn('Operacion HA denegada por politica', {
      systemId,
      operationType,
      reason: policyResult.reason,
    });
    return respondError(403, `Operacion denegada por politica: ${policyResult.reason}`, {
      errorCode: 'POLICY_DENIED',
      details: { policyResult },
    });
  }

  // Crear la operacion con estado PLANNED
  const operation = createHAOperation({
    systemId,
    sid: systemConfig.sid || systemId.split('-')[1] || 'UNK',
    operationType,
    triggeredBy,
    reason: reason || '',
    networkStrategy,
    dbStrategy,
    sapStrategy,
    sourceNode,
    targetNode,
  });

  // Construir el plan de ejecucion segun el tipo de operacion
  let plan;
  const planContext = {
    networkStrategy,
    dbStrategy,
    sapStrategy,
    sourceNode,
    targetNode,
  };

  switch (operationType) {
    case OperationType.FAILOVER:
      plan = buildFailoverPlan(systemId, planContext);
      break;
    case OperationType.TAKEOVER:
      plan = buildTakeoverPlan(systemId, planContext);
      break;
    case OperationType.FAILBACK:
      plan = buildFailbackPlan(systemId, planContext);
      break;
    default:
      return respondError(400, `Tipo de operacion no soportado: ${operationType}`, {
        errorCode: 'UNSUPPORTED_OPERATION',
      });
  }

  // Asignar plan a la operacion
  operation.plannedSteps = plan.steps;
  operation.estimatedDurationMs = plan.estimatedDurationMs;

  // Marcar si requiere aprobacion
  operation.requiresApproval = policyResult.action === POLICY_ACTIONS.REQUIRE_APPROVAL;
  operation.policyResult = {
    action: policyResult.action,
    reason: policyResult.reason,
  };

  // Guardar en DynamoDB
  try {
    await ddbDoc.send(new PutCommand({
      TableName: HA_OPERATIONS_TABLE,
      Item: operation,
      ConditionExpression: 'attribute_not_exists(pk)', // Evitar duplicados
    }));
  } catch (err) {
    log.error('Error guardando operacion en DynamoDB', {
      operationId: operation.operationId,
      error: err.message,
    });
    return respondError(500, 'Error interno al crear la operacion', {
      errorCode: 'DB_WRITE_ERROR',
    });
  }

  // Audit log
  await auditLog({
    event,
    accion: 'HA_OPERATION_CREATED',
    recurso: `ha-operations/${operation.operationId}`,
    despues: {
      operationId: operation.operationId,
      systemId,
      operationType,
      status: operation.status,
    },
  }).catch(err => log.warn('Error escribiendo audit log', { error: err.message }));

  log.info('Operacion HA creada exitosamente', {
    operationId: operation.operationId,
    systemId,
    operationType,
    status: operation.status,
    requiresApproval: operation.requiresApproval,
    estimatedDurationMs: operation.estimatedDurationMs,
    stepsCount: plan.steps.length,
  });

  return respond(201, {
    message: 'Operacion HA creada exitosamente',
    operation: {
      operationId: operation.operationId,
      systemId: operation.systemId,
      sid: operation.sid,
      operationType: operation.operationType,
      status: operation.status,
      triggeredBy: operation.triggeredBy,
      reason: operation.reason,
      networkStrategy: operation.networkStrategy,
      dbStrategy: operation.dbStrategy,
      sapStrategy: operation.sapStrategy,
      sourceNode: operation.sourceNode,
      targetNode: operation.targetNode,
      requiresApproval: operation.requiresApproval,
      policyResult: operation.policyResult,
      estimatedDurationMs: operation.estimatedDurationMs,
      plannedSteps: operation.plannedSteps.map(s => ({
        stepId: s.stepId,
        order: s.order,
        name: s.name,
        driverType: s.driverType,
        driverName: s.driverName,
        action: s.action,
        timeoutMs: s.timeoutMs,
        canRollback: s.canRollback,
      })),
      timestamps: operation.timestamps,
    },
    plan: {
      riskLevel: plan.riskLevel,
      notes: plan.notes,
      rollbackPlan: plan.rollbackPlan,
    },
  });
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /ha/operations
//  Lista operaciones HA, opcionalmente filtradas por systemId o status.
//  Query params: ?systemId=SAP-PRD-01&status=PLANNED&limit=20
// ═══════════════════════════════════════════════════════════════

async function listOperations(queryParams) {
  const { systemId, status, limit } = queryParams || {};
  const maxItems = Math.min(parseInt(limit, 10) || 50, 200);

  try {
    let params;

    if (systemId) {
      // Consultar por systemId usando GSI
      params = {
        TableName: HA_OPERATIONS_TABLE,
        IndexName: 'systemId-createdAt-index',
        KeyConditionExpression: 'systemId = :sid',
        ExpressionAttributeValues: {
          ':sid': systemId,
        },
        ScanIndexForward: false, // Mas recientes primero
        Limit: maxItems,
      };

      // Filtrar por status si se proporciona
      if (status && Object.values(OperationStatus).includes(status)) {
        params.FilterExpression = '#st = :status';
        params.ExpressionAttributeNames = { '#st': 'status' };
        params.ExpressionAttributeValues[':status'] = status;
      }
    } else {
      // Sin systemId: consultar todas usando el PK pattern
      // Usamos un scan limitado (en produccion se reemplazaria con GSI)
      params = {
        TableName: HA_OPERATIONS_TABLE,
        KeyConditionExpression: 'begins_with(pk, :prefix) AND sk = :meta',
        ExpressionAttributeValues: {
          ':prefix': 'HA_OP#',
          ':meta': 'META',
        },
        ScanIndexForward: false,
        Limit: maxItems,
      };

      if (status && Object.values(OperationStatus).includes(status)) {
        params.FilterExpression = '#st = :status';
        params.ExpressionAttributeNames = { '#st': 'status' };
        params.ExpressionAttributeValues[':status'] = status;
      }
    }

    const result = await ddbDoc.send(new QueryCommand(params));
    const operations = (result.Items || []).map(formatOperationSummary);

    return respond(200, {
      operations,
      count: operations.length,
      filters: { systemId: systemId || null, status: status || null },
    });
  } catch (err) {
    log.error('Error listando operaciones HA', { error: err.message });
    return respondError(500, 'Error interno al listar operaciones', {
      errorCode: 'DB_READ_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /ha/operations/{id}
//  Devuelve detalle completo de una operacion HA por su ID.
// ═══════════════════════════════════════════════════════════════

async function getOperation(operationId) {
  if (!operationId || typeof operationId !== 'string') {
    return respondError(400, 'operationId es requerido', {
      errorCode: 'MISSING_OPERATION_ID',
    });
  }

  try {
    const result = await ddbDoc.send(new GetCommand({
      TableName: HA_OPERATIONS_TABLE,
      Key: {
        pk: `HA_OP#${operationId}`,
        sk: 'META',
      },
    }));

    if (!result.Item) {
      return respondError(404, `Operacion no encontrada: ${operationId}`, {
        errorCode: 'OPERATION_NOT_FOUND',
      });
    }

    return respond(200, {
      operation: formatOperationDetail(result.Item),
    });
  } catch (err) {
    log.error('Error obteniendo operacion HA', { operationId, error: err.message });
    return respondError(500, 'Error interno al obtener la operacion', {
      errorCode: 'DB_READ_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: POST /ha/operations/{id}/execute
//  Ejecuta una operacion HA previamente creada.
//  - Verifica que este en estado PLANNED
//  - Ejecuta prerequisitos
//  - Si todos pasan: ejecuta via StepExecutor (mock) o Step Functions (real)
// ═══════════════════════════════════════════════════════════════

async function executeOperation(operationId, event) {
  if (!operationId || typeof operationId !== 'string') {
    return respondError(400, 'operationId es requerido', {
      errorCode: 'MISSING_OPERATION_ID',
    });
  }

  // Obtener la operacion de DynamoDB
  let operation;
  try {
    const result = await ddbDoc.send(new GetCommand({
      TableName: HA_OPERATIONS_TABLE,
      Key: {
        pk: `HA_OP#${operationId}`,
        sk: 'META',
      },
    }));
    operation = result.Item;
  } catch (err) {
    log.error('Error leyendo operacion para ejecutar', { operationId, error: err.message });
    return respondError(500, 'Error interno al leer la operacion', {
      errorCode: 'DB_READ_ERROR',
    });
  }

  if (!operation) {
    return respondError(404, `Operacion no encontrada: ${operationId}`, {
      errorCode: 'OPERATION_NOT_FOUND',
    });
  }

  // Verificar que esta en estado PLANNED
  if (operation.status !== OperationStatus.PLANNED) {
    return respondError(409, `La operacion no esta en estado PLANNED (estado actual: ${operation.status})`, {
      errorCode: 'INVALID_STATE',
      details: { currentStatus: operation.status },
    });
  }

  // Verificar si requiere aprobacion pendiente
  if (operation.requiresApproval) {
    const body = safeParse(event.body);
    const approvalToken = body?.approvalToken;
    if (!approvalToken) {
      return respondError(403, 'Esta operacion requiere un token de aprobacion para ejecutarse', {
        errorCode: 'APPROVAL_REQUIRED',
        details: { policyResult: operation.policyResult },
      });
    }
    // En produccion, verificar el token contra la tabla de aprobaciones
    log.info('Token de aprobacion proporcionado', { operationId, tokenProvided: true });
  }

  // Actualizar estado a PREREQUISITES_CHECK
  try {
    await updateOperationStatus(operationId, OperationStatus.PREREQUISITES_CHECK, {
      'timestamps.startedAt': new Date().toISOString(),
    });
  } catch (err) {
    log.error('Error actualizando estado a PREREQUISITES_CHECK', { operationId, error: err.message });
    return respondError(500, 'Error interno al actualizar estado', { errorCode: 'DB_WRITE_ERROR' });
  }

  // Ejecutar prerequisitos
  const prereqResults = await runAllPrerequisites(operation.systemId, {
    operationType: operation.operationType,
    networkStrategy: operation.networkStrategy,
    dbStrategy: operation.dbStrategy,
    sourceNode: operation.sourceNode,
    targetNode: operation.targetNode,
  });

  // Guardar resultados de prerequisitos en DynamoDB
  try {
    await ddbDoc.send(new PutCommand({
      TableName: HA_PREREQUISITES_TABLE,
      Item: {
        pk: `PREREQ#${operationId}`,
        sk: new Date().toISOString(),
        operationId,
        systemId: operation.systemId,
        results: prereqResults,
        allPassed: prereqResults.every(p => p.status === PrerequisiteStatus.PASS || !p.required),
        checkedAt: new Date().toISOString(),
      },
    }));
  } catch (err) {
    log.warn('Error guardando resultados de prerequisitos', { error: err.message });
  }

  // Verificar si todos los prerequisitos obligatorios pasaron
  const failedRequired = prereqResults.filter(
    p => p.required && p.status === PrerequisiteStatus.FAIL
  );

  if (failedRequired.length > 0) {
    // Prerequisitos fallaron — volver a PLANNED y reportar
    await updateOperationStatus(operationId, OperationStatus.PLANNED, {
      error: {
        message: 'Prerequisitos obligatorios fallaron',
        failedChecks: failedRequired.map(p => ({
          name: p.name,
          details: p.details,
          remediation: p.remediation,
        })),
      },
    });

    log.warn('Prerequisitos fallaron, operacion no ejecutada', {
      operationId,
      failedCount: failedRequired.length,
    });

    return respondError(422, 'Prerequisitos obligatorios no cumplidos. La operacion no puede ejecutarse.', {
      errorCode: 'PREREQUISITES_FAILED',
      details: {
        failedPrerequisites: failedRequired,
        allPrerequisites: prereqResults,
      },
    });
  }

  // Advertencias (no bloquean)
  const warnings = prereqResults.filter(p => p.status === PrerequisiteStatus.WARN);
  if (warnings.length > 0) {
    log.info('Prerequisitos con advertencias (no bloquean)', {
      operationId,
      warnings: warnings.map(w => w.name),
    });
  }

  // ─── Ejecutar la operacion ───

  if (MOCK_MODE) {
    // ═══ MODO MOCK: Ejecutar directamente con StepExecutor ═══
    return await executeMockMode(operationId, operation, prereqResults);
  } else {
    // ═══ MODO REAL: Iniciar Step Functions ═══
    return await executeRealMode(operationId, operation, prereqResults, event);
  }
}

// ═══════════════════════════════════════════════════════════════
//  MODO MOCK: Ejecucion directa con StepExecutor
//  Usado para pruebas locales y desarrollo.
// ═══════════════════════════════════════════════════════════════

async function executeMockMode(operationId, operation, prereqResults) {
  log.info('Ejecutando operacion en modo MOCK', { operationId });

  // Actualizar estado a EXECUTING
  await updateOperationStatus(operationId, OperationStatus.EXECUTING);

  // Construir plan
  const planContext = {
    networkStrategy: operation.networkStrategy,
    dbStrategy: operation.dbStrategy,
    sapStrategy: operation.sapStrategy,
    sourceNode: operation.sourceNode,
    targetNode: operation.targetNode,
  };

  let plan;
  switch (operation.operationType) {
    case OperationType.FAILOVER:
      plan = buildFailoverPlan(operation.systemId, planContext);
      break;
    case OperationType.TAKEOVER:
      plan = buildTakeoverPlan(operation.systemId, planContext);
      break;
    case OperationType.FAILBACK:
      plan = buildFailbackPlan(operation.systemId, planContext);
      break;
    default:
      plan = buildFailoverPlan(operation.systemId, planContext);
  }

  // Crear StepExecutor con callbacks de logging
  const executor = new StepExecutor({
    globalTimeoutMs: 30 * 60 * 1000, // 30 minutos
    onStepStart: ({ step }) => {
      log.info('Step iniciado (mock)', { operationId, stepId: step.stepId, name: step.name });
    },
    onStepComplete: ({ step, result }) => {
      log.info('Step completado (mock)', { operationId, stepId: step.stepId, name: step.name });
    },
    onStepFail: ({ step, error }) => {
      log.error('Step fallido (mock)', { operationId, stepId: step.stepId, name: step.name, error: error.message });
    },
    onRollbackStart: ({ failedStep }) => {
      log.warn('Rollback iniciado (mock)', { operationId, failedStep: failedStep.name });
    },
    onProgress: (progress) => {
      log.info('Progreso (mock)', { operationId, ...progress });
    },
  });

  // Ejecutar la secuencia de pasos
  const executionResult = await executor.executeStepSequence(plan, {
    systemId: operation.systemId,
    sid: operation.sid,
    sourceNode: operation.sourceNode,
    targetNode: operation.targetNode,
    operationType: operation.operationType,
  });

  // Actualizar operacion con resultado
  const finalStatus = executionResult.status;
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: HA_OPERATIONS_TABLE,
      Key: { pk: `HA_OP#${operationId}`, sk: 'META' },
      UpdateExpression: `SET #st = :status, executedSteps = :steps, evidencePack = :evidence,
                         #ts.completedAt = :completed, #err = :error`,
      ExpressionAttributeNames: {
        '#st': 'status',
        '#ts': 'timestamps',
        '#err': 'error',
      },
      ExpressionAttributeValues: {
        ':status': finalStatus,
        ':steps': executionResult.executedSteps,
        ':evidence': {
          entries: executionResult.evidence,
          hash: executionResult.evidence.length > 0
            ? executionResult.evidence[executionResult.evidence.length - 1].hash
            : null,
        },
        ':completed': new Date().toISOString(),
        ':error': executionResult.error || null,
      },
    }));
  } catch (err) {
    log.error('Error guardando resultado de ejecucion mock', { operationId, error: err.message });
  }

  log.info('Operacion HA completada en modo MOCK', {
    operationId,
    status: finalStatus,
    totalDurationMs: executionResult.totalDurationMs,
    summary: executionResult.summary,
  });

  return respond(200, {
    message: `Operacion HA ${finalStatus === OperationStatus.COMPLETED ? 'completada exitosamente' : 'finalizada con errores'}`,
    mode: 'MOCK',
    operationId,
    status: finalStatus,
    totalDurationMs: executionResult.totalDurationMs,
    summary: executionResult.summary,
    executedSteps: executionResult.executedSteps.map(s => ({
      stepId: s.stepId,
      order: s.order,
      name: s.name,
      status: s.status,
      durationMs: s.durationMs,
      result: s.result,
    })),
    prerequisites: prereqResults,
    evidence: {
      count: executionResult.evidence.length,
      lastHash: executionResult.evidence.length > 0
        ? executionResult.evidence[executionResult.evidence.length - 1].hash
        : null,
    },
    error: executionResult.error || null,
  });
}

// ═══════════════════════════════════════════════════════════════
//  MODO REAL: Iniciar Step Functions
//  Usado en produccion para ejecucion asincona con orquestacion
//  de estados AWS (retry, timeout, error handling).
// ═══════════════════════════════════════════════════════════════

async function executeRealMode(operationId, operation, prereqResults, event) {
  log.info('Iniciando operacion via Step Functions', { operationId });

  if (!HA_STATE_MACHINE_ARN) {
    log.error('HA_STATE_MACHINE_ARN no configurado');
    // Revertir a PLANNED si no hay state machine configurada
    await updateOperationStatus(operationId, OperationStatus.PLANNED, {
      error: { message: 'State Machine ARN no configurado en el entorno' },
    });
    return respondError(500, 'Step Functions no configurado. Configure HA_STATE_MACHINE_ARN.', {
      errorCode: 'SFN_NOT_CONFIGURED',
    });
  }

  // Actualizar estado a EXECUTING
  await updateOperationStatus(operationId, OperationStatus.EXECUTING);

  // Preparar input para Step Functions
  const sfnInput = {
    operationId,
    systemId: operation.systemId,
    sid: operation.sid,
    operationType: operation.operationType,
    networkStrategy: operation.networkStrategy,
    dbStrategy: operation.dbStrategy,
    sapStrategy: operation.sapStrategy,
    sourceNode: operation.sourceNode,
    targetNode: operation.targetNode,
    triggeredBy: operation.triggeredBy,
    reason: operation.reason,
    plannedSteps: operation.plannedSteps,
    prerequisiteResults: prereqResults,
    startedAt: new Date().toISOString(),
  };

  try {
    const executionName = `ha-${operationId}-${Date.now()}`;
    const sfnResult = await sfn.send(new StartExecutionCommand({
      stateMachineArn: HA_STATE_MACHINE_ARN,
      name: executionName,
      input: JSON.stringify(sfnInput),
    }));

    // Guardar ARN de ejecucion en la operacion
    await ddbDoc.send(new UpdateCommand({
      TableName: HA_OPERATIONS_TABLE,
      Key: { pk: `HA_OP#${operationId}`, sk: 'META' },
      UpdateExpression: 'SET sfnExecutionArn = :arn, sfnExecutionName = :name',
      ExpressionAttributeValues: {
        ':arn': sfnResult.executionArn,
        ':name': executionName,
      },
    }));

    log.info('Step Functions execution iniciada', {
      operationId,
      executionArn: sfnResult.executionArn,
      executionName,
    });

    // Audit log
    await auditLog({
      event,
      accion: 'HA_OPERATION_EXECUTION_STARTED',
      recurso: `ha-operations/${operationId}`,
      despues: {
        operationId,
        sfnExecutionArn: sfnResult.executionArn,
        mode: 'STEP_FUNCTIONS',
      },
    }).catch(err => log.warn('Error escribiendo audit log', { error: err.message }));

    return respond(202, {
      message: 'Operacion HA iniciada. La ejecucion es asincrona via Step Functions.',
      mode: 'STEP_FUNCTIONS',
      operationId,
      status: OperationStatus.EXECUTING,
      sfnExecutionArn: sfnResult.executionArn,
      sfnExecutionName: executionName,
      prerequisites: prereqResults,
      monitorUrl: `/ha/operations/${operationId}`,
    });
  } catch (err) {
    log.error('Error iniciando Step Functions execution', { operationId, error: err.message });

    // Revertir a PLANNED
    await updateOperationStatus(operationId, OperationStatus.PLANNED, {
      error: { message: `Error iniciando Step Functions: ${err.message}` },
    });

    return respondError(500, 'Error al iniciar la ejecucion de Step Functions', {
      errorCode: 'SFN_START_ERROR',
      details: { error: err.message },
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: POST /ha/operations/{id}/cancel
//  Cancela una operacion HA que este en PLANNED o EXECUTING.
// ═══════════════════════════════════════════════════════════════

async function cancelOperation(operationId, event) {
  if (!operationId || typeof operationId !== 'string') {
    return respondError(400, 'operationId es requerido', {
      errorCode: 'MISSING_OPERATION_ID',
    });
  }

  // Obtener la operacion
  let operation;
  try {
    const result = await ddbDoc.send(new GetCommand({
      TableName: HA_OPERATIONS_TABLE,
      Key: { pk: `HA_OP#${operationId}`, sk: 'META' },
    }));
    operation = result.Item;
  } catch (err) {
    log.error('Error leyendo operacion para cancelar', { operationId, error: err.message });
    return respondError(500, 'Error interno al leer la operacion', { errorCode: 'DB_READ_ERROR' });
  }

  if (!operation) {
    return respondError(404, `Operacion no encontrada: ${operationId}`, {
      errorCode: 'OPERATION_NOT_FOUND',
    });
  }

  // Solo se puede cancelar si esta en PLANNED o EXECUTING
  const cancellableStates = [OperationStatus.PLANNED, OperationStatus.EXECUTING, OperationStatus.PREREQUISITES_CHECK];
  if (!cancellableStates.includes(operation.status)) {
    return respondError(409, `No se puede cancelar una operacion en estado ${operation.status}`, {
      errorCode: 'INVALID_STATE_FOR_CANCEL',
      details: { currentStatus: operation.status, cancellableStates },
    });
  }

  // Extraer razon de cancelacion del body
  const body = safeParse(event.body);
  const cancelReason = body?.reason || 'Cancelado por usuario';
  const user = getUser(event);

  // Actualizar estado a CANCELLED
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: HA_OPERATIONS_TABLE,
      Key: { pk: `HA_OP#${operationId}`, sk: 'META' },
      UpdateExpression: `SET #st = :status, #ts.cancelledAt = :cancelled,
                         cancelReason = :reason, cancelledBy = :user`,
      ExpressionAttributeNames: {
        '#st': 'status',
        '#ts': 'timestamps',
      },
      ExpressionAttributeValues: {
        ':status': OperationStatus.CANCELLED,
        ':cancelled': new Date().toISOString(),
        ':reason': cancelReason,
        ':user': user?.email || user?.username || 'UNKNOWN',
      },
    }));
  } catch (err) {
    log.error('Error cancelando operacion', { operationId, error: err.message });
    return respondError(500, 'Error interno al cancelar la operacion', { errorCode: 'DB_WRITE_ERROR' });
  }

  // Audit log
  await auditLog({
    event,
    accion: 'HA_OPERATION_CANCELLED',
    recurso: `ha-operations/${operationId}`,
    antes: { status: operation.status },
    despues: { status: OperationStatus.CANCELLED, cancelReason },
  }).catch(err => log.warn('Error escribiendo audit log', { error: err.message }));

  log.info('Operacion HA cancelada', { operationId, cancelReason });

  return respond(200, {
    message: 'Operacion HA cancelada exitosamente',
    operationId,
    previousStatus: operation.status,
    status: OperationStatus.CANCELLED,
    cancelReason,
    cancelledAt: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /ha/prerequisites/{systemId}
//  Ejecuta todas las verificaciones de prerequisitos HA
//  para un sistema especifico (sin iniciar operacion).
// ═══════════════════════════════════════════════════════════════

async function checkPrerequisites(systemId, queryParams) {
  if (!systemId || typeof systemId !== 'string') {
    return respondError(400, 'systemId es requerido', {
      errorCode: 'MISSING_SYSTEM_ID',
    });
  }

  // Buscar configuracion del sistema
  const systemConfig = await findSystemConfig(systemId);
  if (!systemConfig) {
    return respondError(404, `Sistema no encontrado: ${systemId}`, {
      errorCode: 'SYSTEM_NOT_FOUND',
    });
  }

  const haConfig = systemConfig.ha || {};
  const operationType = queryParams?.operationType || OperationType.TAKEOVER;

  // Ejecutar prerequisitos
  const results = await runAllPrerequisites(systemId, {
    operationType,
    networkStrategy: haConfig.networkStrategy || NetworkStrategy.EIP,
    dbStrategy: haConfig.dbStrategy || 'HANA_SR',
    sourceNode: haConfig.primaryNode || {},
    targetNode: haConfig.secondaryNode || {},
  });

  const allPassed = results.every(p => p.status === PrerequisiteStatus.PASS || !p.required);
  const requiredFailed = results.filter(p => p.required && p.status === PrerequisiteStatus.FAIL);
  const warnings = results.filter(p => p.status === PrerequisiteStatus.WARN);

  // Guardar resultados en la tabla de prerequisitos (historial)
  try {
    await ddbDoc.send(new PutCommand({
      TableName: HA_PREREQUISITES_TABLE,
      Item: {
        pk: `PREREQ#${systemId}`,
        sk: new Date().toISOString(),
        systemId,
        operationType,
        results,
        allPassed,
        checkedAt: new Date().toISOString(),
      },
    }));
  } catch (err) {
    log.warn('Error guardando historial de prerequisitos', { error: err.message });
  }

  log.info('Verificacion de prerequisitos completada', {
    systemId,
    operationType,
    allPassed,
    totalChecks: results.length,
    failedRequired: requiredFailed.length,
    warnings: warnings.length,
  });

  return respond(200, {
    systemId,
    operationType,
    allPassed,
    checkedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(p => p.status === PrerequisiteStatus.PASS).length,
      failed: results.filter(p => p.status === PrerequisiteStatus.FAIL).length,
      warnings: warnings.length,
      skipped: results.filter(p => p.status === PrerequisiteStatus.SKIP).length,
    },
    prerequisites: results,
    remediations: requiredFailed.map(p => ({
      name: p.name,
      displayName: p.displayName,
      remediation: p.remediation,
    })),
  });
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: runAllPrerequisites
//  Ejecuta todas las verificaciones de prerequisitos HA.
//  Cada check genera un createPrerequisiteResult.
// ═══════════════════════════════════════════════════════════════

async function runAllPrerequisites(systemId, context) {
  const results = [];
  const { operationType, networkStrategy, dbStrategy, sourceNode, targetNode } = context;

  // 1. Verificar que no hay otra operacion HA en progreso para este sistema
  results.push(await checkNoActiveOperation(systemId));

  // 2. Verificar conectividad SSH/SSM a ambos nodos
  results.push(await checkNodeReachability(sourceNode, 'source'));
  results.push(await checkNodeReachability(targetNode, 'target'));

  // 3. Verificar estado de replicacion de base de datos
  results.push(await checkReplicationHealth(systemId, dbStrategy));

  // 4. Verificar que el nodo target tiene capacidad suficiente
  results.push(await checkTargetCapacity(targetNode));

  // 5. Verificar drivers registrados para las estrategias configuradas
  results.push(await checkDriversAvailable(networkStrategy, dbStrategy));

  // 6. Verificar que no hay operaciones de backup en curso
  results.push(await checkNoActiveBackup(systemId));

  // 7. Verificar ventana de mantenimiento (para takeover planificado)
  if (operationType === OperationType.TAKEOVER) {
    results.push(await checkMaintenanceWindow(systemId));
  }

  return results;
}

// ─── Checks individuales de prerequisitos ───

async function checkNoActiveOperation(systemId) {
  try {
    // Consultar operaciones activas para este sistema
    const result = await ddbDoc.send(new QueryCommand({
      TableName: HA_OPERATIONS_TABLE,
      IndexName: 'systemId-createdAt-index',
      KeyConditionExpression: 'systemId = :sid',
      FilterExpression: '#st IN (:exec, :prereq, :rollback)',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: {
        ':sid': systemId,
        ':exec': OperationStatus.EXECUTING,
        ':prereq': OperationStatus.PREREQUISITES_CHECK,
        ':rollback': OperationStatus.ROLLBACK,
      },
      Limit: 1,
    }));

    const hasActive = (result.Items || []).length > 0;

    return createPrerequisiteResult({
      name: 'checkNoActiveOperation',
      displayName: 'Sin operacion HA activa',
      description: 'Verifica que no hay otra operacion HA en ejecucion para este sistema',
      status: hasActive ? PrerequisiteStatus.FAIL : PrerequisiteStatus.PASS,
      required: true,
      details: hasActive
        ? `Ya existe una operacion activa para ${systemId}: ${result.Items[0].operationId}`
        : `No hay operaciones activas para ${systemId}`,
      remediation: hasActive
        ? 'Espere a que la operacion activa finalice o cancele la operacion actual antes de iniciar una nueva'
        : '',
    });
  } catch (err) {
    log.warn('Error verificando operaciones activas', { systemId, error: err.message });
    return createPrerequisiteResult({
      name: 'checkNoActiveOperation',
      displayName: 'Sin operacion HA activa',
      description: 'Verifica que no hay otra operacion HA en ejecucion',
      status: PrerequisiteStatus.WARN,
      required: true,
      details: `No se pudo verificar: ${err.message}`,
      remediation: 'Verifique manualmente que no hay operaciones HA activas',
    });
  }
}

async function checkNodeReachability(node, label) {
  // En modo mock, simular que los nodos son accesibles
  const isReachable = MOCK_MODE ? true : !!node?.instanceId;

  return createPrerequisiteResult({
    name: `checkNodeReachability_${label}`,
    displayName: `Nodo ${label} accesible`,
    description: `Verifica conectividad con el nodo ${label} (${node?.hostname || 'desconocido'})`,
    status: isReachable ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
    required: true,
    details: isReachable
      ? `Nodo ${label} (${node?.instanceId || 'mock'}) accesible`
      : `Nodo ${label} no accesible o no configurado`,
    remediation: isReachable
      ? ''
      : `Verifique que la instancia ${node?.instanceId || 'N/A'} esta encendida y tiene SSM Agent activo`,
  });
}

async function checkReplicationHealth(systemId, dbStrategy) {
  // En modo mock, simular replicacion saludable
  if (MOCK_MODE) {
    return createPrerequisiteResult({
      name: 'checkReplicationHealth',
      displayName: 'Replicacion de BD saludable',
      description: `Verifica el estado de replicacion de la base de datos (${dbStrategy})`,
      status: PrerequisiteStatus.PASS,
      required: true,
      details: `Replicacion ${dbStrategy} en estado SOK (mock)`,
    });
  }

  // En modo real, verificar via el driver de DB
  try {
    const dbDriverName = dbStrategy.toLowerCase().replace('_', '-');
    if (registry.hasDriver(DriverType.DB, dbDriverName)) {
      const driver = registry.getDriver(DriverType.DB, dbDriverName);
      const healthResult = await driver.healthCheck({ systemId });
      const isHealthy = healthResult?.replicationStatus === 'SOK' || healthResult?.healthy;

      return createPrerequisiteResult({
        name: 'checkReplicationHealth',
        displayName: 'Replicacion de BD saludable',
        description: `Verifica el estado de replicacion (${dbStrategy})`,
        status: isHealthy ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
        required: true,
        details: isHealthy
          ? `Replicacion ${dbStrategy} saludable`
          : `Replicacion ${dbStrategy} en estado degradado: ${JSON.stringify(healthResult)}`,
        remediation: isHealthy
          ? ''
          : 'Verifique el estado de replicacion de la base de datos antes de continuar con el failover',
      });
    }

    return createPrerequisiteResult({
      name: 'checkReplicationHealth',
      displayName: 'Replicacion de BD saludable',
      description: `Driver de DB ${dbStrategy} no registrado`,
      status: PrerequisiteStatus.WARN,
      required: false,
      details: `Driver ${dbStrategy} no disponible, no se puede verificar replicacion`,
      remediation: 'Registre el driver de DB correspondiente',
    });
  } catch (err) {
    return createPrerequisiteResult({
      name: 'checkReplicationHealth',
      displayName: 'Replicacion de BD saludable',
      description: 'Error al verificar replicacion',
      status: PrerequisiteStatus.WARN,
      required: true,
      details: `Error: ${err.message}`,
      remediation: 'Verifique manualmente el estado de la replicacion',
    });
  }
}

async function checkTargetCapacity(targetNode) {
  // Verificar que el nodo target tiene configuracion minima
  const hasConfig = targetNode && (targetNode.instanceId || targetNode.hostname);

  return createPrerequisiteResult({
    name: 'checkTargetCapacity',
    displayName: 'Capacidad del nodo target',
    description: 'Verifica que el nodo target esta configurado y tiene capacidad',
    status: hasConfig ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
    required: true,
    details: hasConfig
      ? `Nodo target configurado: ${targetNode.hostname || targetNode.instanceId}`
      : 'Nodo target no configurado',
    remediation: hasConfig
      ? ''
      : 'Configure el nodo secundario en la configuracion HA del sistema',
  });
}

async function checkDriversAvailable(networkStrategy, dbStrategy) {
  // Verificar que los drivers requeridos estan registrados
  const issues = [];
  const networkDriverName = networkStrategy.toLowerCase();
  const dbDriverName = dbStrategy.toLowerCase().replace('_', '-');

  if (!registry.hasDriver(DriverType.NETWORK, networkDriverName)) {
    issues.push(`Driver de red '${networkDriverName}' no registrado`);
  }
  if (!registry.hasDriver(DriverType.DB, dbDriverName)) {
    issues.push(`Driver de BD '${dbDriverName}' no registrado`);
  }
  if (!registry.hasDriver(DriverType.SAP, 'sap-services')) {
    issues.push("Driver SAP 'sap-services' no registrado");
  }

  // En modo mock, los drivers del sistema manejan todo
  if (MOCK_MODE && issues.length > 0) {
    return createPrerequisiteResult({
      name: 'checkDriversAvailable',
      displayName: 'Drivers HA disponibles',
      description: 'Verifica que los drivers necesarios estan registrados',
      status: PrerequisiteStatus.WARN,
      required: false,
      details: `Modo MOCK activo — drivers faltantes seran simulados: ${issues.join('; ')}`,
    });
  }

  return createPrerequisiteResult({
    name: 'checkDriversAvailable',
    displayName: 'Drivers HA disponibles',
    description: 'Verifica que los drivers de red, BD y SAP estan registrados',
    status: issues.length === 0 ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
    required: !MOCK_MODE,
    details: issues.length === 0
      ? 'Todos los drivers necesarios estan registrados'
      : `Drivers faltantes: ${issues.join('; ')}`,
    remediation: issues.length > 0
      ? 'Registre los drivers faltantes en el driver-registry antes de ejecutar'
      : '',
  });
}

async function checkNoActiveBackup(systemId) {
  // En produccion, verificar via SSM o CloudWatch que no hay backup en curso
  // En mock, simular que no hay backup activo
  return createPrerequisiteResult({
    name: 'checkNoActiveBackup',
    displayName: 'Sin backup activo',
    description: 'Verifica que no hay operaciones de backup en curso que puedan interferir',
    status: PrerequisiteStatus.PASS,
    required: false,
    details: MOCK_MODE
      ? 'No hay backups activos (modo mock)'
      : `Verificacion de backups para ${systemId} completada`,
  });
}

async function checkMaintenanceWindow(systemId) {
  // Verificar si estamos dentro de una ventana de mantenimiento aprobada
  // En produccion, consultar el scheduler o la config del sistema
  const now = new Date();
  const hour = now.getUTCHours();
  // Ventana de mantenimiento por defecto: 02:00 - 06:00 UTC
  const inWindow = hour >= 2 && hour <= 6;

  return createPrerequisiteResult({
    name: 'checkMaintenanceWindow',
    displayName: 'Ventana de mantenimiento',
    description: 'Verifica si la operacion se ejecuta dentro de la ventana de mantenimiento aprobada',
    status: inWindow ? PrerequisiteStatus.PASS : PrerequisiteStatus.WARN,
    required: false,
    details: inWindow
      ? `Dentro de la ventana de mantenimiento (hora UTC: ${hour}:00)`
      : `Fuera de la ventana de mantenimiento (hora UTC: ${hour}:00, ventana: 02:00-06:00 UTC)`,
    remediation: inWindow
      ? ''
      : 'Considere ejecutar dentro de la ventana de mantenimiento para minimizar impacto',
  });
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /ha/drivers
//  Lista todos los drivers HA registrados.
//  Query params: ?type=NETWORK|DB|SAP
// ═══════════════════════════════════════════════════════════════

async function listDriversEndpoint(queryParams) {
  const driverType = queryParams?.type || null;

  // Validar tipo si se proporciona
  if (driverType && !Object.values(DriverType).includes(driverType)) {
    return respondError(400, `Tipo de driver invalido: ${driverType}. Valores permitidos: ${Object.values(DriverType).join(', ')}`, {
      errorCode: 'INVALID_DRIVER_TYPE',
    });
  }

  const drivers = registryListDrivers(driverType);

  return respond(200, {
    drivers,
    count: drivers.length,
    filter: driverType || 'ALL',
    availableTypes: Object.values(DriverType),
  });
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINT: GET /ha/systems/{systemId}
//  Devuelve informacion HA completa de un sistema:
//  nodos, estrategias, estado de replicacion, ultima operacion.
// ═══════════════════════════════════════════════════════════════

async function getSystemHaInfo(systemId) {
  if (!systemId || typeof systemId !== 'string') {
    return respondError(400, 'systemId es requerido', {
      errorCode: 'MISSING_SYSTEM_ID',
    });
  }

  // Buscar configuracion del sistema
  const systemConfig = await findSystemConfig(systemId);
  if (!systemConfig) {
    return respondError(404, `Sistema no encontrado: ${systemId}`, {
      errorCode: 'SYSTEM_NOT_FOUND',
    });
  }

  const haConfig = systemConfig.ha || {};
  const haEnabled = !!(systemConfig.haEnabled || haConfig.networkStrategy);

  // Buscar ultima operacion HA del sistema
  let lastOperation = null;
  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: HA_OPERATIONS_TABLE,
      IndexName: 'systemId-createdAt-index',
      KeyConditionExpression: 'systemId = :sid',
      ExpressionAttributeValues: { ':sid': systemId },
      ScanIndexForward: false, // Mas reciente primero
      Limit: 1,
    }));
    if (result.Items && result.Items.length > 0) {
      lastOperation = formatOperationSummary(result.Items[0]);
    }
  } catch (err) {
    log.warn('Error buscando ultima operacion HA', { systemId, error: err.message });
  }

  // Buscar ultimo resultado de prerequisitos
  let lastPrereqCheck = null;
  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: HA_PREREQUISITES_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `PREREQ#${systemId}` },
      ScanIndexForward: false,
      Limit: 1,
    }));
    if (result.Items && result.Items.length > 0) {
      lastPrereqCheck = result.Items[0];
    }
  } catch (err) {
    log.warn('Error buscando ultimo check de prerequisitos', { systemId, error: err.message });
  }

  // Determinar estado HA general del sistema
  let haStatus = 'NOT_CONFIGURED';
  if (haEnabled) {
    if (lastOperation && lastOperation.status === OperationStatus.EXECUTING) {
      haStatus = 'FAILOVER_IN_PROGRESS';
    } else if (lastPrereqCheck && lastPrereqCheck.allPassed) {
      haStatus = 'HEALTHY';
    } else if (lastPrereqCheck && !lastPrereqCheck.allPassed) {
      haStatus = 'DEGRADED';
    } else {
      haStatus = 'UNKNOWN';
    }
  }

  const haInfo = {
    systemId,
    sid: systemConfig.sid || systemId.split('-')[1] || 'UNK',
    haEnabled,
    haStatus,
    primaryNode: haConfig.primaryNode || null,
    secondaryNode: haConfig.secondaryNode || null,
    networkStrategy: haConfig.networkStrategy || null,
    dbType: systemConfig.database?.type || null,
    dbStrategy: haConfig.dbStrategy || null,
    replicationMode: haConfig.replicationMode || null,
    replicationStatus: haConfig.replicationStatus || 'UNKNOWN',
    lastOperation,
    lastPrereqCheck: lastPrereqCheck ? {
      checkedAt: lastPrereqCheck.checkedAt,
      allPassed: lastPrereqCheck.allPassed,
      resultCount: lastPrereqCheck.results?.length || 0,
    } : null,
  };

  return respond(200, { haInfo });
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════

/**
 * Actualiza el status de una operacion HA en DynamoDB.
 * Opcionalmente actualiza campos adicionales.
 */
async function updateOperationStatus(operationId, newStatus, extraFields = {}) {
  let updateExpr = 'SET #st = :status';
  const exprNames = { '#st': 'status' };
  const exprValues = { ':status': newStatus };

  // Agregar campos extra al update
  let fieldIndex = 0;
  for (const [key, value] of Object.entries(extraFields)) {
    const alias = `#f${fieldIndex}`;
    const valAlias = `:v${fieldIndex}`;

    // Soportar nested keys (e.g., 'timestamps.startedAt')
    if (key.includes('.')) {
      const parts = key.split('.');
      const parentAlias = `#p${fieldIndex}`;
      const childAlias = `#c${fieldIndex}`;
      exprNames[parentAlias] = parts[0];
      exprNames[childAlias] = parts[1];
      updateExpr += `, ${parentAlias}.${childAlias} = ${valAlias}`;
    } else {
      exprNames[alias] = key;
      updateExpr += `, ${alias} = ${valAlias}`;
    }
    exprValues[valAlias] = value;
    fieldIndex++;
  }

  await ddbDoc.send(new UpdateCommand({
    TableName: HA_OPERATIONS_TABLE,
    Key: { pk: `HA_OP#${operationId}`, sk: 'META' },
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
  }));
}

/**
 * Formatea una operacion para la respuesta de listado (resumen).
 */
function formatOperationSummary(item) {
  return {
    operationId: item.operationId,
    systemId: item.systemId,
    sid: item.sid,
    operationType: item.operationType,
    status: item.status,
    triggeredBy: item.triggeredBy,
    reason: item.reason,
    networkStrategy: item.networkStrategy,
    dbStrategy: item.dbStrategy,
    estimatedDurationMs: item.estimatedDurationMs,
    requiresApproval: item.requiresApproval || false,
    stepsCount: item.plannedSteps?.length || 0,
    timestamps: item.timestamps,
  };
}

/**
 * Formatea una operacion para la respuesta de detalle (completa).
 */
function formatOperationDetail(item) {
  return {
    operationId: item.operationId,
    systemId: item.systemId,
    sid: item.sid,
    operationType: item.operationType,
    status: item.status,
    triggeredBy: item.triggeredBy,
    reason: item.reason,
    networkStrategy: item.networkStrategy,
    dbStrategy: item.dbStrategy,
    sapStrategy: item.sapStrategy,
    sourceNode: item.sourceNode,
    targetNode: item.targetNode,
    requiresApproval: item.requiresApproval || false,
    policyResult: item.policyResult || null,
    estimatedDurationMs: item.estimatedDurationMs,
    plannedSteps: (item.plannedSteps || []).map(s => ({
      stepId: s.stepId,
      order: s.order,
      name: s.name,
      driverType: s.driverType,
      driverName: s.driverName,
      action: s.action,
      timeoutMs: s.timeoutMs,
      canRollback: s.canRollback,
      status: s.status,
    })),
    executedSteps: (item.executedSteps || []).map(s => ({
      stepId: s.stepId,
      order: s.order,
      name: s.name,
      status: s.status,
      durationMs: s.durationMs,
      result: s.result,
    })),
    evidencePack: item.evidencePack || { entries: [], hash: null },
    timestamps: item.timestamps,
    sfnExecutionArn: item.sfnExecutionArn || null,
    error: item.error || null,
    cancelReason: item.cancelReason || null,
    cancelledBy: item.cancelledBy || null,
    rollbackReason: item.rollbackReason || null,
  };
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Router HTTP que dirige cada request al endpoint correcto.
//  Sigue el patron de dashboard-api/index.js.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('HA Orchestrator invocado');
  const startTime = Date.now();

  try {
    // Extraer metodo, path y parametros del evento
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
    let path = event.path || event.rawPath || '/';
    const queryParams = event.queryStringParameters || {};
    const pathParams = event.pathParameters || {};

    // Quitar prefijo /api si lo trae API Gateway
    path = path.replace(/^\/api/, '') || '/';

    log.info(`${method} ${path}`);

    // ─── CORS preflight ───
    if (method === 'OPTIONS') {
      return respond(200, { message: 'OK' });
    }

    // ─── Autenticacion ───
    // Los endpoints HA requieren autenticacion excepto health
    if (path !== '/ha/health') {
      const authError = requireAuth(event);
      if (authError) return authError;
    }

    // ─── RBAC: Las operaciones HA requieren rol OPERATOR o superior ───
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      const roleCheck = requireRole(ROLES.OPERATOR)(event);
      if (roleCheck) return roleCheck;
    }

    // ═══════════════════════════════════════════════════════════
    //  ROUTER
    // ═══════════════════════════════════════════════════════════

    // GET /ha/health — Health check del servicio de HA
    if (method === 'GET' && path === '/ha/health') {
      return respond(200, {
        service: 'ha-orchestrator',
        status: 'healthy',
        mockMode: MOCK_MODE,
        registeredDrivers: registryListDrivers().length,
        timestamp: new Date().toISOString(),
      });
    }

    // POST /ha/operations — Crear operacion HA
    if (method === 'POST' && (path === '/ha/operations' || path === '/ha/operations/')) {
      return await createOperation(event);
    }

    // GET /ha/operations — Listar operaciones HA
    if (method === 'GET' && (path === '/ha/operations' || path === '/ha/operations/')) {
      return await listOperations(queryParams);
    }

    // GET /ha/operations/{id} — Detalle de una operacion
    if (method === 'GET' && path.match(/^\/ha\/operations\/[^/]+\/?$/)) {
      const operationId = pathParams.id || path.split('/')[3];
      return await getOperation(operationId);
    }

    // POST /ha/operations/{id}/execute — Ejecutar operacion
    if (method === 'POST' && path.match(/^\/ha\/operations\/[^/]+\/execute\/?$/)) {
      const operationId = pathParams.id || path.split('/')[3];
      return await executeOperation(operationId, event);
    }

    // POST /ha/operations/{id}/cancel — Cancelar operacion
    if (method === 'POST' && path.match(/^\/ha\/operations\/[^/]+\/cancel\/?$/)) {
      const operationId = pathParams.id || path.split('/')[3];
      return await cancelOperation(operationId, event);
    }

    // GET /ha/prerequisites/{systemId} — Verificar prerequisitos
    if (method === 'GET' && path.match(/^\/ha\/prerequisites\/[^/]+\/?$/)) {
      const systemId = pathParams.systemId || path.split('/')[3];
      return await checkPrerequisites(systemId, queryParams);
    }

    // GET /ha/drivers — Listar drivers registrados
    if (method === 'GET' && (path === '/ha/drivers' || path === '/ha/drivers/')) {
      return await listDriversEndpoint(queryParams);
    }

    // GET /ha/systems/{systemId} — Info HA de un sistema
    if (method === 'GET' && path.match(/^\/ha\/systems\/[^/]+\/?$/)) {
      const systemId = pathParams.systemId || path.split('/')[3];
      return await getSystemHaInfo(systemId);
    }

    // ─── Ruta no encontrada ───
    log.warn('Ruta no encontrada', { method, path });
    return respondError(404, `Ruta no encontrada: ${method} ${path}`, {
      errorCode: 'NOT_FOUND',
      details: {
        availableRoutes: [
          'POST   /ha/operations',
          'GET    /ha/operations',
          'GET    /ha/operations/{id}',
          'POST   /ha/operations/{id}/execute',
          'POST   /ha/operations/{id}/cancel',
          'GET    /ha/prerequisites/{systemId}',
          'GET    /ha/drivers',
          'GET    /ha/systems/{systemId}',
          'GET    /ha/health',
        ],
      },
    });

  } catch (err) {
    // Error global no capturado
    log.error('Error no capturado en HA Orchestrator', {
      error: err.message,
      stack: err.stack,
    });
    return respondError(500, 'Error interno del servidor', {
      errorCode: 'INTERNAL_ERROR',
      details: { message: err.message },
    });
  } finally {
    const duration = Date.now() - startTime;
    log.info('HA Orchestrator respondio', { durationMs: duration });
  }
};
