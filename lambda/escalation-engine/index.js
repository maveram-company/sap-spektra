'use strict';

// =================================================================
//  Avvale SAP AlwaysOps v1.0 -- Escalation Engine
//  Motor de escalacion automatica para aprobaciones no respondidas.
//
//  Que hace este Lambda?
//  Se ejecuta cada 10 minutos via EventBridge. Escanea la tabla de
//  aprobaciones buscando las que estan en estado PENDING y, segun
//  el tiempo transcurrido desde su creacion, aplica un esquema de
//  escalacion de 3 niveles:
//    - Nivel 1 (30 min): Re-notifica al equipo L1
//    - Nivel 2 (60 min): Escala al equipo L2
//    - Nivel 3 (120 min): Escala a Admin + auto-ejecuta si costSafe
//
//  Esto garantiza que ninguna aprobacion se quede sin respuesta
//  y que las acciones criticas se tomen a tiempo.
// =================================================================

const log = require('../utilidades/logger')('escalation-engine');
const { getSystemConfig: getTrialConfig } = require('../utilidades/trial-config');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Clientes de AWS (se crean una sola vez, se reutilizan entre invocaciones)
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const lambda = new LambdaClient({});

// Configuracion desde variables de entorno
const APPROVALS_TABLE = process.env.APPROVALS_TABLE || 'sap-alwaysops-approvals';
const ALERTS_TOPIC_ARN = process.env.ALERTS_TOPIC_ARN || '';
const RUNBOOK_ENGINE_ARN = process.env.RUNBOOK_ENGINE_ARN || '';

// Umbrales de escalacion en minutos (configurables via env vars)
const ESCALATION_L1_MINUTES = parseInt(process.env.ESCALATION_L1_MINUTES || '30');
const ESCALATION_L2_MINUTES = parseInt(process.env.ESCALATION_L2_MINUTES || '60');
const ESCALATION_L3_MINUTES = parseInt(process.env.ESCALATION_L3_MINUTES || '120');

// Rate limiting: maximo de escalaciones por invocacion para evitar flooding
const MAX_ESCALATIONS_PER_INVOCATION = 10;

// =================================================================
//  FUNCION: scanPendingApprovals
//  Escanea la tabla de aprobaciones buscando items con status PENDING.
//  En produccion se recomienda usar un GSI para mejor rendimiento,
//  pero Scan con filtro es suficiente para volumenes moderados.
// =================================================================

async function scanPendingApprovals() {
  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: APPROVALS_TABLE,
      IndexName: 'status-created-index',
      KeyConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'PENDING' },
    }));

    const items = result.Items || [];
    log.info('SCAN_COMPLETE', { pendingCount: items.length });
    return items;
  } catch (err) {
    log.error('SCAN_FAILED', { error: err.message });
    throw err;
  }
}

// =================================================================
//  FUNCION: calculateElapsedMinutes
//  Calcula cuantos minutos han pasado desde que se creo la
//  solicitud de aprobacion. Esto determina el nivel de escalacion.
// =================================================================

function calculateElapsedMinutes(createdAt) {
  const createdTime = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.floor((now - createdTime) / (1000 * 60));
}

// =================================================================
//  FUNCION: determineEscalationLevel
//  Segun el tiempo transcurrido, determina a que nivel de
//  escalacion corresponde esta aprobacion. Retorna null si
//  la aprobacion ya fue escalada a ese nivel o superior.
// =================================================================

function determineEscalationLevel(elapsedMinutes, currentLevel) {
  // Determinar el nivel que corresponde segun el tiempo transcurrido
  let targetLevel = 0;

  if (elapsedMinutes >= ESCALATION_L3_MINUTES) {
    targetLevel = 3;
  } else if (elapsedMinutes >= ESCALATION_L2_MINUTES) {
    targetLevel = 2;
  } else if (elapsedMinutes >= ESCALATION_L1_MINUTES) {
    targetLevel = 1;
  }

  // Solo escalar si el nivel objetivo es mayor al nivel actual
  // Esto evita re-enviar notificaciones del mismo nivel
  if (targetLevel > (currentLevel || 0)) {
    return targetLevel;
  }

  return null; // No necesita escalacion
}

// =================================================================
//  FUNCION: getEscalationType
//  Mapea el nivel numerico al tipo de evento SNS correspondiente.
// =================================================================

function getEscalationType(level) {
  const types = {
    1: 'ESCALATION_L1',
    2: 'ESCALATION_L2',
    3: 'ESCALATION_ADMIN',
  };
  return types[level] || 'ESCALATION_L1';
}

// =================================================================
//  FUNCION: getEscalationDescription
//  Genera una descripcion legible del nivel de escalacion
//  para incluir en las notificaciones SNS.
// =================================================================

function getEscalationDescription(level) {
  const descriptions = {
    1: 'Re-notificacion al equipo L1 - La aprobacion no ha sido respondida',
    2: 'Escalacion al equipo L2 - Se requiere atencion urgente',
    3: 'Escalacion a Administrador - Accion critica pendiente, posible auto-ejecucion',
  };
  return descriptions[level] || 'Escalacion desconocida';
}

// =================================================================
//  FUNCION: updateEscalationState
//  Actualiza el estado de escalacion en DynamoDB. Usa
//  ConditionExpression para evitar race conditions (si dos
//  invocaciones del Lambda procesan la misma aprobacion al
//  mismo tiempo, solo la primera tendra exito).
// =================================================================

async function updateEscalationState(approval, newLevel, autoExecuted) {
  const now = new Date().toISOString();
  const escalationType = getEscalationType(newLevel);

  // Construir el nuevo entry para el historial de escalaciones
  const historyEntry = {
    level: newLevel,
    type: escalationType,
    escalatedAt: now,
    autoExecuted: autoExecuted || false,
  };

  // Construir el historial actualizado
  const currentHistory = approval.escalationHistory || [];
  const updatedHistory = [...currentHistory, historyEntry];

  // Determinar el nuevo status si fue auto-escalado
  const newStatus = autoExecuted ? 'AUTO_ESCALATED' : 'PENDING';

  try {
    const updateExpression = autoExecuted
      ? 'SET escalationLevel = :level, lastEscalatedAt = :now, escalationHistory = :history, #status = :newStatus'
      : 'SET escalationLevel = :level, lastEscalatedAt = :now, escalationHistory = :history';

    const expressionAttributeValues = {
      ':level': newLevel,
      ':now': now,
      ':history': updatedHistory,
      ':currentLevel': approval.escalationLevel || 0,
      ':pending': 'PENDING',
    };

    // Si fue auto-ejecutado, incluir el nuevo status
    if (autoExecuted) {
      expressionAttributeValues[':newStatus'] = 'AUTO_ESCALATED';
    }

    await ddbDoc.send(new UpdateCommand({
      TableName: APPROVALS_TABLE,
      Key: { pk: `APPROVAL#${approval.approvalId}`, sk: 'PENDING' },
      UpdateExpression: updateExpression,
      // ConditionExpression: solo actualizar si sigue PENDING y el nivel
      // de escalacion es el esperado (evita race conditions)
      ConditionExpression: '#status = :pending AND (attribute_not_exists(escalationLevel) OR escalationLevel = :currentLevel)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: expressionAttributeValues,
    }));

    log.info('ESCALATION_STATE_UPDATED', {
      approvalId: approval.approvalId,
      newLevel,
      autoExecuted: autoExecuted || false,
    });

    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      // Otra invocacion ya proceso esta aprobacion — no es un error
      log.warn('ESCALATION_RACE_CONDITION', {
        approvalId: approval.approvalId,
        message: 'Otra invocacion ya actualizo esta aprobacion',
      });
      return false;
    }
    // Cualquier otro error se propaga
    log.error('ESCALATION_STATE_UPDATE_FAILED', {
      approvalId: approval.approvalId,
      error: err.message,
    });
    throw err;
  }
}

// =================================================================
//  FUNCION: publishEscalationNotification
//  Publica una notificacion SNS con los datos de la escalacion.
//  Incluye datos del breach original, tiempo transcurrido,
//  nivel de escalacion y estimacion de costo si esta disponible.
// =================================================================

async function publishEscalationNotification(approval, escalationLevel, elapsedMinutes) {
  if (!ALERTS_TOPIC_ARN) {
    log.warn('SNS_SKIP', { reason: 'ALERTS_TOPIC_ARN no configurado' });
    return;
  }

  const escalationType = getEscalationType(escalationLevel);
  const breach = approval.breach || {};

  const message = {
    type: escalationType,
    approvalId: approval.approvalId,
    // Datos del breach original
    metricName: breach.metricName || approval.metricName || 'desconocido',
    value: breach.value || approval.metricValue || 0,
    severity: breach.severity || approval.severity || 'UNKNOWN',
    systemId: breach.systemId || approval.systemId || 'desconocido',
    runbookId: approval.runbookId || breach.runbook || 'desconocido',
    // Datos de escalacion
    escalationLevel,
    escalationDescription: getEscalationDescription(escalationLevel),
    elapsedMinutes,
    elapsedFormatted: `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`,
    // Costo estimado si esta disponible
    costEstimate: approval.costEstimate || null,
    // Contexto adicional
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
    previousEscalations: (approval.escalationHistory || []).length,
    timestamp: new Date().toISOString(),
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: ALERTS_TOPIC_ARN,
      Subject: `Avvale SAP AlwaysOps ${escalationType}: ${message.systemId} - ${message.runbookId} (${elapsedMinutes} min sin respuesta)`,
      Message: JSON.stringify(message),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: escalationType },
        severity: { DataType: 'String', StringValue: message.severity },
        systemId: { DataType: 'String', StringValue: message.systemId },
      },
    }));

    log.info('ESCALATION_NOTIFICATION_SENT', {
      approvalId: approval.approvalId,
      escalationType,
      systemId: message.systemId,
      elapsedMinutes,
    });
  } catch (err) {
    log.error('ESCALATION_NOTIFICATION_FAILED', {
      approvalId: approval.approvalId,
      error: err.message,
    });
  }
}

// =================================================================
//  FUNCION: autoExecuteRunbook
//  Para escalaciones de Nivel 3, si el runbook es costSafe,
//  invoca el runbook-engine de forma SINCRONA para ejecutar
//  la accion automaticamente sin esperar aprobacion humana.
//  Esto es la ultima red de seguridad: si nadie responde en
//  2 horas y la accion es segura, el sistema actua solo.
// =================================================================

async function autoExecuteRunbook(approval) {
  if (!RUNBOOK_ENGINE_ARN) {
    log.warn('AUTO_EXECUTE_SKIP', {
      approvalId: approval.approvalId,
      reason: 'RUNBOOK_ENGINE_ARN no configurado',
    });
    return { executed: false, reason: 'RUNBOOK_ENGINE_ARN no configurado' };
  }

  const breach = approval.breach || {};

  const payload = {
    source: 'escalation-engine',
    action: 'execute-approved',
    breach,
    sid: approval.sid,
    approvalId: approval.approvalId,
    autoEscalated: true,
  };

  try {
    log.info('AUTO_EXECUTE_START', {
      approvalId: approval.approvalId,
      runbookId: approval.runbookId,
      systemId: approval.systemId,
    });

    // Invocacion SINCRONA: esperamos la respuesta para confirmar la ejecucion
    const response = await lambda.send(new InvokeCommand({
      FunctionName: RUNBOOK_ENGINE_ARN,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    }));

    const result = JSON.parse(Buffer.from(response.Payload).toString());

    log.info('AUTO_EXECUTE_COMPLETE', {
      approvalId: approval.approvalId,
      runbookId: approval.runbookId,
      result: result.statusCode || 'unknown',
    });

    return { executed: true, result };
  } catch (err) {
    log.error('AUTO_EXECUTE_FAILED', {
      approvalId: approval.approvalId,
      runbookId: approval.runbookId,
      error: err.message,
    });
    return { executed: false, reason: err.message };
  }
}

// =================================================================
//  FUNCION: processApprovalEscalation
//  Logica principal para procesar una sola aprobacion pendiente.
//  Determina si necesita escalacion, actualiza DynamoDB,
//  envia notificaciones y, si corresponde, auto-ejecuta.
// =================================================================

async function processApprovalEscalation(approval) {
  const elapsedMinutes = calculateElapsedMinutes(approval.createdAt);
  const currentLevel = approval.escalationLevel || 0;

  // Determinar si esta aprobacion necesita escalacion
  const newLevel = determineEscalationLevel(elapsedMinutes, currentLevel);

  if (newLevel === null) {
    // No necesita escalacion — el tiempo transcurrido no alcanza el siguiente nivel
    return { escalated: false, approvalId: approval.approvalId, reason: 'No requiere escalacion aun' };
  }

  log.info('ESCALATION_REQUIRED', {
    approvalId: approval.approvalId,
    systemId: approval.systemId,
    runbookId: approval.runbookId,
    currentLevel,
    newLevel,
    elapsedMinutes,
  });

  // --- Nivel 3: verificar si se puede auto-ejecutar ---
  let autoExecuted = false;
  let autoExecuteResult = null;

  if (newLevel === 3) {
    const breach = approval.breach || {};
    const isCostSafe = breach.costSafe === true;

    if (isCostSafe) {
      log.info('AUTO_EXECUTE_ELIGIBLE', {
        approvalId: approval.approvalId,
        runbookId: approval.runbookId,
        reason: 'Runbook es costSafe y alcanzo Nivel 3 sin respuesta',
      });

      // Ejecutar automaticamente
      autoExecuteResult = await autoExecuteRunbook(approval);
      autoExecuted = autoExecuteResult.executed;
    } else {
      log.info('AUTO_EXECUTE_NOT_ELIGIBLE', {
        approvalId: approval.approvalId,
        runbookId: approval.runbookId,
        reason: 'Runbook NO es costSafe, solo se notifica a Admin',
      });
    }
  }

  // Actualizar estado de escalacion en DynamoDB (con ConditionExpression)
  const updated = await updateEscalationState(approval, newLevel, autoExecuted);

  if (!updated) {
    // Race condition: otra invocacion ya proceso esta aprobacion
    return { escalated: false, approvalId: approval.approvalId, reason: 'Race condition - ya procesada' };
  }

  // Enviar notificacion SNS
  await publishEscalationNotification(approval, newLevel, elapsedMinutes);

  return {
    escalated: true,
    approvalId: approval.approvalId,
    systemId: approval.systemId,
    runbookId: approval.runbookId,
    previousLevel: currentLevel,
    newLevel,
    elapsedMinutes,
    autoExecuted,
    autoExecuteResult: autoExecuteResult || null,
  };
}

// ============================================================================
//  H30: INTELLIGENT NOTIFICATION ROUTING
//  Enrutamiento inteligente de notificaciones basado en severidad, horario,
//  entorno y tipo de evento. Determina QUIEN recibe la notificacion, por
//  CUAL canal, y si se debe escalar inmediatamente o agrupar en batch.
// ============================================================================

// ============================================================================
//  ROUTING_RULES — Reglas de enrutamiento inteligente
//  Cada regla define condiciones (severidad, horario, entorno, tipo de evento)
//  y la accion a tomar (canales, roles, escalacion inmediata, agrupacion).
//  Las reglas se evaluan por prioridad: menor numero = mayor prioridad.
// ============================================================================

const ROUTING_RULES = {
  // Reglas de enrutamiento basadas en condiciones
  rules: [
    {
      id: 'CASCADE_FAILURE',
      name: 'Fallo en cascada',
      conditions: {
        eventType: ['CASCADE_FAILURE', 'MULTI_SYSTEM_CORRELATION'],
      },
      channels: ['email', 'slack', 'teams', 'sms'],
      escalateImmediately: true,
      notifyRoles: ['ON_CALL', 'L2_MANAGER', 'L3_DIRECTOR'],
      priority: 0,
    },
    {
      id: 'CRITICAL_AFTER_HOURS',
      name: 'Criticos fuera de horario',
      conditions: {
        severity: ['CRITICAL'],
        timeWindow: { type: 'OUTSIDE_BUSINESS_HOURS' },
      },
      channels: ['email', 'slack', 'teams', 'sms'],
      escalateImmediately: true,
      notifyRoles: ['ON_CALL', 'L2_MANAGER'],
      priority: 1,
    },
    {
      id: 'CRITICAL_BUSINESS_HOURS',
      name: 'Criticos en horario laboral',
      conditions: {
        severity: ['CRITICAL'],
        timeWindow: { type: 'BUSINESS_HOURS' },
      },
      channels: ['email', 'slack', 'teams'],
      escalateImmediately: false,
      notifyRoles: ['L1_OPERATOR', 'L2_MANAGER'],
      priority: 2,
    },
    {
      id: 'HIGH_PRODUCTION',
      name: 'Altos en produccion',
      conditions: {
        severity: ['HIGH'],
        environment: ['PRD', 'PRODUCTION'],
      },
      channels: ['email', 'slack'],
      escalateImmediately: false,
      notifyRoles: ['L1_OPERATOR'],
      priority: 3,
    },
    {
      id: 'HIGH_NON_PROD',
      name: 'Altos en no-produccion',
      conditions: {
        severity: ['HIGH'],
        environment: ['QAS', 'DEV', 'SANDBOX'],
      },
      channels: ['email'],
      escalateImmediately: false,
      notifyRoles: ['L1_OPERATOR'],
      priority: 4,
    },
    {
      id: 'MEDIUM_BATCH',
      name: 'Medios agrupados',
      conditions: {
        severity: ['MEDIUM', 'LOW'],
      },
      channels: ['email'],
      batchNotifications: true,
      batchWindowMinutes: 30,
      notifyRoles: ['L1_OPERATOR'],
      priority: 5,
    },
  ],
};

// ============================================================================
//  NOTIFICATION_SCHEDULES — Horarios y rotacion on-call
//  Define las horas laborales para la zona horaria de Colombia (UTC-5)
//  y la rotacion de guardia. En produccion, la rotacion se obtiene del
//  SSM Parameter Store para permitir cambios sin redesplegar.
// ============================================================================

const NOTIFICATION_SCHEDULES = {
  timezone: 'America/Bogota',
  businessHours: { start: 7, end: 19 }, // 7 AM - 7 PM COT
  businessDays: [1, 2, 3, 4, 5],        // Lunes a Viernes (1=Lun, 5=Vie)
  onCallRotation: {
    // Se obtiene del SSM Parameter Store en produccion
    paramPath: '/sap-alwaysops/on-call-schedule',
    fallbackEmail: process.env.PRIMARY_APPROVER_EMAIL || 'oncall@empresa.com',
  },
};

// ============================================================================
//  FUNCION: isBusinessHours
//  Verifica si el momento actual cae dentro del horario laboral definido
//  en NOTIFICATION_SCHEDULES. Usa la zona horaria de Colombia (UTC-5)
//  para calcular la hora local sin depender de la config del servidor.
//
//  @returns {boolean} true si estamos dentro del horario laboral
// ============================================================================

function isBusinessHours() {
  const now = new Date();

  // Calcular la hora actual en la zona horaria de Colombia (UTC-5)
  // Usamos toLocaleString con la zona horaria para obtener la hora local correcta
  const colombiaTimeStr = now.toLocaleString('en-US', { timeZone: NOTIFICATION_SCHEDULES.timezone });
  const colombiaDate = new Date(colombiaTimeStr);

  const currentHour = colombiaDate.getHours();
  // getDay(): 0=Domingo, 1=Lunes, ... 6=Sabado
  const currentDay = colombiaDate.getDay();

  // Verificar si es dia laboral
  const isWorkDay = NOTIFICATION_SCHEDULES.businessDays.includes(currentDay);

  // Verificar si esta dentro del rango horario (start <= hora < end)
  const { start, end } = NOTIFICATION_SCHEDULES.businessHours;
  const isWorkHour = currentHour >= start && currentHour < end;

  return isWorkDay && isWorkHour;
}

// ============================================================================
//  FUNCION: evaluateRoutingRules
//  Evalua TODAS las reglas de enrutamiento contra un evento/alerta.
//  Retorna las reglas que coinciden, los canales agregados, los roles
//  y si se debe escalar inmediatamente.
//
//  @param {Object} event - El evento SNS o alerta a evaluar
//  @returns {Object} {
//    matchedRules: Array de reglas que coinciden (ordenadas por prioridad),
//    channels: Set de canales unicos a notificar,
//    roles: Set de roles unicos a notificar,
//    escalateImmediately: boolean si alguna regla requiere escalacion inmediata,
//    batchRequired: boolean si alguna regla requiere agrupacion,
//    batchWindowMinutes: number ventana de agrupacion mas corta
//  }
// ============================================================================

function evaluateRoutingRules(event) {
  // Extraer datos del evento para comparar contra las condiciones
  const eventSeverity = (event.severity || event.breach?.severity || '').toUpperCase();
  const eventEnvironment = (event.environment || event.breach?.environment || event.systemId || '').toUpperCase();
  const eventType = event.type || event.eventType || '';
  const currentlyBusinessHours = isBusinessHours();

  const matchedRules = [];

  for (const rule of ROUTING_RULES.rules) {
    let matches = true;
    const { conditions } = rule;

    // --- Verificar severidad ---
    if (conditions.severity && conditions.severity.length > 0) {
      if (!conditions.severity.includes(eventSeverity)) {
        matches = false;
      }
    }

    // --- Verificar ventana de tiempo (horario laboral vs fuera de horario) ---
    if (matches && conditions.timeWindow) {
      const { type: windowType } = conditions.timeWindow;
      if (windowType === 'BUSINESS_HOURS' && !currentlyBusinessHours) {
        matches = false;
      }
      if (windowType === 'OUTSIDE_BUSINESS_HOURS' && currentlyBusinessHours) {
        matches = false;
      }
    }

    // --- Verificar entorno ---
    if (matches && conditions.environment && conditions.environment.length > 0) {
      // Buscar si alguno de los entornos configurados esta contenido en el valor del evento
      const envMatch = conditions.environment.some(env =>
        eventEnvironment.includes(env.toUpperCase())
      );
      if (!envMatch) {
        matches = false;
      }
    }

    // --- Verificar tipo de evento ---
    if (matches && conditions.eventType && conditions.eventType.length > 0) {
      if (!conditions.eventType.includes(eventType)) {
        matches = false;
      }
    }

    // Si todas las condiciones coinciden, agregar la regla
    if (matches) {
      matchedRules.push(rule);
    }
  }

  // Ordenar por prioridad (menor numero = mayor prioridad)
  matchedRules.sort((a, b) => a.priority - b.priority);

  // Agregar canales y roles unicos de todas las reglas coincidentes
  const channels = new Set();
  const roles = new Set();
  let escalateImmediately = false;
  let batchRequired = false;
  let batchWindowMinutes = Infinity;

  for (const rule of matchedRules) {
    // Agregar canales
    for (const ch of rule.channels) {
      channels.add(ch);
    }
    // Agregar roles
    for (const role of rule.notifyRoles) {
      roles.add(role);
    }
    // Si alguna regla requiere escalacion inmediata, se aplica
    if (rule.escalateImmediately) {
      escalateImmediately = true;
    }
    // Si alguna regla requiere batch, registrar la ventana mas corta
    if (rule.batchNotifications) {
      batchRequired = true;
      batchWindowMinutes = Math.min(batchWindowMinutes, rule.batchWindowMinutes || 30);
    }
  }

  // Si hay escalacion inmediata, el batch no aplica (la urgencia tiene prioridad)
  if (escalateImmediately) {
    batchRequired = false;
  }

  return {
    matchedRules,
    channels,
    roles,
    escalateImmediately,
    batchRequired,
    batchWindowMinutes: batchRequired ? batchWindowMinutes : 0,
  };
}

// ============================================================================
//  FUNCION: buildNotificationPayload
//  Construye el payload formateado para cada canal de notificacion.
//  Cada canal tiene su propio formato: email (HTML), slack (Block Kit),
//  teams (Adaptive Card), sms (texto corto de 160 caracteres max).
//
//  @param {Object} event - El evento/alerta original
//  @param {Object} matchedRule - La regla de enrutamiento que coincidio
//  @returns {Object} Mapa de canal -> payload formateado
// ============================================================================

function buildNotificationPayload(event, matchedRule) {
  const breach = event.breach || event;
  const severity = breach.severity || event.severity || 'UNKNOWN';
  const systemId = breach.systemId || event.systemId || 'desconocido';
  const metricName = breach.metricName || event.metricName || 'desconocido';
  const value = breach.value || event.metricValue || event.value || 0;
  const runbookId = event.runbookId || breach.runbook || 'desconocido';
  const timestamp = new Date().toISOString();
  const ruleId = matchedRule.id;
  const ruleName = matchedRule.name;

  // Mapa de colores por severidad para los formatos visuales
  const severityColors = {
    CRITICAL: '#FF0000',
    HIGH: '#FF6600',
    MEDIUM: '#FFCC00',
    LOW: '#00CC00',
    UNKNOWN: '#808080',
  };
  const color = severityColors[severity] || severityColors.UNKNOWN;

  const payloads = {};

  // --- Payload para email: HTML formateado ---
  if (matchedRule.channels.includes('email')) {
    payloads.email = {
      subject: `[Avvale SAP AlwaysOps] [${severity}] ${systemId} - ${metricName}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <div style="background: ${color}; color: white; padding: 12px 16px; border-radius: 4px 4px 0 0;">
            <h2 style="margin: 0;">Avvale SAP AlwaysOps - Alerta ${severity}</h2>
          </div>
          <div style="border: 1px solid #ddd; border-top: none; padding: 16px; border-radius: 0 0 4px 4px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; font-weight: bold;">Sistema:</td><td style="padding: 8px;">${systemId}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Metrica:</td><td style="padding: 8px;">${metricName}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Valor:</td><td style="padding: 8px;">${value}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Severidad:</td><td style="padding: 8px;">${severity}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Runbook:</td><td style="padding: 8px;">${runbookId}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Regla:</td><td style="padding: 8px;">${ruleName} (${ruleId})</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Roles:</td><td style="padding: 8px;">${matchedRule.notifyRoles.join(', ')}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Fecha:</td><td style="padding: 8px;">${timestamp}</td></tr>
            </table>
          </div>
        </div>
      `,
      textBody: `Avvale SAP AlwaysOps [${severity}] - Sistema: ${systemId}, Metrica: ${metricName}, Valor: ${value}, Runbook: ${runbookId}`,
    };
  }

  // --- Payload para Slack: Block Kit JSON ---
  if (matchedRule.channels.includes('slack')) {
    payloads.slack = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Avvale SAP AlwaysOps - Alerta ${severity}`, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Sistema:*\n${systemId}` },
            { type: 'mrkdwn', text: `*Severidad:*\n${severity}` },
            { type: 'mrkdwn', text: `*Metrica:*\n${metricName}` },
            { type: 'mrkdwn', text: `*Valor:*\n${value}` },
            { type: 'mrkdwn', text: `*Runbook:*\n${runbookId}` },
            { type: 'mrkdwn', text: `*Regla:*\n${ruleName}` },
          ],
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Roles: ${matchedRule.notifyRoles.join(', ')} | ${timestamp}` },
          ],
        },
      ],
      // Color lateral del attachment (Slack legacy pero aun funcional)
      attachmentColor: color,
    };
  }

  // --- Payload para Microsoft Teams: Adaptive Card JSON ---
  if (matchedRule.channels.includes('teams')) {
    payloads.teams = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              {
                type: 'TextBlock',
                text: `Avvale SAP AlwaysOps - Alerta ${severity}`,
                weight: 'Bolder',
                size: 'Large',
                color: severity === 'CRITICAL' ? 'Attention' : severity === 'HIGH' ? 'Warning' : 'Default',
              },
              {
                type: 'FactSet',
                facts: [
                  { title: 'Sistema', value: systemId },
                  { title: 'Metrica', value: metricName },
                  { title: 'Valor', value: String(value) },
                  { title: 'Severidad', value: severity },
                  { title: 'Runbook', value: runbookId },
                  { title: 'Regla', value: `${ruleName} (${ruleId})` },
                  { title: 'Roles', value: matchedRule.notifyRoles.join(', ') },
                  { title: 'Fecha', value: timestamp },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  // --- Payload para SMS: texto corto (maximo 160 caracteres) ---
  if (matchedRule.channels.includes('sms')) {
    // Construir mensaje compacto que quepa en 160 caracteres
    const smsBase = `Avvale SAP AlwaysOps [${severity}] ${systemId}: ${metricName}=${value}`;
    payloads.sms = {
      message: smsBase.length > 160 ? smsBase.substring(0, 157) + '...' : smsBase,
    };
  }

  return payloads;
}

// ============================================================================
//  NOTIFICATION_BATCH — Logica de agrupacion de notificaciones
//  Para alertas de severidad MEDIUM/LOW, en vez de enviar una notificacion
//  por cada alerta, las agrupa en un solo digest que se envia cada 30 min.
//  Usa la tabla de aprobaciones existente (APPROVALS_TABLE) con un prefijo
//  de PK 'NOTIF_BATCH#' para almacenar las notificaciones pendientes.
// ============================================================================

/**
 * Almacena una notificacion en el batch para envio agrupado posterior.
 * Se guarda en DynamoDB con un TTL para limpieza automatica.
 *
 * @param {Object} event - El evento/alerta original
 * @param {Object} routingResult - Resultado de evaluateRoutingRules
 * @param {Object} payloads - Payloads generados por buildNotificationPayload
 * @returns {Promise<boolean>} true si se almaceno correctamente
 */
async function storeBatchNotification(event, routingResult, payloads) {
  const now = new Date();
  const batchId = `${now.toISOString().slice(0, 13)}`; // Agrupamos por hora (YYYY-MM-DDTHH)
  const notificationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // TTL: expirar despues de 24 horas para limpieza automatica
  const ttl = Math.floor(now.getTime() / 1000) + (24 * 60 * 60);

  const item = {
    pk: `NOTIF_BATCH#${batchId}`,
    sk: `ALERT#${notificationId}`,
    type: 'BATCH_NOTIFICATION',
    severity: event.severity || event.breach?.severity || 'UNKNOWN',
    systemId: event.systemId || event.breach?.systemId || 'desconocido',
    metricName: event.metricName || event.breach?.metricName || 'desconocido',
    value: event.value || event.breach?.value || 0,
    channels: [...routingResult.channels],
    roles: [...routingResult.roles],
    payloads,
    createdAt: now.toISOString(),
    batchWindowMinutes: routingResult.batchWindowMinutes,
    ttl,
  };

  try {
    await ddbDoc.send(new PutCommand({
      TableName: APPROVALS_TABLE,
      Item: item,
    }));

    log.info('H30_BATCH_STORED', {
      batchId,
      notificationId,
      severity: item.severity,
      systemId: item.systemId,
      batchWindowMinutes: routingResult.batchWindowMinutes,
    });

    return true;
  } catch (err) {
    log.error('H30_BATCH_STORE_FAILED', {
      batchId,
      notificationId,
      error: err.message,
    });
    return false;
  }
}

/**
 * Busca notificaciones agrupadas cuya ventana de batch ya expiro
 * y las envia como un digest consolidado.
 *
 * @returns {Promise<number>} Numero de notificaciones enviadas en el digest
 */
async function processPendingBatches() {
  const now = new Date();

  try {
    // v1.5 — Query via GSI 'type-index' (PK: type = 'BATCH_NOTIFICATION') en lugar de Scan.
    // Todos los batch notifications se escriben con type='BATCH_NOTIFICATION'.
    const result = await ddbDoc.send(new QueryCommand({
      TableName: APPROVALS_TABLE,
      IndexName: 'type-index',
      KeyConditionExpression: '#type = :type',
      ExpressionAttributeNames: { '#type': 'type' },
      ExpressionAttributeValues: {
        ':type': 'BATCH_NOTIFICATION',
      },
    }));

    const items = result.Items || [];
    if (items.length === 0) {
      return 0;
    }

    // Agrupar por batchId (pk)
    const batches = {};
    for (const item of items) {
      if (!batches[item.pk]) {
        batches[item.pk] = [];
      }
      batches[item.pk].push(item);
    }

    let sentCount = 0;

    for (const [batchId, notifications] of Object.entries(batches)) {
      // Verificar si la ventana de batch ya expiro
      // Usamos la notificacion mas antigua del batch como referencia
      const oldest = notifications.reduce((prev, curr) =>
        new Date(prev.createdAt) < new Date(curr.createdAt) ? prev : curr
      );
      const batchAge = (now.getTime() - new Date(oldest.createdAt).getTime()) / (1000 * 60);
      const windowMinutes = oldest.batchWindowMinutes || 30;

      if (batchAge < windowMinutes) {
        // La ventana de batch aun no expira, saltar
        log.info('H30_BATCH_PENDING', {
          batchId,
          count: notifications.length,
          ageMinutes: Math.round(batchAge),
          windowMinutes,
        });
        continue;
      }

      // La ventana expiro: enviar el digest
      log.info('H30_BATCH_SENDING_DIGEST', {
        batchId,
        count: notifications.length,
        ageMinutes: Math.round(batchAge),
      });

      // Construir el digest consolidado
      const digestSubject = `[Avvale SAP AlwaysOps] Digest: ${notifications.length} alertas agrupadas`;
      const digestItems = notifications.map(n =>
        `- [${n.severity}] ${n.systemId}: ${n.metricName} = ${n.value}`
      ).join('\n');

      const digestMessage = {
        type: 'NOTIFICATION_DIGEST',
        batchId,
        count: notifications.length,
        summary: digestItems,
        notifications: notifications.map(n => ({
          severity: n.severity,
          systemId: n.systemId,
          metricName: n.metricName,
          value: n.value,
        })),
        timestamp: now.toISOString(),
      };

      // Publicar al topico SNS si esta configurado
      if (ALERTS_TOPIC_ARN) {
        try {
          await sns.send(new PublishCommand({
            TopicArn: ALERTS_TOPIC_ARN,
            Subject: digestSubject,
            Message: JSON.stringify(digestMessage),
            MessageAttributes: {
              eventType: { DataType: 'String', StringValue: 'NOTIFICATION_DIGEST' },
            },
          }));
          sentCount += notifications.length;
        } catch (err) {
          log.error('H30_BATCH_DIGEST_SEND_FAILED', {
            batchId,
            error: err.message,
          });
          continue; // No eliminar los items si fallo el envio
        }
      }

      // Eliminar las notificaciones ya enviadas del batch
      for (const notification of notifications) {
        try {
          await ddbDoc.send(new UpdateCommand({
            TableName: APPROVALS_TABLE,
            Key: { pk: notification.pk, sk: notification.sk },
            UpdateExpression: 'SET #type = :sent, sentAt = :now',
            ExpressionAttributeNames: { '#type': 'type' },
            ExpressionAttributeValues: {
              ':sent': 'BATCH_SENT',
              ':now': now.toISOString(),
            },
          }));
        } catch (err) {
          log.warn('H30_BATCH_CLEANUP_FAILED', {
            pk: notification.pk,
            sk: notification.sk,
            error: err.message,
          });
        }
      }
    }

    log.info('H30_BATCH_PROCESSING_COMPLETE', {
      totalBatches: Object.keys(batches).length,
      totalNotificationsSent: sentCount,
    });

    return sentCount;
  } catch (err) {
    log.error('H30_BATCH_PROCESSING_FAILED', { error: err.message });
    return 0;
  }
}

// ============================================================================
//  FUNCION: routeNotification
//  Funcion principal de enrutamiento inteligente. Orquesta todo el flujo:
//    1. Evalua las reglas de enrutamiento contra el evento
//    2. Para cada canal coincidente, construye el payload
//    3. Si se requiere batch, almacena para envio agrupado
//    4. Si no, publica al topico SNS / invoca Lambda segun el canal
//    5. Registra la decision de enrutamiento para auditoria
//
//  @param {Object} event - El evento/alerta a enrutar
//  @returns {Promise<Object>} Resultado del enrutamiento con detalles
// ============================================================================

async function routeNotification(event) {
  // --- Paso 1: Evaluar reglas de enrutamiento ---
  const routingResult = evaluateRoutingRules(event);

  log.info('H30_ROUTING_EVALUATION', {
    matchedRules: routingResult.matchedRules.map(r => r.id),
    channels: [...routingResult.channels],
    roles: [...routingResult.roles],
    escalateImmediately: routingResult.escalateImmediately,
    batchRequired: routingResult.batchRequired,
    batchWindowMinutes: routingResult.batchWindowMinutes,
  });

  // Si no hay reglas coincidentes, no hacer nada
  if (routingResult.matchedRules.length === 0) {
    log.info('H30_NO_MATCHING_RULES', {
      severity: event.severity || event.breach?.severity,
      eventType: event.type || event.eventType,
    });
    return {
      routed: false,
      reason: 'No hay reglas de enrutamiento coincidentes',
      routingResult,
    };
  }

  // --- Paso 2: Construir payloads para cada regla coincidente ---
  const allPayloads = {};
  for (const rule of routingResult.matchedRules) {
    const payloads = buildNotificationPayload(event, rule);
    // Mezclar payloads (si multiples reglas usan el mismo canal, el de mayor prioridad gana)
    for (const [channel, payload] of Object.entries(payloads)) {
      if (!allPayloads[channel]) {
        allPayloads[channel] = payload;
      }
    }
  }

  // --- Paso 3: Si se requiere batch, almacenar para envio agrupado ---
  if (routingResult.batchRequired && !routingResult.escalateImmediately) {
    const stored = await storeBatchNotification(event, routingResult, allPayloads);
    return {
      routed: true,
      batched: true,
      batchStored: stored,
      batchWindowMinutes: routingResult.batchWindowMinutes,
      routingResult,
    };
  }

  // --- Paso 4: Envio inmediato — publicar al topico SNS con metadata de enrutamiento ---
  const sendResults = {};

  if (ALERTS_TOPIC_ARN) {
    for (const channel of routingResult.channels) {
      const payload = allPayloads[channel];
      if (!payload) continue;

      try {
        const routingMessage = {
          type: 'INTELLIGENT_ROUTING',
          channel,
          roles: [...routingResult.roles],
          escalateImmediately: routingResult.escalateImmediately,
          matchedRuleIds: routingResult.matchedRules.map(r => r.id),
          payload,
          originalEvent: {
            severity: event.severity || event.breach?.severity,
            systemId: event.systemId || event.breach?.systemId,
            metricName: event.metricName || event.breach?.metricName,
          },
          timestamp: new Date().toISOString(),
        };

        await sns.send(new PublishCommand({
          TopicArn: ALERTS_TOPIC_ARN,
          Subject: `Avvale SAP AlwaysOps [${channel.toUpperCase()}]: ${event.severity || 'ALERT'} - ${event.systemId || 'sistema'}`,
          Message: JSON.stringify(routingMessage),
          MessageAttributes: {
            eventType: { DataType: 'String', StringValue: 'INTELLIGENT_ROUTING' },
            channel: { DataType: 'String', StringValue: channel },
            severity: { DataType: 'String', StringValue: String(event.severity || event.breach?.severity || 'UNKNOWN') },
          },
        }));

        sendResults[channel] = { sent: true };
        log.info('H30_CHANNEL_NOTIFIED', { channel, roles: [...routingResult.roles] });
      } catch (err) {
        sendResults[channel] = { sent: false, error: err.message };
        log.error('H30_CHANNEL_NOTIFICATION_FAILED', { channel, error: err.message });
      }
    }
  } else {
    log.warn('H30_SNS_SKIP', { reason: 'ALERTS_TOPIC_ARN no configurado' });
  }

  // --- Paso 5: Registrar decision de enrutamiento para auditoria ---
  log.info('H30_ROUTING_COMPLETE', {
    routed: true,
    channels: [...routingResult.channels],
    roles: [...routingResult.roles],
    escalateImmediately: routingResult.escalateImmediately,
    matchedRuleIds: routingResult.matchedRules.map(r => r.id),
    sendResults,
  });

  return {
    routed: true,
    batched: false,
    channels: [...routingResult.channels],
    roles: [...routingResult.roles],
    escalateImmediately: routingResult.escalateImmediately,
    sendResults,
    routingResult,
  };
}

// =================================================================
//  HANDLER PRINCIPAL
//  Punto de entrada del Lambda. Se ejecuta cada 10 minutos
//  via EventBridge. Escanea aprobaciones pendientes y aplica
//  el esquema de escalacion de 3 niveles.
// =================================================================

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('INVOKE', {
    source: event.source || 'eventbridge',
    escalationConfig: {
      L1: `${ESCALATION_L1_MINUTES} min`,
      L2: `${ESCALATION_L2_MINUTES} min`,
      L3: `${ESCALATION_L3_MINUTES} min`,
    },
  });

  const startTime = Date.now();

  try {
    // --- Paso 1: Escanear aprobaciones pendientes ---
    const pendingApprovals = await scanPendingApprovals();

    if (pendingApprovals.length === 0) {
      log.info('NO_PENDING', { message: 'No hay aprobaciones pendientes' });

      const duration = Date.now() - startTime;
      return {
        statusCode: 200,
        body: {
          message: 'Avvale SAP AlwaysOps Escalation Engine v1.0 - Sin aprobaciones pendientes',
          duration: `${duration}ms`,
          escalated: 0,
        },
      };
    }

    // --- Paso 2: Filtrar aprobaciones que NO esten expiradas ---
    const now = new Date();
    const validApprovals = pendingApprovals.filter(approval => {
      // Solo procesar aprobaciones que siguen dentro de su ventana de validez
      if (approval.expiresAt && new Date(approval.expiresAt) < now) {
        log.info('SKIP_EXPIRED', {
          approvalId: approval.approvalId,
          expiresAt: approval.expiresAt,
        });
        return false;
      }
      return true;
    });

    log.info('VALID_APPROVALS', {
      total: pendingApprovals.length,
      valid: validApprovals.length,
      expired: pendingApprovals.length - validApprovals.length,
    });

    // --- Paso 3: Aplicar rate limiting ---
    // Solo procesar un maximo de MAX_ESCALATIONS_PER_INVOCATION por invocacion
    // para evitar flooding de notificaciones
    const toProcess = validApprovals.slice(0, MAX_ESCALATIONS_PER_INVOCATION);

    if (validApprovals.length > MAX_ESCALATIONS_PER_INVOCATION) {
      log.warn('RATE_LIMITED', {
        totalValid: validApprovals.length,
        processing: MAX_ESCALATIONS_PER_INVOCATION,
        deferred: validApprovals.length - MAX_ESCALATIONS_PER_INVOCATION,
      });
    }

    // --- Paso 4: Procesar cada aprobacion ---
    const results = [];
    // H30: Acumulador para resultados de enrutamiento inteligente
    const h30RoutingResults = [];

    for (const approval of toProcess) {
      try {
        // ---------------------------------------------------------
        // v1.0 — H35: Trial Mode — solo escalación L1
        // En trial, limitar a un solo nivel de escalación
        // ---------------------------------------------------------
        try {
          const approvalSystemId = approval.breach?.systemId || approval.systemId;
          if (approvalSystemId) {
            const trialConfig = await getTrialConfig(approvalSystemId);
            if (trialConfig.mode === 'TRIAL' && trialConfig.escalationLevels === 1) {
              const elapsedMin = calculateElapsedMinutes(approval.createdAt);
              const currentLvl = approval.escalationLevel || 0;
              const targetLvl = determineEscalationLevel(elapsedMin, currentLvl);

              // En trial, si el nivel objetivo es > 1, omitir la escalación L2/L3
              if (targetLvl !== null && targetLvl > 1) {
                log.info('TRIAL_ESCALATION_SKIP', {
                  approvalId: approval.approvalId,
                  targetLevel: targetLvl,
                  reason: `Modo TRIAL: solo permite escalación L1 (max ${trialConfig.escalationLevels} nivel)`,
                });
                results.push({
                  escalated: false,
                  approvalId: approval.approvalId,
                  reason: `Trial mode: escalación L${targetLvl} omitida — solo L1 permitido`,
                  mode: 'TRIAL',
                });
                continue; // Saltar al siguiente approval
              }
            }
          }
        } catch (trialErr) {
          // No-bloqueante: si falla el check de trial, continuar con escalación normal
          log.warn('TRIAL_CHECK_ERROR', { approvalId: approval.approvalId, error: trialErr.message });
        }

        // ---------------------------------------------------------
        // v1.0 — H30: Intelligent Notification Routing
        // Antes de la logica de escalacion existente, evaluar las
        // reglas de enrutamiento inteligente para determinar canales
        // y roles. Envuelto en try-catch para que sea no-bloqueante.
        // ---------------------------------------------------------
        try {
          const routingEvent = {
            severity: approval.breach?.severity || approval.severity,
            environment: approval.breach?.environment || approval.environment,
            systemId: approval.breach?.systemId || approval.systemId,
            metricName: approval.breach?.metricName || approval.metricName,
            value: approval.breach?.value || approval.metricValue,
            type: approval.breach?.type || approval.type,
            eventType: approval.breach?.eventType || approval.eventType,
            runbookId: approval.runbookId,
            breach: approval.breach,
          };

          const routingResult = evaluateRoutingRules(routingEvent);
          log.info('H30 Routing evaluation', { matchedRules: routingResult.matchedRules.length, channels: [...routingResult.channels] });

          // Si hay reglas coincidentes, ejecutar el enrutamiento completo
          if (routingResult.matchedRules.length > 0) {
            const routeResult = await routeNotification(routingEvent);
            h30RoutingResults.push({
              approvalId: approval.approvalId,
              ...routeResult,
            });
          }
        } catch (h30Err) {
          // H30 es no-bloqueante: si falla, solo loguear y continuar
          log.warn('H30_ROUTING_ERROR', {
            approvalId: approval.approvalId,
            error: h30Err.message,
          });
        }

        // Logica de escalacion existente (no se modifica)
        const result = await processApprovalEscalation(approval);
        results.push(result);
      } catch (err) {
        log.error('ESCALATION_PROCESSING_ERROR', {
          approvalId: approval.approvalId,
          error: err.message,
        });
        results.push({
          escalated: false,
          approvalId: approval.approvalId,
          error: err.message,
        });
      }
    }

    // ---------------------------------------------------------
    // v1.0 — H30: Procesar batches de notificaciones pendientes
    // Cada invocacion tambien verifica si hay batches acumulados
    // cuya ventana ya expiro para enviar el digest.
    // ---------------------------------------------------------
    let h30BatchesSent = 0;
    try {
      h30BatchesSent = await processPendingBatches();
      if (h30BatchesSent > 0) {
        log.info('H30_BATCHES_SENT', { count: h30BatchesSent });
      }
    } catch (h30BatchErr) {
      // No-bloqueante: si falla el batch, solo loguear
      log.warn('H30_BATCH_ERROR', { error: h30BatchErr.message });
    }

    // --- Paso 5: Resumen final ---
    const escalated = results.filter(r => r.escalated);
    const autoExecuted = results.filter(r => r.autoExecuted);
    const failed = results.filter(r => r.error);

    const duration = Date.now() - startTime;

    log.info('COMPLETE', {
      duration: `${duration}ms`,
      totalPending: pendingApprovals.length,
      totalValid: validApprovals.length,
      processed: toProcess.length,
      escalated: escalated.length,
      autoExecuted: autoExecuted.length,
      failed: failed.length,
      rateLimited: validApprovals.length > MAX_ESCALATIONS_PER_INVOCATION,
      // H30: Resumen de enrutamiento inteligente
      h30: {
        routingProcessed: h30RoutingResults.length,
        routingRouted: h30RoutingResults.filter(r => r.routed).length,
        routingBatched: h30RoutingResults.filter(r => r.batched).length,
        batchDigestsSent: h30BatchesSent,
      },
    });

    return {
      statusCode: 200,
      body: {
        message: 'Avvale SAP AlwaysOps Escalation Engine v1.0 completado',
        duration: `${duration}ms`,
        summary: {
          totalPending: pendingApprovals.length,
          validApprovals: validApprovals.length,
          processed: toProcess.length,
          escalated: escalated.length,
          autoExecuted: autoExecuted.length,
          failed: failed.length,
          rateLimited: validApprovals.length > MAX_ESCALATIONS_PER_INVOCATION,
          // H30: Resumen de enrutamiento inteligente en la respuesta
          h30IntelligentRouting: {
            routingProcessed: h30RoutingResults.length,
            routingRouted: h30RoutingResults.filter(r => r.routed).length,
            routingBatched: h30RoutingResults.filter(r => r.batched).length,
            batchDigestsSent: h30BatchesSent,
          },
        },
        results,
      },
    };

  } catch (err) {
    log.error('FATAL', { error: err.message, stack: err.stack });

    return {
      statusCode: 500,
      body: { error: err.message },
    };
  }
};
