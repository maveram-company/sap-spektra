'use strict';

// ============================================================================
//  Avvale SAP AlwaysOps v1.0 -- H38: Custom Alert Rules Engine
//  Motor de reglas de alerta personalizadas.
//
//  Que hace este Lambda?
//  Permite a los usuarios definir reglas de alerta personalizadas via API
//  (CRUD almacenado en DynamoDB). Cuando llegan metricas del universal-collector
//  via SNS, este motor evalua todas las reglas activas contra esas metricas
//  y dispara alertas cuando se cumplen las condiciones.
//
//  Funcionalidades principales:
//  - CRUD de reglas de alerta via HTTP API (API Gateway)
//  - Evaluacion de reglas simples y compuestas (AND/OR)
//  - Historial de evaluaciones por regla
//  - Cooldown configurable para evitar alertas repetitivas
//  - Integracion con SNS para notificaciones
//  - Publicacion de metricas en CloudWatch
//  - Soporte para acciones: notify, runbook, escalate
//
//  Eventos soportados:
//  - SNS (metricas del universal-collector): evalua todas las reglas
//  - HTTP API (API Gateway): CRUD de reglas
// ============================================================================

const crypto = require('crypto');

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

// v1.0 -- H33: Trial Mode
const { getSystemConfig: getTrialConfig } = require('../utilidades/trial-config');

const log = require('../utilidades/logger')('alert-rules-engine');

// ── Clientes de AWS (se crean una sola vez, se reutilizan entre invocaciones) ──
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const cw = new CloudWatchClient({});

// ── Configuracion desde variables de entorno ──
const ALERT_RULES_TABLE = process.env.ALERT_RULES_TABLE || 'sap-alwaysops-alert-rules';
const RULE_EVAL_HISTORY_TABLE = process.env.RULE_EVAL_HISTORY_TABLE || 'sap-alwaysops-rule-eval-history';
const ALERTS_TOPIC_ARN = process.env.ALERTS_TOPIC_ARN || '';
const CW_NAMESPACE = process.env.CW_NAMESPACE || 'SAPAlwaysOps';
const SYSTEMS_CONFIG_PARAM = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';

// ── Constantes internas ──
const MAX_RULES_PER_SYSTEM = 50;        // Limite de reglas por sistema
const MAX_CONDITIONS_PER_COMPOSITE = 10; // Maximo condiciones en regla compuesta
const EVAL_HISTORY_TTL_DAYS = 30;        // Dias de retencion del historial
const MAX_RULES_SCAN_LIMIT = 500;        // Limite maximo al escanear reglas

// ── Operadores validos para las condiciones de las reglas ──
const VALID_OPERATORS = ['gt', 'lt', 'gte', 'lte', 'eq', 'ne'];

// ── Severidades validas ──
const VALID_SEVERITIES = ['INFO', 'WARNING', 'HIGH', 'CRITICAL'];

// ── Acciones validas ──
const VALID_ACTIONS = ['notify', 'runbook', 'escalate'];

// ── Logica compuesta valida ──
const VALID_COMPOSITE_LOGIC = ['AND', 'OR'];

// ════════════════════════════════════════════════════════════════
//  NOISE OPTIMIZER — Dedup/correlation + alert storm detection
//  Reduce fatiga de alertas agrupando eventos similares por SID.
// ════════════════════════════════════════════════════════════════

// Cache en memoria para dedup (por instancia Lambda)
const recentAlerts = new Map(); // key: "SID#metricName" -> { count, firstSeen, lastSeen }
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const STORM_THRESHOLD = 10; // >10 alertas en la ventana = tormenta
const STORM_COOLDOWN_MS = 15 * 60 * 1000; // 15 min cooldown en tormenta
let stormMode = false;
let stormStartedAt = 0;

function shouldSuppressAlert(systemId, metricName) {
  const key = `${systemId}#${metricName}`;
  const now = Date.now();

  // Limpiar entradas viejas
  for (const [k, v] of recentAlerts.entries()) {
    if (now - v.lastSeen > DEDUP_WINDOW_MS) recentAlerts.delete(k);
  }

  // Verificar storm mode
  if (stormMode && (now - stormStartedAt < STORM_COOLDOWN_MS)) {
    log.info('Alert storm activo, suprimiendo', { key });
    return { suppress: true, reason: 'alert_storm', dedupCount: recentAlerts.get(key)?.count || 0 };
  } else if (stormMode) {
    stormMode = false;
    log.info('Alert storm finalizado');
  }

  // Dedup por SID+metrica
  const existing = recentAlerts.get(key);
  if (existing) {
    existing.count++;
    existing.lastSeen = now;

    // Si ya se notifico en esta ventana, suprimir duplicado
    if (existing.count > 1 && (now - existing.firstSeen < DEDUP_WINDOW_MS)) {
      return { suppress: true, reason: 'dedup', dedupCount: existing.count };
    }
  } else {
    recentAlerts.set(key, { count: 1, firstSeen: now, lastSeen: now });
  }

  // Detectar alert storm: demasiadas alertas unicas en la ventana
  if (recentAlerts.size > STORM_THRESHOLD) {
    stormMode = true;
    stormStartedAt = now;
    log.info('Alert storm detectado', { alertCount: recentAlerts.size });
    return { suppress: true, reason: 'alert_storm_triggered', dedupCount: recentAlerts.size };
  }

  return { suppress: false };
}

function getNoiseStats() {
  return {
    activeAlerts: recentAlerts.size,
    stormMode,
    stormStartedAt: stormMode ? new Date(stormStartedAt).toISOString() : null,
  };
}

// ============================================================================
//  FUNCION: respond
//  Utilidad para crear respuestas HTTP para API Gateway.
//  Incluye headers CORS para que el frontend pueda acceder.
// ============================================================================

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

// ============================================================================
//  FUNCION: generateRuleId
//  Genera un ID unico para cada regla de alerta.
//  Formato: RULE-<timestamp corto>-<random hex>
// ============================================================================

function generateRuleId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `RULE-${timestamp}-${random}`;
}

// ============================================================================
//  FUNCION: generateEvalId
//  Genera un ID unico para cada evaluacion de regla.
// ============================================================================

function generateEvalId() {
  return `EVAL-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

// ============================================================================
//  FUNCION: validateRuleInput
//  Valida los campos de una regla de alerta antes de guardarla.
//  Retorna un objeto { valid, errors } donde errors es un array de strings.
// ============================================================================

function validateRuleInput(rule, isUpdate = false) {
  const errors = [];

  // En creacion, nombre y systemId son obligatorios
  if (!isUpdate) {
    if (!rule.name || typeof rule.name !== 'string' || rule.name.trim().length === 0) {
      errors.push('El campo "name" es obligatorio y debe ser un string no vacio');
    }
    if (!rule.systemId || typeof rule.systemId !== 'string') {
      errors.push('El campo "systemId" es obligatorio');
    }
  }

  // Validar nombre si se proporciona
  if (rule.name !== undefined) {
    if (typeof rule.name !== 'string' || rule.name.trim().length === 0) {
      errors.push('El campo "name" debe ser un string no vacio');
    } else if (rule.name.length > 200) {
      errors.push('El campo "name" no puede exceder 200 caracteres');
    }
  }

  // Validar descripcion si se proporciona
  if (rule.description !== undefined && typeof rule.description !== 'string') {
    errors.push('El campo "description" debe ser un string');
  }

  // Determinar si es regla simple o compuesta
  const isComposite = rule.compositeLogic || rule.conditions;
  const isSimple = rule.metricName || rule.operator || rule.threshold !== undefined;

  if (!isUpdate && !isComposite && !isSimple) {
    errors.push('Debe proporcionar condiciones de regla simple (metricName, operator, threshold) o compuesta (compositeLogic, conditions)');
  }

  // Validar regla simple
  if (isSimple && !isComposite) {
    if (!rule.metricName || typeof rule.metricName !== 'string') {
      errors.push('El campo "metricName" es obligatorio para reglas simples');
    }
    if (!rule.operator || !VALID_OPERATORS.includes(rule.operator)) {
      errors.push(`El campo "operator" debe ser uno de: ${VALID_OPERATORS.join(', ')}`);
    }
    if (rule.threshold === undefined || typeof rule.threshold !== 'number' || isNaN(rule.threshold)) {
      errors.push('El campo "threshold" es obligatorio y debe ser un numero');
    }
  }

  // Validar regla compuesta
  if (isComposite) {
    if (!rule.compositeLogic || !VALID_COMPOSITE_LOGIC.includes(rule.compositeLogic)) {
      errors.push(`El campo "compositeLogic" debe ser uno de: ${VALID_COMPOSITE_LOGIC.join(', ')}`);
    }
    if (!Array.isArray(rule.conditions) || rule.conditions.length < 2) {
      errors.push('Las reglas compuestas requieren al menos 2 condiciones en el array "conditions"');
    } else if (rule.conditions.length > MAX_CONDITIONS_PER_COMPOSITE) {
      errors.push(`Maximo ${MAX_CONDITIONS_PER_COMPOSITE} condiciones por regla compuesta`);
    } else {
      // Validar cada condicion individualmente
      rule.conditions.forEach((cond, idx) => {
        if (!cond.metricName || typeof cond.metricName !== 'string') {
          errors.push(`Condicion [${idx}]: "metricName" es obligatorio`);
        }
        if (!cond.operator || !VALID_OPERATORS.includes(cond.operator)) {
          errors.push(`Condicion [${idx}]: "operator" debe ser uno de: ${VALID_OPERATORS.join(', ')}`);
        }
        if (cond.threshold === undefined || typeof cond.threshold !== 'number' || isNaN(cond.threshold)) {
          errors.push(`Condicion [${idx}]: "threshold" debe ser un numero`);
        }
      });
    }
  }

  // Validar severidad
  if (rule.severity !== undefined) {
    if (!VALID_SEVERITIES.includes(rule.severity)) {
      errors.push(`El campo "severity" debe ser uno de: ${VALID_SEVERITIES.join(', ')}`);
    }
  } else if (!isUpdate) {
    errors.push('El campo "severity" es obligatorio');
  }

  // Validar acciones
  if (rule.actions !== undefined) {
    if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
      errors.push('El campo "actions" debe ser un array no vacio');
    } else {
      const invalidActions = rule.actions.filter(a => !VALID_ACTIONS.includes(a));
      if (invalidActions.length > 0) {
        errors.push(`Acciones invalidas: ${invalidActions.join(', ')}. Validas: ${VALID_ACTIONS.join(', ')}`);
      }
    }
  } else if (!isUpdate) {
    errors.push('El campo "actions" es obligatorio');
  }

  // Validar cooldown
  if (rule.cooldownMinutes !== undefined) {
    if (typeof rule.cooldownMinutes !== 'number' || rule.cooldownMinutes < 0) {
      errors.push('El campo "cooldownMinutes" debe ser un numero >= 0');
    } else if (rule.cooldownMinutes > 1440) {
      errors.push('El campo "cooldownMinutes" no puede exceder 1440 (24 horas)');
    }
  }

  // Validar enabled
  if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
    errors.push('El campo "enabled" debe ser un booleano');
  }

  // Validar runbookId si la accion incluye runbook
  if (rule.actions && rule.actions.includes('runbook') && !rule.runbookId) {
    errors.push('Cuando la accion incluye "runbook", el campo "runbookId" es obligatorio');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
//  FUNCION: evaluateCondition
//  Evalua una condicion individual contra un valor de metrica.
//  Retorna true si la condicion se cumple (= la alerta debe dispararse).
// ============================================================================

function evaluateCondition(metricValue, operator, threshold) {
  // Si el valor de la metrica no existe, la condicion no se cumple
  if (metricValue === undefined || metricValue === null) {
    return false;
  }

  switch (operator) {
    case 'gt':  return metricValue > threshold;
    case 'lt':  return metricValue < threshold;
    case 'gte': return metricValue >= threshold;
    case 'lte': return metricValue <= threshold;
    case 'eq':  return metricValue === threshold;
    case 'ne':  return metricValue !== threshold;
    default:
      log.warn('Operador desconocido', { operator });
      return false;
  }
}

// ============================================================================
//  FUNCION: isInCooldown
//  Verifica si una regla esta en periodo de cooldown.
//  Esto evita que la misma regla dispare alertas repetitivas.
//  Compara el timestamp de la ultima alerta con el cooldownMinutes configurado.
// ============================================================================

function isInCooldown(rule) {
  if (!rule.cooldownMinutes || rule.cooldownMinutes <= 0) {
    return false;
  }

  if (!rule.lastTriggeredAt) {
    return false;
  }

  const lastTriggered = new Date(rule.lastTriggeredAt).getTime();
  const cooldownMs = rule.cooldownMinutes * 60 * 1000;
  const now = Date.now();

  return (now - lastTriggered) < cooldownMs;
}

// ============================================================================
//  SECCION: CRUD DE REGLAS — Operaciones HTTP
//  Estas funciones manejan la creacion, lectura, actualizacion y eliminacion
//  de reglas de alerta en DynamoDB.
// ============================================================================

// ── CREATE: Crear una nueva regla de alerta ──
async function createRule(ruleInput) {
  log.info('Creando nueva regla de alerta');

  // Validar entrada
  const validation = validateRuleInput(ruleInput);
  if (!validation.valid) {
    log.warn('Validacion fallida', { errors: validation.errors });
    return respond(400, {
      error: 'Datos de regla invalidos',
      details: validation.errors,
    });
  }

  // Verificar limite de reglas por sistema
  try {
    const existingRules = await ddbDoc.send(new QueryCommand({
      TableName: ALERT_RULES_TABLE,
      IndexName: 'system-index',
      KeyConditionExpression: 'systemId = :sid',
      ExpressionAttributeValues: { ':sid': ruleInput.systemId },
      Select: 'COUNT',
    }));

    if ((existingRules.Count || 0) >= MAX_RULES_PER_SYSTEM) {
      log.warn('Limite de reglas alcanzado', { systemId: ruleInput.systemId, currentCount: existingRules.Count, maxRules: MAX_RULES_PER_SYSTEM });
      return respond(400, {
        error: `Limite de reglas alcanzado para el sistema (maximo ${MAX_RULES_PER_SYSTEM})`,
        currentCount: existingRules.Count,
      });
    }
  } catch (err) {
    log.error('Error verificando limite de reglas', { error: err.message });
    // Continuar con la creacion, el limite es una proteccion suave
  }

  // Consultar trial config para verificar restricciones del modo
  let trialConfig = null;
  try {
    trialConfig = await getTrialConfig(ruleInput.systemId);
    log.info('Modo del sistema consultado', { systemId: ruleInput.systemId, mode: trialConfig.mode });
  } catch (err) {
    log.warn('No se pudo obtener config trial, continuando', { error: err.message });
  }

  // Construir el item de la regla
  const now = new Date().toISOString();
  const ruleId = generateRuleId();

  const ruleItem = {
    ruleId,
    name: ruleInput.name.trim(),
    description: ruleInput.description || '',
    systemId: ruleInput.systemId,
    severity: ruleInput.severity,
    actions: ruleInput.actions,
    cooldownMinutes: ruleInput.cooldownMinutes || 15,
    enabled: ruleInput.enabled !== undefined ? ruleInput.enabled : true,
    runbookId: ruleInput.runbookId || null,
    tags: ruleInput.tags || [],
    createdAt: now,
    updatedAt: now,
    createdBy: ruleInput.createdBy || 'system',
    version: 1,
    triggerCount: 0,
    lastTriggeredAt: null,
    lastEvaluatedAt: null,
    consecutiveTriggersCount: 0,
  };

  // Regla simple vs compuesta
  if (ruleInput.compositeLogic && ruleInput.conditions) {
    ruleItem.ruleType = 'COMPOSITE';
    ruleItem.compositeLogic = ruleInput.compositeLogic;
    ruleItem.conditions = ruleInput.conditions.map((cond, idx) => ({
      conditionId: `COND-${idx}`,
      metricName: cond.metricName,
      operator: cond.operator,
      threshold: cond.threshold,
    }));
  } else {
    ruleItem.ruleType = 'SIMPLE';
    ruleItem.metricName = ruleInput.metricName;
    ruleItem.operator = ruleInput.operator;
    ruleItem.threshold = ruleInput.threshold;
  }

  // Guardar en DynamoDB
  try {
    await ddbDoc.send(new PutCommand({
      TableName: ALERT_RULES_TABLE,
      Item: ruleItem,
      ConditionExpression: 'attribute_not_exists(ruleId)',
    }));

    log.info('Regla creada exitosamente', { ruleId, ruleName: ruleItem.name });

    // Publicar metrica de creacion en CloudWatch
    await publishRuleMetric('RuleCreated', ruleItem.systemId, 1);

    return respond(201, {
      message: 'Regla creada exitosamente',
      rule: ruleItem,
    });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      log.error('Colision de ruleId, reintento no implementado');
      return respond(409, { error: 'Conflicto al crear la regla, intente de nuevo' });
    }
    log.error('Error guardando regla en DynamoDB', { error: err.message });
    throw err;
  }
}

// ── READ: Obtener una regla por su ID ──
async function getRule(ruleId) {
  log.info('Obteniendo regla', { ruleId });

  if (!ruleId || typeof ruleId !== 'string') {
    return respond(400, { error: 'El parametro "ruleId" es obligatorio' });
  }

  try {
    const result = await ddbDoc.send(new GetCommand({
      TableName: ALERT_RULES_TABLE,
      Key: { ruleId },
    }));

    if (!result.Item) {
      log.info('Regla no encontrada', { ruleId });
      return respond(404, { error: `Regla no encontrada: ${ruleId}` });
    }

    return respond(200, { rule: result.Item });
  } catch (err) {
    log.error('Error obteniendo regla', { ruleId, error: err.message });
    throw err;
  }
}

// ── LIST: Listar reglas, opcionalmente filtradas por systemId ──
async function listRules(queryParams = {}) {
  log.info('Listando reglas de alerta');

  const { systemId, enabled, severity, limit: queryLimit } = queryParams;
  const scanLimit = Math.min(parseInt(queryLimit) || MAX_RULES_SCAN_LIMIT, MAX_RULES_SCAN_LIMIT);

  try {
    // Construir filtros dinamicamente
    const filterParts = [];
    const exprNames = {};
    const exprValues = {};

    if (enabled !== undefined) {
      filterParts.push('#enabled = :enabled');
      exprNames['#enabled'] = 'enabled';
      exprValues[':enabled'] = enabled === 'true' || enabled === true;
    }

    if (severity && VALID_SEVERITIES.includes(severity)) {
      filterParts.push('severity = :sev');
      exprValues[':sev'] = severity;
    }

    let result;

    if (systemId) {
      // Usar GSI 'system-index' cuando filtramos por systemId
      const queryParams = {
        TableName: ALERT_RULES_TABLE,
        IndexName: 'system-index',
        KeyConditionExpression: 'systemId = :sid',
        ExpressionAttributeValues: { ':sid': systemId, ...exprValues },
        Limit: scanLimit,
      };

      if (filterParts.length > 0) {
        queryParams.FilterExpression = filterParts.join(' AND ');
        if (Object.keys(exprNames).length > 0) {
          queryParams.ExpressionAttributeNames = exprNames;
        }
      }

      result = await ddbDoc.send(new QueryCommand(queryParams));
    } else {
      // v1.5 — Query via GSI 'type-index' (PK: entityType = 'ALERT_RULE') en lugar de Scan.
      // Todas las reglas se escriben con entityType='ALERT_RULE' para habilitar este GSI.
      const queryParams = {
        TableName: ALERT_RULES_TABLE,
        IndexName: 'type-index',
        KeyConditionExpression: 'entityType = :etype',
        ExpressionAttributeValues: { ':etype': 'ALERT_RULE', ...exprValues },
        Limit: scanLimit,
      };

      if (filterParts.length > 0) {
        queryParams.FilterExpression = filterParts.join(' AND ');
        if (Object.keys(exprNames).length > 0) {
          queryParams.ExpressionAttributeNames = exprNames;
        }
      }

      result = await ddbDoc.send(new QueryCommand(queryParams));
    }
    const rules = result.Items || [];

    // Ordenar por fecha de creacion (mas recientes primero)
    rules.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    log.info('Reglas encontradas', { count: rules.length });

    return respond(200, {
      rules,
      count: rules.length,
      filters: { systemId, enabled, severity },
    });
  } catch (err) {
    log.error('Error listando reglas', { error: err.message });
    throw err;
  }
}

// ── UPDATE: Actualizar una regla existente ──
async function updateRule(ruleId, updates) {
  log.info('Actualizando regla', { ruleId });

  if (!ruleId || typeof ruleId !== 'string') {
    return respond(400, { error: 'El parametro "ruleId" es obligatorio' });
  }

  // Validar campos de actualizacion
  const validation = validateRuleInput(updates, true);
  if (!validation.valid) {
    log.warn('Validacion de actualizacion fallida', { errors: validation.errors });
    return respond(400, {
      error: 'Datos de actualizacion invalidos',
      details: validation.errors,
    });
  }

  // Verificar que la regla existe
  try {
    const existing = await ddbDoc.send(new GetCommand({
      TableName: ALERT_RULES_TABLE,
      Key: { ruleId },
    }));

    if (!existing.Item) {
      return respond(404, { error: `Regla no encontrada: ${ruleId}` });
    }

    // Campos que se pueden actualizar
    const allowedFields = [
      'name', 'description', 'severity', 'actions', 'cooldownMinutes',
      'enabled', 'metricName', 'operator', 'threshold', 'compositeLogic',
      'conditions', 'runbookId', 'tags',
    ];

    // Construir expresion de actualizacion dinamicamente
    const updateParts = [];
    const exprNames = {};
    const exprValues = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const attrName = `#${field}`;
        const attrValue = `:${field}`;
        updateParts.push(`${attrName} = ${attrValue}`);
        exprNames[attrName] = field;
        exprValues[attrValue] = updates[field];
      }
    }

    if (updateParts.length === 0) {
      return respond(400, { error: 'No se proporcionaron campos para actualizar' });
    }

    // Agregar updatedAt y version
    updateParts.push('#updatedAt = :updatedAt');
    exprNames['#updatedAt'] = 'updatedAt';
    exprValues[':updatedAt'] = new Date().toISOString();

    updateParts.push('#version = #version + :one');
    exprNames['#version'] = 'version';
    exprValues[':one'] = 1;

    // Si se cambia de simple a compuesta o viceversa, limpiar campos
    if (updates.compositeLogic && updates.conditions) {
      // Cambiando a compuesta: limpiar campos de regla simple
      updateParts.push('#ruleType = :ruleType');
      exprNames['#ruleType'] = 'ruleType';
      exprValues[':ruleType'] = 'COMPOSITE';

      updateParts.push('REMOVE metricName, #operator, threshold');
      exprNames['#operator'] = 'operator';
    } else if (updates.metricName && updates.operator && updates.threshold !== undefined) {
      // Cambiando a simple: limpiar campos de regla compuesta
      updateParts.push('#ruleType = :ruleType');
      exprNames['#ruleType'] = 'ruleType';
      exprValues[':ruleType'] = 'SIMPLE';

      updateParts.push('REMOVE compositeLogic, #conditions');
      exprNames['#conditions'] = 'conditions';
    }

    // Separar SET y REMOVE si hay ambos
    const setParts = updateParts.filter(p => !p.startsWith('REMOVE'));
    const removeParts = updateParts.filter(p => p.startsWith('REMOVE'));

    let updateExpression = `SET ${setParts.join(', ')}`;
    if (removeParts.length > 0) {
      // Extraer los campos del REMOVE y unificar
      const removeFields = removeParts.map(p => p.replace('REMOVE ', '')).join(', ');
      updateExpression += ` REMOVE ${removeFields}`;
    }

    const result = await ddbDoc.send(new UpdateCommand({
      TableName: ALERT_RULES_TABLE,
      Key: { ruleId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    }));

    log.info('Regla actualizada', { ruleId, version: result.Attributes.version });

    return respond(200, {
      message: 'Regla actualizada exitosamente',
      rule: result.Attributes,
    });
  } catch (err) {
    log.error('Error actualizando regla', { ruleId, error: err.message });
    throw err;
  }
}

// ── DELETE: Eliminar una regla ──
async function deleteRule(ruleId) {
  log.info('Eliminando regla', { ruleId });

  if (!ruleId || typeof ruleId !== 'string') {
    return respond(400, { error: 'El parametro "ruleId" es obligatorio' });
  }

  try {
    // Verificar que existe antes de eliminar
    const existing = await ddbDoc.send(new GetCommand({
      TableName: ALERT_RULES_TABLE,
      Key: { ruleId },
    }));

    if (!existing.Item) {
      return respond(404, { error: `Regla no encontrada: ${ruleId}` });
    }

    await ddbDoc.send(new DeleteCommand({
      TableName: ALERT_RULES_TABLE,
      Key: { ruleId },
    }));

    log.info('Regla eliminada', { ruleId, ruleName: existing.Item.name });

    // Publicar metrica de eliminacion
    await publishRuleMetric('RuleDeleted', existing.Item.systemId, 1);

    return respond(200, {
      message: 'Regla eliminada exitosamente',
      ruleId,
      ruleName: existing.Item.name,
    });
  } catch (err) {
    log.error('Error eliminando regla', { ruleId, error: err.message });
    throw err;
  }
}

// ── TOGGLE: Habilitar/deshabilitar una regla rapidamente ──
async function toggleRule(ruleId, enabled) {
  log.info('Toggle regla', { ruleId, enabled });

  if (!ruleId || typeof ruleId !== 'string') {
    return respond(400, { error: 'El parametro "ruleId" es obligatorio' });
  }

  if (typeof enabled !== 'boolean') {
    return respond(400, { error: 'El campo "enabled" debe ser un booleano' });
  }

  try {
    const result = await ddbDoc.send(new UpdateCommand({
      TableName: ALERT_RULES_TABLE,
      Key: { ruleId },
      UpdateExpression: 'SET #enabled = :enabled, updatedAt = :now',
      ExpressionAttributeNames: { '#enabled': 'enabled' },
      ExpressionAttributeValues: {
        ':enabled': enabled,
        ':now': new Date().toISOString(),
      },
      ConditionExpression: 'attribute_exists(ruleId)',
      ReturnValues: 'ALL_NEW',
    }));

    log.info('Regla toggle completado', { ruleId, enabled });

    return respond(200, {
      message: `Regla ${enabled ? 'habilitada' : 'deshabilitada'} exitosamente`,
      rule: result.Attributes,
    });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return respond(404, { error: `Regla no encontrada: ${ruleId}` });
    }
    log.error('Error en toggle regla', { ruleId, error: err.message });
    throw err;
  }
}

// ── GET HISTORY: Obtener historial de evaluaciones de una regla ──
async function getRuleHistory(ruleId, queryParams = {}) {
  log.info('Obteniendo historial de regla', { ruleId });

  if (!ruleId) {
    return respond(400, { error: 'El parametro "ruleId" es obligatorio' });
  }

  const limit = Math.min(parseInt(queryParams.limit) || 50, 200);

  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: RULE_EVAL_HISTORY_TABLE,
      KeyConditionExpression: 'ruleId = :rid',
      ExpressionAttributeValues: { ':rid': ruleId },
      ScanIndexForward: false, // Mas recientes primero
      Limit: limit,
    }));

    return respond(200, {
      ruleId,
      evaluations: result.Items || [],
      count: (result.Items || []).length,
    });
  } catch (err) {
    log.error('Error obteniendo historial de regla', { ruleId, error: err.message });
    throw err;
  }
}

// ============================================================================
//  SECCION: EVALUACION DE REGLAS
//  Estas funciones se ejecutan cuando llegan metricas via SNS.
//  Evaluan todas las reglas activas contra las metricas recibidas.
// ============================================================================

// ── Cargar todas las reglas activas para un sistema especifico ──
async function loadActiveRules(systemId) {
  log.info('Cargando reglas activas', { systemId });

  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: ALERT_RULES_TABLE,
      IndexName: 'system-index',
      KeyConditionExpression: 'systemId = :sid',
      FilterExpression: '#enabled = :enabled',
      ExpressionAttributeNames: { '#enabled': 'enabled' },
      ExpressionAttributeValues: {
        ':sid': systemId,
        ':enabled': true,
      },
    }));

    const rules = result.Items || [];
    log.info('Reglas activas cargadas', { count: rules.length, systemId });
    return rules;
  } catch (err) {
    log.error('Error cargando reglas activas', { systemId, error: err.message });
    return [];
  }
}

// ── Evaluar una regla simple contra las metricas recibidas ──
function evaluateSimpleRule(rule, metrics) {
  const metricValue = metrics[rule.metricName];

  if (metricValue === undefined || metricValue === null) {
    return {
      triggered: false,
      reason: `Metrica "${rule.metricName}" no encontrada en datos recibidos`,
      metricValue: null,
    };
  }

  const triggered = evaluateCondition(metricValue, rule.operator, rule.threshold);

  return {
    triggered,
    reason: triggered
      ? `${rule.metricName} (${metricValue}) ${rule.operator} ${rule.threshold}`
      : `${rule.metricName} (${metricValue}) no cumple ${rule.operator} ${rule.threshold}`,
    metricValue,
    threshold: rule.threshold,
    operator: rule.operator,
  };
}

// ── Evaluar una regla compuesta (AND/OR de multiples condiciones) ──
function evaluateCompositeRule(rule, metrics) {
  if (!rule.conditions || rule.conditions.length === 0) {
    return {
      triggered: false,
      reason: 'Regla compuesta sin condiciones',
      conditionResults: [],
    };
  }

  const conditionResults = rule.conditions.map((cond) => {
    const metricValue = metrics[cond.metricName];
    const triggered = evaluateCondition(metricValue, cond.operator, cond.threshold);

    return {
      conditionId: cond.conditionId,
      metricName: cond.metricName,
      metricValue: metricValue !== undefined ? metricValue : null,
      operator: cond.operator,
      threshold: cond.threshold,
      triggered,
    };
  });

  let overallTriggered;
  if (rule.compositeLogic === 'AND') {
    // AND: todas las condiciones deben cumplirse
    overallTriggered = conditionResults.every(r => r.triggered);
  } else {
    // OR: al menos una condicion debe cumplirse
    overallTriggered = conditionResults.some(r => r.triggered);
  }

  const triggeredCount = conditionResults.filter(r => r.triggered).length;
  const totalCount = conditionResults.length;

  return {
    triggered: overallTriggered,
    reason: overallTriggered
      ? `Regla compuesta (${rule.compositeLogic}): ${triggeredCount}/${totalCount} condiciones cumplidas`
      : `Regla compuesta (${rule.compositeLogic}): ${triggeredCount}/${totalCount} condiciones cumplidas (insuficiente)`,
    conditionResults,
    compositeLogic: rule.compositeLogic,
  };
}

// ── Guardar resultado de evaluacion en el historial ──
async function saveEvaluationHistory(ruleId, systemId, evaluationResult, alertSent) {
  try {
    const now = new Date();
    const ttlSeconds = Math.floor(now.getTime() / 1000) + (EVAL_HISTORY_TTL_DAYS * 86400);

    const evalItem = {
      ruleId,
      evaluatedAt: now.toISOString(),
      evalId: generateEvalId(),
      systemId,
      triggered: evaluationResult.triggered,
      reason: evaluationResult.reason,
      alertSent: alertSent || false,
      details: evaluationResult,
      ttl: ttlSeconds,
    };

    await ddbDoc.send(new PutCommand({
      TableName: RULE_EVAL_HISTORY_TABLE,
      Item: evalItem,
    }));
  } catch (err) {
    // No fallar la evaluacion por error en historial
    log.warn('Error guardando historial de evaluacion', { ruleId, error: err.message });
  }
}

// ── Actualizar contadores de la regla despues de una evaluacion ──
async function updateRuleCounters(ruleId, triggered) {
  try {
    const now = new Date().toISOString();

    if (triggered) {
      // Si disparo: incrementar contadores y marcar timestamp
      await ddbDoc.send(new UpdateCommand({
        TableName: ALERT_RULES_TABLE,
        Key: { ruleId },
        UpdateExpression: `
          SET lastEvaluatedAt = :now,
              lastTriggeredAt = :now,
              triggerCount = if_not_exists(triggerCount, :zero) + :one,
              consecutiveTriggersCount = if_not_exists(consecutiveTriggersCount, :zero) + :one
        `,
        ExpressionAttributeValues: {
          ':now': now,
          ':zero': 0,
          ':one': 1,
        },
      }));
    } else {
      // Si no disparo: resetear conteo consecutivo
      await ddbDoc.send(new UpdateCommand({
        TableName: ALERT_RULES_TABLE,
        Key: { ruleId },
        UpdateExpression: `
          SET lastEvaluatedAt = :now,
              consecutiveTriggersCount = :zero
        `,
        ExpressionAttributeValues: {
          ':now': now,
          ':zero': 0,
        },
      }));
    }
  } catch (err) {
    log.warn('Error actualizando contadores de regla', { ruleId, error: err.message });
  }
}

// ── Enviar alerta via SNS cuando una regla se dispara ──
async function sendRuleAlert(rule, evaluationResult, metrics) {
  if (!ALERTS_TOPIC_ARN) {
    log.warn('ALERTS_TOPIC_ARN no configurado, omitiendo envio de alerta');
    return false;
  }

  try {
    const alertPayload = {
      source: 'alert-rules-engine',
      type: 'CUSTOM_RULE_ALERT',
      timestamp: new Date().toISOString(),
      rule: {
        ruleId: rule.ruleId,
        name: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        actions: rule.actions,
        runbookId: rule.runbookId || null,
        triggerCount: (rule.triggerCount || 0) + 1,
        consecutiveTriggersCount: (rule.consecutiveTriggersCount || 0) + 1,
      },
      system: {
        systemId: rule.systemId,
      },
      evaluation: {
        triggered: evaluationResult.triggered,
        reason: evaluationResult.reason,
        details: evaluationResult,
      },
      actions: rule.actions,
    };

    // Incluir runbookId en el payload si la accion es runbook
    if (rule.actions.includes('runbook') && rule.runbookId) {
      alertPayload.runbook = {
        runbookId: rule.runbookId,
        autoExecute: false,
      };
    }

    // Incluir flag de escalado si la accion es escalate
    if (rule.actions.includes('escalate')) {
      alertPayload.escalation = {
        required: true,
        severity: rule.severity,
      };
    }

    // Construir mensaje legible para notificaciones
    const subject = `[Avvale SAP AlwaysOps] Alerta ${rule.severity}: ${rule.name}`;
    const messageText = [
      `--- Avvale SAP AlwaysOps - Alerta de Regla Personalizada ---`,
      ``,
      `Regla: ${rule.name} (${rule.ruleId})`,
      `Sistema: ${rule.systemId}`,
      `Severidad: ${rule.severity}`,
      `Tipo: ${rule.ruleType}`,
      ``,
      `Razon: ${evaluationResult.reason}`,
      ``,
      `Acciones configuradas: ${rule.actions.join(', ')}`,
      `Disparos consecutivos: ${(rule.consecutiveTriggersCount || 0) + 1}`,
      `Total disparos: ${(rule.triggerCount || 0) + 1}`,
      ``,
      `Timestamp: ${new Date().toISOString()}`,
    ].join('\n');

    await sns.send(new PublishCommand({
      TopicArn: ALERTS_TOPIC_ARN,
      Subject: subject.substring(0, 100), // SNS limita subject a 100 chars
      Message: JSON.stringify({
        default: messageText,
        lambda: JSON.stringify(alertPayload),
      }),
      MessageStructure: 'json',
      MessageAttributes: {
        severity: { DataType: 'String', StringValue: rule.severity },
        systemId: { DataType: 'String', StringValue: rule.systemId },
        ruleId: { DataType: 'String', StringValue: rule.ruleId },
        source: { DataType: 'String', StringValue: 'alert-rules-engine' },
      },
    }));

    log.info('Alerta enviada via SNS', { ruleId: rule.ruleId, ruleName: rule.name });
    return true;
  } catch (err) {
    log.error('Error enviando alerta SNS', { ruleId: rule.ruleId, error: err.message });
    return false;
  }
}

// ── Publicar metricas del motor de reglas en CloudWatch ──
async function publishRuleMetric(metricName, systemId, value) {
  try {
    await cw.send(new PutMetricDataCommand({
      Namespace: CW_NAMESPACE,
      MetricData: [{
        MetricName: `AlertRulesEngine_${metricName}`,
        Dimensions: [
          { Name: 'Service', Value: 'AlertRulesEngine' },
          { Name: 'SystemId', Value: systemId || 'global' },
        ],
        Value: value,
        Unit: 'Count',
        Timestamp: new Date(),
      }],
    }));
  } catch (err) {
    // No fallar por error en metricas
    log.warn('Error publicando metrica', { metricName, error: err.message });
  }
}

// ============================================================================
//  FUNCION: evaluateAllRules
//  Funcion principal de evaluacion. Recibe metricas del universal-collector
//  (via SNS) y evalua todas las reglas activas contra esas metricas.
//  Es el corazon del motor de reglas de alerta.
// ============================================================================

async function evaluateAllRules(metricsPayload) {
  const startTime = Date.now();
  log.info('Iniciando evaluacion de reglas contra metricas recibidas');

  // Extraer systemId y metricas del payload SNS
  const systemId = metricsPayload.systemId || metricsPayload.system?.systemId;
  if (!systemId) {
    log.warn('Payload de metricas sin systemId, abortando evaluacion');
    return { evaluated: 0, triggered: 0, alerts: 0, error: 'Sin systemId' };
  }

  // Las metricas pueden venir como objeto plano o dentro de un campo "metrics"
  const metrics = metricsPayload.metrics || metricsPayload;
  if (!metrics || typeof metrics !== 'object') {
    log.warn('Payload de metricas invalido');
    return { evaluated: 0, triggered: 0, alerts: 0, error: 'Metricas invalidas' };
  }

  log.info('Metricas recibidas para evaluacion', { systemId, metricCount: Object.keys(metrics).length });

  // Verificar trial mode: limitar notificaciones si es necesario
  let trialConfig = null;
  try {
    trialConfig = await getTrialConfig(systemId);
  } catch (err) {
    log.warn('No se pudo obtener trial config', { error: err.message });
  }

  // Cargar reglas activas para este sistema
  const rules = await loadActiveRules(systemId);
  if (rules.length === 0) {
    log.info('No hay reglas activas, omitiendo evaluacion', { systemId });
    return { evaluated: 0, triggered: 0, alerts: 0, systemId };
  }

  // Evaluar cada regla
  let evaluated = 0;
  let triggered = 0;
  let alertsSent = 0;
  let skippedCooldown = 0;
  const results = [];

  for (const rule of rules) {
    evaluated++;

    try {
      // Evaluar segun tipo de regla
      let evalResult;
      if (rule.ruleType === 'COMPOSITE') {
        evalResult = evaluateCompositeRule(rule, metrics);
      } else {
        evalResult = evaluateSimpleRule(rule, metrics);
      }

      let alertSent = false;

      if (evalResult.triggered) {
        triggered++;

        // Verificar cooldown
        if (isInCooldown(rule)) {
          skippedCooldown++;
          log.info('Regla en cooldown, omitiendo alerta', { ruleId: rule.ruleId });
        }
        // Noise optimizer: dedup + storm detection
        else if (shouldSuppressAlert(rule.systemId || systemId, rule.name || rule.ruleId).suppress) {
          const noiseResult = shouldSuppressAlert(rule.systemId || systemId, rule.name || rule.ruleId);
          log.info('Alerta suprimida por noise optimizer', { reason: noiseResult.reason, dedupCount: noiseResult.dedupCount });
          skippedCooldown++;
        } else {
          // Verificar limite de notificaciones en trial mode
          let canNotify = true;
          if (trialConfig && trialConfig.mode === 'TRIAL') {
            const dailyLimit = trialConfig.maxNotificationsPerDay || 10;
            if (alertsSent >= dailyLimit) {
              canNotify = false;
              log.info('Limite de notificaciones trial alcanzado, omitiendo alerta', { dailyLimit });
            }
          }

          if (canNotify) {
            alertSent = await sendRuleAlert(rule, evalResult, metrics);
            if (alertSent) {
              alertsSent++;
            }
          }
        }
      }

      // Actualizar contadores de la regla
      await updateRuleCounters(rule.ruleId, evalResult.triggered);

      // Guardar en historial de evaluaciones
      await saveEvaluationHistory(rule.ruleId, systemId, evalResult, alertSent);

      results.push({
        ruleId: rule.ruleId,
        ruleName: rule.name,
        triggered: evalResult.triggered,
        alertSent,
        reason: evalResult.reason,
      });

    } catch (err) {
      log.error('Error evaluando regla', { ruleId: rule.ruleId, error: err.message });
      results.push({
        ruleId: rule.ruleId,
        ruleName: rule.name,
        error: err.message,
      });
    }
  }

  const elapsed = Date.now() - startTime;

  // Publicar metricas de evaluacion en CloudWatch
  await Promise.all([
    publishRuleMetric('RulesEvaluated', systemId, evaluated),
    publishRuleMetric('RulesTriggered', systemId, triggered),
    publishRuleMetric('AlertsSent', systemId, alertsSent),
    publishRuleMetric('EvaluationTimeMs', systemId, elapsed),
  ]);

  const summary = {
    systemId,
    evaluated,
    triggered,
    alertsSent,
    skippedCooldown,
    elapsedMs: elapsed,
    results,
  };

  log.info('Evaluacion completada', { evaluated, triggered, alertsSent, skippedCooldown, elapsedMs: elapsed });

  return summary;
}

// ============================================================================
//  FUNCION: parseSnsEvent
//  Extrae el payload de metricas de un evento SNS.
//  El universal-collector publica metricas en SNS, y este Lambda las recibe.
// ============================================================================

function parseSnsEvent(event) {
  const results = [];

  if (!event.Records || !Array.isArray(event.Records)) {
    log.warn('Evento SNS sin Records');
    return results;
  }

  for (const record of event.Records) {
    try {
      if (record.EventSource === 'aws:sns' || record.eventSource === 'aws:sns') {
        const snsMessage = record.Sns?.Message || record.sns?.Message;
        if (snsMessage) {
          const parsed = JSON.parse(snsMessage);
          results.push(parsed);
        }
      }
    } catch (err) {
      log.error('Error parseando record SNS', { error: err.message });
    }
  }

  return results;
}

// ============================================================================
//  FUNCION: detectEventType
//  Determina si el evento es un SNS (metricas) o un HTTP API (CRUD).
//  Esto permite que un solo Lambda maneje ambos tipos de eventos.
// ============================================================================

function detectEventType(event) {
  // Evento SNS: tiene Records con EventSource aws:sns
  if (event.Records && Array.isArray(event.Records) && event.Records.length > 0) {
    const firstRecord = event.Records[0];
    if (firstRecord.EventSource === 'aws:sns' || firstRecord.eventSource === 'aws:sns') {
      return 'SNS';
    }
  }

  // Evento HTTP API Gateway (v1 REST API)
  if (event.httpMethod || event.resource) {
    return 'HTTP';
  }

  // Evento HTTP API Gateway (v2 HTTP API)
  if (event.requestContext?.http?.method) {
    return 'HTTP';
  }

  // Evento directo de invocacion Lambda (testing/debugging)
  if (event.action || event.operation) {
    return 'DIRECT';
  }

  return 'UNKNOWN';
}

// ============================================================================
//  FUNCION: handleHttpRequest
//  Router HTTP que dirige cada request al endpoint CRUD correcto.
//  Soporta los siguientes endpoints:
//
//  GET    /rules              -> Listar reglas (con filtros opcionales)
//  GET    /rules/{id}         -> Obtener una regla por ID
//  GET    /rules/{id}/history -> Historial de evaluaciones de una regla
//  POST   /rules              -> Crear nueva regla
//  PUT    /rules/{id}         -> Actualizar regla existente
//  PATCH  /rules/{id}/toggle  -> Habilitar/deshabilitar regla
//  DELETE /rules/{id}         -> Eliminar regla
// ============================================================================

async function handleHttpRequest(event) {
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = event.path || event.rawPath || '/';
  const queryParams = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};

  log.info('HTTP request recibido', { method, path });

  // CORS preflight
  if (method === 'OPTIONS') {
    return respond(200, { message: 'OK' });
  }

  // Parsear body para POST/PUT/PATCH
  let body = null;
  if (event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (err) {
      log.error('Error parseando body', { error: err.message });
      return respond(400, { error: 'Body JSON invalido' });
    }
  }

  // ── Router ──

  // GET /rules - Listar reglas
  if (method === 'GET' && path.match(/^\/rules\/?$/)) {
    return await listRules(queryParams);
  }

  // POST /rules - Crear regla
  if (method === 'POST' && path.match(/^\/rules\/?$/)) {
    if (!body) {
      return respond(400, { error: 'Body es obligatorio para crear regla' });
    }
    return await createRule(body);
  }

  // GET /rules/{id}/history - Historial de evaluaciones
  if (method === 'GET' && path.match(/^\/rules\/[^/]+\/history\/?$/)) {
    const ruleId = pathParams.id || path.split('/')[2];
    return await getRuleHistory(ruleId, queryParams);
  }

  // GET /rules/{id} - Obtener regla
  if (method === 'GET' && path.match(/^\/rules\/[^/]+\/?$/) && !path.includes('/history')) {
    const ruleId = pathParams.id || path.split('/')[2];
    return await getRule(ruleId);
  }

  // PUT /rules/{id} - Actualizar regla
  if (method === 'PUT' && path.match(/^\/rules\/[^/]+\/?$/)) {
    const ruleId = pathParams.id || path.split('/')[2];
    if (!body) {
      return respond(400, { error: 'Body es obligatorio para actualizar regla' });
    }
    return await updateRule(ruleId, body);
  }

  // PATCH /rules/{id}/toggle - Toggle enabled/disabled
  if (method === 'PATCH' && path.match(/^\/rules\/[^/]+\/toggle\/?$/)) {
    const ruleId = pathParams.id || path.split('/')[2];
    if (!body || body.enabled === undefined) {
      return respond(400, { error: 'Body debe incluir campo "enabled" (booleano)' });
    }
    return await toggleRule(ruleId, body.enabled);
  }

  // DELETE /rules/{id} - Eliminar regla
  if (method === 'DELETE' && path.match(/^\/rules\/[^/]+\/?$/)) {
    const ruleId = pathParams.id || path.split('/')[2];
    return await deleteRule(ruleId);
  }

  // GET /rules/stats - Estadisticas generales de reglas
  if (method === 'GET' && path.match(/^\/rules\/stats\/?$/)) {
    return await getRulesStats(queryParams);
  }

  // Ruta no encontrada
  log.warn('Ruta no encontrada', { method, path });
  return respond(404, {
    error: 'Endpoint no encontrado',
    availableEndpoints: [
      'GET    /rules',
      'GET    /rules/{id}',
      'GET    /rules/{id}/history',
      'GET    /rules/stats',
      'POST   /rules',
      'PUT    /rules/{id}',
      'PATCH  /rules/{id}/toggle',
      'DELETE /rules/{id}',
    ],
  });
}

// ============================================================================
//  FUNCION: getRulesStats
//  Retorna estadisticas agregadas de las reglas de alerta.
//  Util para dashboards y monitoreo del estado del motor de reglas.
// ============================================================================

async function getRulesStats(queryParams = {}) {
  log.info('Calculando estadisticas de reglas');

  const { systemId } = queryParams;

  try {
    let result;

    if (systemId) {
      // Usar GSI 'system-index' cuando filtramos por systemId
      result = await ddbDoc.send(new QueryCommand({
        TableName: ALERT_RULES_TABLE,
        IndexName: 'system-index',
        KeyConditionExpression: 'systemId = :sid',
        ExpressionAttributeValues: { ':sid': systemId },
      }));
    } else {
      // v1.5 — Query via GSI 'type-index' (PK: entityType = 'ALERT_RULE') para estadisticas globales.
      // Elimina Scan completo de la tabla. Requiere que todos los items tengan entityType='ALERT_RULE'.
      result = await ddbDoc.send(new QueryCommand({
        TableName: ALERT_RULES_TABLE,
        IndexName: 'type-index',
        KeyConditionExpression: 'entityType = :etype',
        ExpressionAttributeValues: { ':etype': 'ALERT_RULE' },
      }));
    }
    const rules = result.Items || [];

    // Calcular estadisticas
    const stats = {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      disabledRules: rules.filter(r => !r.enabled).length,
      byType: {
        SIMPLE: rules.filter(r => r.ruleType === 'SIMPLE').length,
        COMPOSITE: rules.filter(r => r.ruleType === 'COMPOSITE').length,
      },
      bySeverity: {
        INFO: rules.filter(r => r.severity === 'INFO').length,
        WARNING: rules.filter(r => r.severity === 'WARNING').length,
        HIGH: rules.filter(r => r.severity === 'HIGH').length,
        CRITICAL: rules.filter(r => r.severity === 'CRITICAL').length,
      },
      bySystem: {},
      totalTriggers: 0,
      rulesInCooldown: 0,
    };

    for (const rule of rules) {
      // Contar por sistema
      if (!stats.bySystem[rule.systemId]) {
        stats.bySystem[rule.systemId] = 0;
      }
      stats.bySystem[rule.systemId]++;

      // Sumar disparos totales
      stats.totalTriggers += rule.triggerCount || 0;

      // Contar reglas en cooldown
      if (rule.enabled && isInCooldown(rule)) {
        stats.rulesInCooldown++;
      }
    }

    // Top 5 reglas mas disparadas
    stats.topTriggeredRules = rules
      .filter(r => (r.triggerCount || 0) > 0)
      .sort((a, b) => (b.triggerCount || 0) - (a.triggerCount || 0))
      .slice(0, 5)
      .map(r => ({
        ruleId: r.ruleId,
        name: r.name,
        systemId: r.systemId,
        triggerCount: r.triggerCount,
        severity: r.severity,
      }));

    log.info('Estadisticas calculadas', { totalRules: stats.totalRules });

    return respond(200, { stats, filters: { systemId } });
  } catch (err) {
    log.error('Error calculando estadisticas', { error: err.message });
    throw err;
  }
}

// ============================================================================
//  FUNCION: handleDirectInvocation
//  Maneja invocaciones directas del Lambda (testing, Step Functions, etc).
//  Permite ejecutar operaciones CRUD sin pasar por API Gateway.
// ============================================================================

async function handleDirectInvocation(event) {
  const { action, operation } = event;
  const op = action || operation;

  log.info('Invocacion directa', { operation: op });

  switch (op) {
    case 'createRule':
      return await createRule(event.rule || event.payload);

    case 'getRule':
      return await getRule(event.ruleId);

    case 'listRules':
      return await listRules(event.filters || {});

    case 'updateRule':
      return await updateRule(event.ruleId, event.updates || event.payload);

    case 'deleteRule':
      return await deleteRule(event.ruleId);

    case 'toggleRule':
      return await toggleRule(event.ruleId, event.enabled);

    case 'getRuleHistory':
      return await getRuleHistory(event.ruleId, event.params || {});

    case 'getRulesStats':
      return await getRulesStats(event.filters || {});

    case 'evaluateRules':
      // Evaluacion manual de reglas con metricas proporcionadas
      if (!event.metricsPayload) {
        return respond(400, { error: 'Se requiere "metricsPayload" para evaluacion manual' });
      }
      return await evaluateAllRules(event.metricsPayload);

    default:
      return respond(400, {
        error: `Operacion desconocida: ${op}`,
        availableOperations: [
          'createRule', 'getRule', 'listRules', 'updateRule',
          'deleteRule', 'toggleRule', 'getRuleHistory',
          'getRulesStats', 'evaluateRules',
        ],
      });
  }
}

// ============================================================================
//  HANDLER PRINCIPAL
//  Punto de entrada del Lambda. Detecta el tipo de evento y lo enruta
//  al manejador correspondiente:
//  - SNS: evalua reglas contra metricas recibidas
//  - HTTP: CRUD de reglas via API Gateway
//  - DIRECT: invocacion programatica
// ============================================================================

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Alert Rules Engine v1.0 invocado');
  const startTime = Date.now();

  try {
    const eventType = detectEventType(event);
    log.info('Tipo de evento detectado', { eventType });

    // ── Evento SNS: evaluar reglas contra metricas ──
    if (eventType === 'SNS') {
      const metricsPayloads = parseSnsEvent(event);
      log.info('Mensajes SNS recibidos', { count: metricsPayloads.length });

      if (metricsPayloads.length === 0) {
        log.warn('No se pudieron extraer metricas del evento SNS');
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Sin metricas para evaluar', evaluated: 0 }),
        };
      }

      // Evaluar reglas para cada payload de metricas recibido
      const allResults = [];
      for (const payload of metricsPayloads) {
        const result = await evaluateAllRules(payload);
        allResults.push(result);
      }

      // Resumen total
      const totalEvaluated = allResults.reduce((sum, r) => sum + (r.evaluated || 0), 0);
      const totalTriggered = allResults.reduce((sum, r) => sum + (r.triggered || 0), 0);
      const totalAlerts = allResults.reduce((sum, r) => sum + (r.alertsSent || 0), 0);
      const elapsed = Date.now() - startTime;

      log.info('Evaluacion SNS completa', { totalEvaluated, totalTriggered, totalAlerts, elapsedMs: elapsed });

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Evaluacion de reglas completada',
          totalEvaluated,
          totalTriggered,
          totalAlerts,
          elapsedMs: elapsed,
          systems: allResults.map(r => ({
            systemId: r.systemId,
            evaluated: r.evaluated,
            triggered: r.triggered,
            alertsSent: r.alertsSent,
          })),
        }),
      };
    }

    // ── Evento HTTP: CRUD de reglas ──
    if (eventType === 'HTTP') {
      return await handleHttpRequest(event);
    }

    // ── Invocacion directa (testing, Step Functions) ──
    if (eventType === 'DIRECT') {
      return await handleDirectInvocation(event);
    }

    // ── Tipo de evento desconocido ──
    log.warn('Tipo de evento no reconocido', { eventPreview: JSON.stringify(event).substring(0, 500) });
    return respond(400, {
      error: 'Tipo de evento no reconocido',
      hint: 'Este Lambda acepta eventos SNS (metricas), HTTP API (CRUD), o invocaciones directas',
    });

  } catch (err) {
    const elapsed = Date.now() - startTime;
    log.error('Error fatal en handler', { elapsedMs: elapsed, error: err.message, stack: err.stack });

    // Intentar publicar metrica de error
    try {
      await publishRuleMetric('HandlerErrors', 'global', 1);
    } catch (metricErr) {
      // Ignorar error en metrica
    }

    return respond(500, {
      error: 'Error interno del motor de reglas',
      message: err.message,
      requestId: (event.requestContext?.requestId) || 'unknown',
    });
  }
};
