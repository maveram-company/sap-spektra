'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Approval Gateway
//  Gateway de aprobaciones para acciones con costo o riesgo.
//
//  ¿Qué hace este Lambda?
//  Cuando el runbook-engine encuentra un breach que requiere
//  aprobación humana (como expandir discos que cuestan dinero),
//  este Lambda crea una solicitud de aprobación, la guarda en
//  DynamoDB, y notifica al equipo. Cuando alguien aprueba o
//  rechaza via API Gateway, ejecuta la acción correspondiente.
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');
const log = require('../utilidades/logger')('approval-gateway');

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// Clientes de AWS
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});
const sns = new SNSClient({});

// Configuración
const APPROVALS_TABLE = process.env.APPROVALS_TABLE || 'sap-alwaysops-approvals';
const APPROVAL_TIMEOUT_HOURS = parseInt(process.env.APPROVAL_TIMEOUT_HOURS || '4');

// v2.0 — Seguridad: APPROVAL_SECRET DEBE estar en env (SecretsManager → Lambda env var).
// Eliminado el fallback hardcodeado para evitar uso del secreto por defecto en producción.
const APPROVAL_SECRET = process.env.APPROVAL_SECRET;
if (!APPROVAL_SECRET) {
  log.error('APPROVAL_SECRET env var no configurada. La Lambda no puede arrancar sin este secreto.');
  throw new Error('APPROVAL_SECRET environment variable is required. Configure it via SecretsManager in CloudFormation.');
}

// H27 — Delegation: tabla para delegaciones de aprobación
const DELEGATIONS_TABLE = process.env.DELEGATIONS_TABLE || 'sap-alwaysops-delegations';

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generateToken
//  Crea un token HMAC seguro para validar las aprobaciones.
//  Esto evita que alguien apruebe sin autorización.
// ═══════════════════════════════════════════════════════════════

function generateToken(approvalId, expiresAt) {
  return crypto
    .createHmac('sha256', APPROVAL_SECRET)
    .update(`${approvalId}:${expiresAt}`)
    .digest('hex');
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: generateApprovalId
//  Genera un ID único para cada solicitud de aprobación.
// ═══════════════════════════════════════════════════════════════

function generateApprovalId() {
  return crypto.randomUUID();
}

// ═══════════════════════════════════════════════════════════════
//  H27 — FUNCIONES DE DELEGACIÓN DE APROBACIONES
//  Permiten que un aprobador delegue sus aprobaciones a otro
//  usuario cuando está ausente (vacaciones, licencia, etc.).
// ═══════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────
//  FUNCIÓN: createDelegation
//  Crea una nueva delegación en DynamoDB. El delegador (quien
//  normalmente aprueba) indica quién lo reemplaza, en qué rango
//  de fechas y por qué motivo.
// ───────────────────────────────────────────────────────────────

async function createDelegation(delegatorEmail, delegateEmail, startDate, endDate, reason) {
  // Validar que no se delegue a sí mismo
  if (delegatorEmail === delegateEmail) {
    return { success: false, error: 'No puedes delegarte a ti mismo' };
  }

  const createdAt = new Date().toISOString();
  const delegationId = `${startDate}#${delegateEmail}`;

  const item = {
    pk: `DELEGATION#${delegatorEmail}`,
    sk: delegationId,
    delegatorEmail,
    delegateEmail,
    startDate,
    endDate,
    reason: reason || 'Sin motivo especificado',
    active: true,
    createdAt,
  };

  await ddbDoc.send(new PutCommand({
    TableName: DELEGATIONS_TABLE,
    Item: item,
  }));

  log.info('Delegación creada', { delegatorEmail, delegateEmail, startDate, endDate });

  return { success: true, delegation: item };
}

// ───────────────────────────────────────────────────────────────
//  FUNCIÓN: getActiveDelegation
//  Busca si el aprobador tiene una delegación activa vigente
//  (es decir, la fecha actual cae entre startDate y endDate).
//  Retorna el email del delegado si existe, o null si no.
// ───────────────────────────────────────────────────────────────

async function getActiveDelegation(approverEmail) {
  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: DELEGATIONS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': `DELEGATION#${approverEmail}`,
      },
    }));

    const now = new Date().toISOString().split('T')[0]; // formato YYYY-MM-DD

    // Buscar la primera delegación activa cuya fecha actual esté en el rango
    const activeDelegation = (result.Items || []).find(item =>
      item.active === true &&
      now >= item.startDate &&
      now <= item.endDate
    );

    if (activeDelegation) {
      log.info('Delegación activa encontrada', { approverEmail, delegateEmail: activeDelegation.delegateEmail });
      return activeDelegation;
    }

    return null;
  } catch (err) {
    log.error('Error buscando delegación activa', { error: err.message });
    return null;
  }
}

// ───────────────────────────────────────────────────────────────
//  FUNCIÓN: listDelegations
//  Lista todas las delegaciones de un email, tanto las que
//  creó (como delegador) como las que recibió (como delegado).
// ───────────────────────────────────────────────────────────────

async function listDelegations(email) {
  try {
    // 1. Delegaciones donde el usuario es el DELEGADOR (buscar por PK)
    const asDelegator = await ddbDoc.send(new QueryCommand({
      TableName: DELEGATIONS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': `DELEGATION#${email}`,
      },
    }));

    // 2. Delegaciones donde el usuario es el DELEGADO
    // v1.5 — Query via GSI 'delegate-email-index' (PK: delegateEmail) en lugar de Scan.
    const asDelegate = await ddbDoc.send(new QueryCommand({
      TableName: DELEGATIONS_TABLE,
      IndexName: 'delegate-email-index',
      KeyConditionExpression: 'delegateEmail = :email',
      ExpressionAttributeValues: {
        ':email': email,
      },
    }));

    const delegations = {
      asDelegator: asDelegator.Items || [],
      asDelegate: asDelegate.Items || [],
    };

    log.info('Delegaciones listadas', { email, asDelegatorCount: delegations.asDelegator.length, asDelegateCount: delegations.asDelegate.length });

    return delegations;
  } catch (err) {
    log.error('Error listando delegaciones', { error: err.message });
    return { asDelegator: [], asDelegate: [] };
  }
}

// ───────────────────────────────────────────────────────────────
//  FUNCIÓN: revokeDelegation
//  Marca una delegación como inactiva. El delegador puede
//  revocar su propia delegación si regresa antes de tiempo.
// ───────────────────────────────────────────────────────────────

async function revokeDelegation(delegatorEmail, delegationId) {
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: DELEGATIONS_TABLE,
      Key: { pk: `DELEGATION#${delegatorEmail}`, sk: delegationId },
      UpdateExpression: 'SET active = :inactive, revokedAt = :now',
      ConditionExpression: 'active = :active',
      ExpressionAttributeValues: {
        ':inactive': false,
        ':active': true,
        ':now': new Date().toISOString(),
      },
    }));

    log.info('Delegación revocada', { delegatorEmail, delegationId });
    return { success: true, message: 'Delegación revocada exitosamente' };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return { success: false, error: 'La delegación ya está inactiva o no existe' };
    }
    log.error('Error revocando delegación', { error: err.message });
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: createApproval
//  Crea una nueva solicitud de aprobación en DynamoDB y
//  notifica al equipo por SNS.
// ═══════════════════════════════════════════════════════════════

async function createApproval(breach, commands, sid, env, costEstimate, adaptation) {
  const approvalId = generateApprovalId();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + APPROVAL_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();
  const token = generateToken(approvalId, expiresAt);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 días de retención

  const item = {
    pk: `APPROVAL#${approvalId}`,
    sk: 'PENDING',
    approvalId,
    status: 'PENDING',
    breach,
    commands,
    sid,
    env,
    systemId: breach.systemId,
    runbookId: breach.runbook,
    severity: breach.severity,
    metricName: breach.metricName,
    metricValue: breach.value,
    costEstimate: costEstimate || { costUsd: 0, description: 'Costo no estimado' },
    adaptation: adaptation || null,
    safetyGateDecision: breach.safetyGateDecision || null,
    safetyGateReason: breach.safetyGateReason || null,
    token,
    createdAt,
    expiresAt,
    ttl,
  };

  // ─── H27: Verificar si el aprobador principal tiene una delegación activa ───
  const primaryApprover = process.env.PRIMARY_APPROVER_EMAIL || null;

  if (primaryApprover) {
    const activeDelegation = await getActiveDelegation(primaryApprover);
    if (activeDelegation) {
      item.delegatedTo = activeDelegation.delegateEmail;
      item.delegatedFrom = primaryApprover;
      item.delegationReason = activeDelegation.reason;
      log.info('Aprobación delegada', { approvalId, delegatedFrom: primaryApprover, delegatedTo: activeDelegation.delegateEmail });
    }
  }

  // Guardar en DynamoDB
  await ddbDoc.send(new PutCommand({
    TableName: APPROVALS_TABLE,
    Item: item,
  }));

  log.info('Solicitud creada', { approvalId, runbook: breach.runbook, expiresAt });

  // Notificar al equipo por SNS para que reciban email/Teams
  await notifyApprovalRequest(item);

  return { approvalId, token, expiresAt, delegatedTo: item.delegatedTo || null };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: processApproval
//  Procesa una aprobación o rechazo. Valida el token,
//  verifica que no haya expirado, y ejecuta la acción.
// ═══════════════════════════════════════════════════════════════

async function processApproval(approvalId, token, action, approvedBy) {
  // Buscar la solicitud en DynamoDB
  const result = await ddbDoc.send(new GetCommand({
    TableName: APPROVALS_TABLE,
    Key: { pk: `APPROVAL#${approvalId}`, sk: 'PENDING' },
  }));

  const approval = result.Item;

  if (!approval) {
    log.warn('Solicitud no encontrada o ya procesada', { approvalId });
    return { success: false, error: 'Solicitud no encontrada o ya fue procesada' };
  }

  // Validar token
  if (approval.token !== token) {
    log.warn('Token inválido', { approvalId });
    return { success: false, error: 'Token de aprobación inválido' };
  }

  // Verificar que no haya expirado
  if (new Date() > new Date(approval.expiresAt)) {
    log.warn('Solicitud expirada', { approvalId });

    // Marcar como expirada
    await updateApprovalStatus(approvalId, 'EXPIRED');
    return { success: false, error: 'La solicitud de aprobación ha expirado' };
  }

  // Procesar según la acción — usar conditional write para evitar race conditions
  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
  const updated = await updateApprovalStatus(approvalId, newStatus, approvedBy);

  if (!updated) {
    log.warn('Race condition: solicitud ya procesada', { approvalId });
    return { success: false, error: 'Esta solicitud ya fue procesada por otra persona' };
  }

  log.info('Solicitud procesada', { approvalId, status: newStatus, processedBy: approvedBy || 'anónimo' });

  // Si fue aprobada, invocar el runbook-engine para ejecutar
  if (action === 'approve') {
    await executeApprovedRunbook(approval);
  }

  // Notificar el resultado
  await notifyApprovalResult(approval, newStatus, approvedBy);

  return {
    success: true,
    approvalId,
    status: newStatus,
    runbookId: approval.runbookId,
    systemId: approval.systemId,
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: updateApprovalStatus
//  Actualiza el estado de una solicitud en DynamoDB.
//  Crea un nuevo registro con el nuevo estado y elimina el PENDING.
// ═══════════════════════════════════════════════════════════════

async function updateApprovalStatus(approvalId, newStatus, approvedBy) {
  // Usar UpdateItem con ConditionExpression para evitar race conditions.
  // Solo actualiza si el status actual es PENDING. Si dos personas clickean
  // al mismo tiempo, solo la primera tendrá éxito.
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: APPROVALS_TABLE,
      Key: { pk: `APPROVAL#${approvalId}`, sk: 'PENDING' },
      UpdateExpression: 'SET #status = :newStatus, processedAt = :now, processedBy = :by',
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':newStatus': newStatus,
        ':pending': 'PENDING',
        ':now': new Date().toISOString(),
        ':by': approvedBy || 'sistema',
      },
    }));

    log.info('Estado actualizado', { approvalId, newStatus });
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      log.warn('Conditional write falló: ya no está PENDING', { approvalId });
      return false;
    }
    throw err; // Re-throw otros errores
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: executeApprovedRunbook
//  Invoca el runbook-engine para ejecutar la acción aprobada.
// ═══════════════════════════════════════════════════════════════

async function executeApprovedRunbook(approval) {
  const runbookEngineArn = process.env.RUNBOOK_ENGINE_ARN;

  if (!runbookEngineArn) {
    log.warn('RUNBOOK_ENGINE_ARN no configurado');
    return;
  }

  const payload = {
    source: 'approval-gateway',
    action: 'execute-approved',
    breach: approval.breach,
    sid: approval.sid,
    approvalId: approval.approvalId,
  };

  try {
    await lambda.send(new InvokeCommand({
      FunctionName: runbookEngineArn,
      InvocationType: 'Event', // Asíncrono
      Payload: Buffer.from(JSON.stringify(payload)),
    }));

    log.info('Runbook-engine invocado', { runbookId: approval.runbookId });
  } catch (err) {
    log.error('Error invocando runbook-engine', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: listPendingApprovals
//  Lista todas las solicitudes pendientes de aprobación.
// ═══════════════════════════════════════════════════════════════

async function listPendingApprovals() {
  try {
    // Usamos QueryCommand con GSI 'status-created-index' para mejor rendimiento
    const result = await ddbDoc.send(new QueryCommand({
      TableName: APPROVALS_TABLE,
      IndexName: 'status-created-index',
      KeyConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'PENDING' },
    }));

    const now = new Date();
    const approvals = (result.Items || []).map(item => ({
      approvalId: item.approvalId,
      systemId: item.systemId,
      runbookId: item.runbookId,
      severity: item.severity,
      metricName: item.metricName,
      metricValue: item.metricValue,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      isExpired: new Date(item.expiresAt) < now,
    }));

    log.info('Aprobaciones pendientes encontradas', { count: approvals.length });
    return approvals;
  } catch (err) {
    log.error('Error listando aprobaciones', { error: err.message });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: notifyApprovalRequest
//  Publica por SNS que hay una nueva solicitud de aprobación.
// ═══════════════════════════════════════════════════════════════

async function notifyApprovalRequest(approval) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn) return;

  const apiUrl = process.env.APPROVAL_API_URL || 'https://YOUR-API-GATEWAY-URL';

  const message = {
    type: 'APPROVAL_REQUEST',
    approvalId: approval.approvalId,
    systemId: approval.systemId,
    runbookId: approval.runbookId,
    severity: approval.severity,
    metricName: approval.metricName,
    metricValue: approval.metricValue,
    breach: approval.breach,
    commands: approval.commands,
    costEstimate: approval.costEstimate,
    adaptation: approval.adaptation,
    safetyGateDecision: approval.safetyGateDecision,
    safetyGateReason: approval.safetyGateReason,
    expiresAt: approval.expiresAt,
    approveUrl: `${apiUrl}/approvals/${approval.approvalId}/approve?token=${approval.token}`,
    rejectUrl: `${apiUrl}/approvals/${approval.approvalId}/reject?token=${approval.token}`,
    // H27: Incluir información de delegación si aplica
    delegatedTo: approval.delegatedTo || null,
    delegatedFrom: approval.delegatedFrom || null,
    delegationReason: approval.delegationReason || null,
    timestamp: new Date().toISOString(),
  };

  // H27: Si la solicitud fue delegada, agregar info al Subject del SNS
  let subject = `Avvale SAP AlwaysOps Aprobación: ${approval.systemId} - ${approval.runbookId} (${approval.severity})`;
  if (approval.delegatedTo) {
    subject = `[DELEGADO] ${subject}`;
  }

  try {
    await sns.send(new PublishCommand({
      TopicArn: alertsTopicArn,
      Subject: subject,
      Message: JSON.stringify(message),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'APPROVAL_REQUEST' },
        severity: { DataType: 'String', StringValue: approval.severity },
        systemId: { DataType: 'String', StringValue: approval.systemId },
      },
    }));

    log.info('Solicitud de aprobación publicada', { approvalId: approval.approvalId, delegatedTo: approval.delegatedTo || null });
  } catch (err) {
    log.warn('Error publicando solicitud de aprobación', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: notifyApprovalResult
//  Notifica por SNS que una solicitud fue aprobada o rechazada.
// ═══════════════════════════════════════════════════════════════

async function notifyApprovalResult(approval, status, processedBy) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn) return;

  const message = {
    type: 'APPROVAL_RESULT',
    approvalId: approval.approvalId,
    systemId: approval.systemId,
    runbookId: approval.runbookId,
    status,
    processedBy: processedBy || 'anónimo',
    timestamp: new Date().toISOString(),
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: alertsTopicArn,
      Subject: `Avvale SAP AlwaysOps Aprobación ${status}: ${approval.systemId} - ${approval.runbookId}`,
      Message: JSON.stringify(message),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'APPROVAL_RESULT' },
        systemId: { DataType: 'String', StringValue: approval.systemId },
      },
    }));
  } catch (err) {
    log.warn('Error publicando resultado de aprobación', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: respond
//  Utilidad para crear respuestas HTTP para API Gateway.
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
//  FUNCIÓN: respondHtml
//  Genera una página HTML bonita para respuestas de navegador
//  (cuando alguien hace click en APROBAR/RECHAZAR desde el email).
// ═══════════════════════════════════════════════════════════════

function respondHtml(statusCode, title, message, color, icon) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avvale SAP AlwaysOps - ${title}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f4f4f4;display:flex;justify-content:center;align-items:center;min-height:100vh;}
  .card{background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:480px;width:90%;overflow:hidden;text-align:center;}
  .header{background:${color};color:#fff;padding:32px 24px;}
  .icon{font-size:48px;margin-bottom:12px;}
  .header h1{margin:0;font-size:22px;}
  .body{padding:24px;}
  .body p{color:#555;line-height:1.6;margin:0 0 12px;}
  .footer{background:#f8f8f8;padding:12px;font-size:11px;color:#999;border-top:1px solid #eee;}
</style></head>
<body>
  <div class="card">
    <div class="header"><div class="icon">${icon}</div><h1>${title}</h1></div>
    <div class="body"><p>${message}</p></div>
    <div class="footer">Avvale SAP AlwaysOps v1.0 &mdash; Sistema de monitoreo automatizado</div>
  </div>
</body></html>`;

  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  };
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Maneja tres tipos de invocación:
//  1. Desde runbook-engine (crear solicitud de aprobación)
//  2. Desde API Gateway (aprobar/rechazar/listar)
//  3. Preflight CORS (OPTIONS)
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Approval Gateway invocado');
  const startTime = Date.now();

  try {
    // ─── Caso 1: Invocación desde runbook-engine (crear aprobación) ───
    if (event.source === 'runbook-engine' && event.action === 'create-approval') {
      log.info('Creando nueva solicitud de aprobación');

      const { breach, commands, sid, env, costEstimate, adaptation } = event;
      const result = await createApproval(breach, commands, sid, env, costEstimate, adaptation);

      const duration = Date.now() - startTime;
      return {
        statusCode: 200,
        body: {
          message: 'Solicitud de aprobación creada',
          duration: `${duration}ms`,
          ...result,
        },
      };
    }

    // ─── Caso 2: Invocación desde API Gateway ───
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    const path = event.path || event.rawPath || '';
    const queryParams = event.queryStringParameters || {};
    const pathParams = event.pathParameters || {};

    // CORS preflight
    if (httpMethod === 'OPTIONS') {
      return respond(200, { message: 'OK' });
    }

    // POST /approvals/{id}/approve (o GET para clicks desde email)
    if ((httpMethod === 'POST' || httpMethod === 'GET') && path.includes('/approve')) {
      const approvalId = pathParams.id || path.split('/').filter(Boolean).find((_, i, a) => a[i - 1] === 'approvals') || path.split('/')[2];
      const token = queryParams.token;
      let body = {};
      if (event.body) {
        try { body = JSON.parse(event.body); } catch (e) {
          return respondHtml(400, 'Error', 'Body JSON inválido.', '#dc3545', '&#10060;');
        }
      }

      if (!approvalId || !token) {
        return respondHtml(400, 'Error', 'Se requiere approvalId y token en la URL.', '#dc3545', '&#10060;');
      }

      const result = await processApproval(approvalId, token, 'approve', body.approvedBy || queryParams.by || 'via-email');

      if (result.success) {
        return respondHtml(200,
          'Aprobado',
          `El runbook <strong>${result.runbookId}</strong> para el sistema <strong>${result.systemId}</strong> ha sido aprobado y se está ejecutando.`,
          '#28a745', '&#9989;');
      } else {
        return respondHtml(400, 'Error', result.error || 'No se pudo procesar la aprobación.', '#dc3545', '&#10060;');
      }
    }

    // POST /approvals/{id}/reject (o GET para clicks desde email)
    if ((httpMethod === 'POST' || httpMethod === 'GET') && path.includes('/reject')) {
      const approvalId = pathParams.id || path.split('/').filter(Boolean).find((_, i, a) => a[i - 1] === 'approvals') || path.split('/')[2];
      const token = queryParams.token;
      let body = {};
      if (event.body) {
        try { body = JSON.parse(event.body); } catch (e) {
          return respondHtml(400, 'Error', 'Body JSON inválido.', '#dc3545', '&#10060;');
        }
      }

      if (!approvalId || !token) {
        return respondHtml(400, 'Error', 'Se requiere approvalId y token en la URL.', '#dc3545', '&#10060;');
      }

      const result = await processApproval(approvalId, token, 'reject', body.rejectedBy || queryParams.by || 'via-email');

      if (result.success) {
        return respondHtml(200,
          'Rechazado',
          `El runbook <strong>${result.runbookId}</strong> para el sistema <strong>${result.systemId}</strong> ha sido rechazado. No se ejecutará ninguna acción.`,
          '#6c757d', '&#128683;');
      } else {
        return respondHtml(400, 'Error', result.error || 'No se pudo procesar el rechazo.', '#dc3545', '&#10060;');
      }
    }

    // GET /approvals
    if (httpMethod === 'GET' && (path === '/approvals' || path.endsWith('/approvals'))) {
      const approvals = await listPendingApprovals();
      return respond(200, { approvals, count: approvals.length });
    }

    // ─── H27: Rutas de delegación de aprobaciones ─────────────────

    // POST /delegations — Crear una nueva delegación
    if (httpMethod === 'POST' && (path === '/delegations' || path.endsWith('/delegations'))) {
      let body = {};
      if (event.body) {
        try { body = JSON.parse(event.body); } catch (e) {
          return respond(400, { error: 'Body JSON inválido' });
        }
      }

      const { delegatorEmail, delegateEmail, startDate, endDate, reason } = body;

      if (!delegatorEmail || !delegateEmail || !startDate || !endDate) {
        return respond(400, {
          error: 'Se requieren: delegatorEmail, delegateEmail, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)',
        });
      }

      // Validar formato de fechas (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return respond(400, { error: 'Las fechas deben tener formato YYYY-MM-DD' });
      }

      if (startDate > endDate) {
        return respond(400, { error: 'startDate no puede ser posterior a endDate' });
      }

      const result = await createDelegation(delegatorEmail, delegateEmail, startDate, endDate, reason);

      if (result.success) {
        return respond(201, { message: 'Delegación creada exitosamente', delegation: result.delegation });
      } else {
        return respond(400, { error: result.error });
      }
    }

    // GET /delegations?email=X — Listar delegaciones para un email
    if (httpMethod === 'GET' && (path === '/delegations' || path.endsWith('/delegations'))) {
      const email = queryParams.email;
      if (!email) {
        return respond(400, { error: 'Se requiere el parámetro email (ej: ?email=usuario@empresa.com)' });
      }

      const delegations = await listDelegations(email);
      return respond(200, { email, delegations });
    }

    // DELETE /delegations/{id} — Revocar una delegación
    if (httpMethod === 'DELETE' && path.includes('/delegations/')) {
      // Extraer el delegationId del path: /delegations/{delegatorEmail}/{delegationId}
      const parts = path.split('/').filter(Boolean);
      const delegationsIdx = parts.indexOf('delegations');
      const delegatorEmail = decodeURIComponent(parts[delegationsIdx + 1] || '');
      const delegationId = decodeURIComponent(parts[delegationsIdx + 2] || '');

      if (!delegatorEmail || !delegationId) {
        return respond(400, {
          error: 'Se requiere: /delegations/{delegatorEmail}/{delegationId}',
        });
      }

      const result = await revokeDelegation(delegatorEmail, delegationId);

      if (result.success) {
        return respond(200, result);
      } else {
        return respond(400, result);
      }
    }

    // Ruta no encontrada
    if (httpMethod) {
      return respond(404, { error: 'Ruta no encontrada' });
    }

    // ─── Caso 3: Invocación directa sin HTTP (testing) ───
    const duration = Date.now() - startTime;
    return {
      statusCode: 200,
      body: { message: 'Approval Gateway v1.0 listo', duration: `${duration}ms` },
    };

  } catch (err) {
    log.error('Error fatal', { error: err.message, stack: err.stack });
    return respond(500, { error: err.message });
  }
};
