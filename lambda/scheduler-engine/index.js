'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Scheduler Engine
//  Motor de operaciones programadas con evaluacion de riesgo IA.
//
//  Que hace este Lambda?
//  - Lee operaciones programadas (backups, reinicios) de DynamoDB
//  - Evalua riesgo con IA antes de ejecutar (Bedrock)
//  - Ejecuta operaciones via SSM Run Command
//  - Escala a aprobacion humana si el riesgo es alto
//  - Notifica resultados via SNS
//
//  Trigger: EventBridge (rate 5 minutes)
// ═══════════════════════════════════════════════════════════════

const { getSystemConfig: getTrialConfig } = require('../utilidades/trial-config');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { SSMClient, SendCommandCommand, GetCommandInvocationCommand, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { CloudWatchClient, GetMetricStatisticsCommand, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const log = require('../utilidades/logger')('scheduler-engine');

// Clientes de AWS
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});
const lambda = new LambdaClient({});
const sns = new SNSClient({});
const cw = new CloudWatchClient({});
const sfnClient = new SFNClient({});

// Configuracion
const SCHEDULED_OPS_TABLE = process.env.SCHEDULED_OPS_TABLE || 'sap-alwaysops-scheduled-operations';
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'sap-alwaysops-incidents';
const ALERTS_TOPIC_ARN = process.env.ALERTS_TOPIC_ARN || '';
const APPROVAL_FUNCTION = process.env.APPROVAL_FUNCTION || 'sap-alwaysops-approval-gateway';
const BEDROCK_ADVISOR_FUNCTION = process.env.BEDROCK_ADVISOR_FUNCTION || 'sap-alwaysops-bedrock-advisor';
const CW_NAMESPACE = process.env.CW_NAMESPACE || 'SAPAlwaysOps';
const MAX_OPERATIONS_PER_RUN = 5;

// v1.0 — H17: Recovery Pipeline para FAILED_ORCHESTRATION
const METRICS_HISTORY_TABLE = process.env.METRICS_HISTORY_TABLE || 'sap-alwaysops-metrics-history';
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN || '';
const MAX_RECOVERY_RETRIES = 3;
const RECOVERY_BATCH_SIZE = 10;

// H28 — DR Drill Automation
const DR_DRILL_TYPES = {
  'DR-FAILOVER-TEST': {
    name: 'Failover Test',
    description: 'Simula falla del servidor primario y verifica que el secundario tome control',
    riskLevel: 'HIGH',
    requiresApproval: true,
    estimatedDurationMinutes: 30,
    steps: [
      { name: 'pre_check', description: 'Verificar estado actual del cluster HA', command: 'status' },
      { name: 'stop_primary', description: 'Detener instancia SAP primaria', command: 'stop_sap' },
      { name: 'verify_failover', description: 'Verificar que secundario asumió servicios', command: 'check_secondary', waitSeconds: 120 },
      { name: 'validate_services', description: 'Validar que servicios SAP responden', command: 'health_check' },
      { name: 'restore_primary', description: 'Reiniciar instancia primaria', command: 'start_sap' },
      { name: 'verify_sync', description: 'Verificar sincronización de replicación', command: 'check_replication', waitSeconds: 60 },
    ],
  },
  'DR-BACKUP-RESTORE': {
    name: 'Backup & Restore Test',
    description: 'Ejecuta un backup completo y verifica restauración en ambiente de test',
    riskLevel: 'MEDIUM',
    requiresApproval: true,
    estimatedDurationMinutes: 60,
    steps: [
      { name: 'full_backup', description: 'Ejecutar backup completo de base de datos', command: 'backup_full' },
      { name: 'verify_backup', description: 'Verificar integridad del backup', command: 'verify_backup' },
      { name: 'restore_test', description: 'Restaurar en ambiente de test', command: 'restore_to_test', waitSeconds: 300 },
      { name: 'validate_data', description: 'Validar integridad de datos restaurados', command: 'validate_data' },
    ],
  },
  'DR-NETWORK-ISOLATION': {
    name: 'Network Isolation Test',
    description: 'Simula pérdida de conectividad de red y verifica recuperación',
    riskLevel: 'HIGH',
    requiresApproval: true,
    estimatedDurationMinutes: 20,
    steps: [
      { name: 'pre_check', description: 'Documentar estado de red actual', command: 'network_status' },
      { name: 'isolate', description: 'Aplicar reglas de firewall para aislar', command: 'isolate_network', waitSeconds: 30 },
      { name: 'verify_detection', description: 'Verificar que el monitoreo detectó la falla', command: 'check_alerts' },
      { name: 'restore_network', description: 'Remover reglas de aislamiento', command: 'restore_network' },
      { name: 'verify_recovery', description: 'Verificar recuperación automática', command: 'health_check', waitSeconds: 60 },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
//  FUNCION: getScheduledOperations
//  Busca operaciones cuyo tiempo programado ya paso
// ═══════════════════════════════════════════════════════════════

async function getScheduledOperations() {
  log.info('Buscando operaciones programadas pendientes');
  const now = new Date().toISOString();

  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: SCHEDULED_OPS_TABLE,
      IndexName: 'status-nextRun-index',
      KeyConditionExpression: '#status = :scheduled AND scheduledTime <= :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':scheduled': 'SCHEDULED', ':now': now },
      Limit: MAX_OPERATIONS_PER_RUN * 3,
    }));

    const operations = result.Items || [];
    log.info('Operaciones pendientes encontradas', { count: operations.length });
    return operations
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))
      .slice(0, MAX_OPERATIONS_PER_RUN);
  } catch (err) {
    log.error('Error buscando operaciones', { error: err.message });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: lockOperation
//  Marca una operacion como EXECUTING (lock optimista)
// ═══════════════════════════════════════════════════════════════

async function lockOperation(operation) {
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: SCHEDULED_OPS_TABLE,
      Key: { pk: operation.pk, sk: operation.sk },
      UpdateExpression: 'SET #status = :executing, startedAt = :now',
      ConditionExpression: '#status = :scheduled',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':executing': 'EXECUTING', ':scheduled': 'SCHEDULED',
        ':now': new Date().toISOString(),
      },
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      log.warn('Operacion ya tomada', { operationId: operation.operationId });
      return false;
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: performRiskAssessment
//  Evalua el riesgo de una operacion usando Bedrock (UC7)
// ═══════════════════════════════════════════════════════════════

async function performRiskAssessment(operation) {
  log.info('Evaluando riesgo IA', { operationType: operation.operationType, systemId: operation.systemId });

  const currentMetrics = await getCurrentMetrics(operation.systemId, operation.databaseType);

  let recentIncidents = 0;
  try {
    const incResult = await ddbDoc.send(new QueryCommand({
      TableName: INCIDENTS_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk > :since',
      ExpressionAttributeValues: {
        ':pk': `INCIDENT#${operation.systemId}`,
        ':since': new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      },
      Select: 'COUNT',
    }));
    recentIncidents = incResult.Count || 0;
  } catch (err) { /* sin datos */ }

  // Invocar bedrock-advisor con UC7
  try {
    const payload = {
      useCase: 'UC7', action: 'risk-assessment',
      operationType: operation.operationType,
      systemId: operation.systemId, sid: operation.sid,
      systemType: operation.systemType, dbType: operation.databaseType,
      commands: operation.commands, metrics: currentMetrics,
      recentIncidents, scheduledTime: operation.scheduledTime,
      requestedBy: operation.requestedBy,
      currentHourUTC: new Date().getUTCHours(),
      isBusinessHours: isBusinessHours(),
    };

    const response = await lambda.send(new InvokeCommand({
      FunctionName: BEDROCK_ADVISOR_FUNCTION,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    }));

    if (!response.Payload) throw new Error('Lambda response sin Payload');
    const responsePayload = JSON.parse(new TextDecoder().decode(response.Payload));
    const assessment = responsePayload.body || responsePayload;
    log.info('Riesgo evaluado', { riskLevel: assessment.riskLevel || 'UNKNOWN' });

    return {
      riskLevel: assessment.riskLevel || 'MEDIUM',
      reason: assessment.reason || 'Evaluacion no disponible',
      recommendation: assessment.recommendation || '',
      bedrockUsed: assessment.bedrockUsed !== false,
      autoExecute: assessment.autoExecute !== false && ['LOW', 'MEDIUM'].includes(assessment.riskLevel),
    };
  } catch (err) {
    log.warn('Error en evaluacion de riesgo', { error: err.message });
    return fallbackRiskAssessment(operation, currentMetrics, recentIncidents);
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: fallbackRiskAssessment
//  Evaluacion de riesgo sin IA (reglas codificadas)
// ═══════════════════════════════════════════════════════════════

function fallbackRiskAssessment(operation, metrics, recentIncidents) {
  const type = operation.operationType;
  const isProduction = (operation.sid || '').toUpperCase().includes('PRD');
  const hasCriticalIncidents = recentIncidents > 3;
  const inBizHours = isBusinessHours();

  let riskLevel = 'LOW';
  let reason = '';
  let autoExecute = true;

  if (type === 'RESTART') {
    riskLevel = 'MEDIUM';
    reason = 'Reinicios siempre tienen riesgo de interrupcion de servicio.';

    if (isProduction) {
      riskLevel = 'HIGH';
      reason = 'Reinicio en sistema de PRODUCCION. Alto riesgo de impacto a usuarios.';
      autoExecute = false;
    }
    if (inBizHours && isProduction) {
      riskLevel = 'CRITICAL';
      reason = 'Reinicio de PRODUCCION en HORARIO LABORAL. Riesgo critico.';
      autoExecute = false;
    }
    if (hasCriticalIncidents) {
      riskLevel = 'HIGH';
      reason += ' Incidentes criticos recientes podrian complicar el reinicio.';
      autoExecute = false;
    }
  }

  if (type === 'BACKUP') {
    riskLevel = 'LOW';
    reason = 'Backups son operaciones de solo lectura, riesgo bajo.';

    if (inBizHours && isProduction) {
      riskLevel = 'MEDIUM';
      reason = 'Backup en horario laboral puede causar degradacion de rendimiento temporal.';
    }
    const diskPct = parseFloat(metrics.DB_ASE_PhysDataPct || metrics.DB_HANA_DiskPct || 0);
    if (diskPct > 90) {
      riskLevel = 'HIGH';
      reason = `Disco al ${diskPct}%. El backup podria quedarse sin espacio.`;
      autoExecute = false;
    }
  }

  return {
    riskLevel, reason,
    recommendation: autoExecute ? 'Auto-ejecutar' : 'Requiere aprobacion humana',
    bedrockUsed: false, autoExecute,
  };
}

function isBusinessHours() {
  const hour = new Date().getUTCHours();
  return hour >= 13 && hour <= 23; // 8am-6pm Colombia
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: getCurrentMetrics
//  Obtiene metricas actuales del sistema desde CloudWatch
// ═══════════════════════════════════════════════════════════════

async function getCurrentMetrics(systemId, dbType) {
  const metricsToCheck = [];
  switch (dbType) {
    case 'SAP_ASE': metricsToCheck.push('DB_ASE_LogFullPct', 'DB_ASE_PhysDataPct', 'DB_ASE_BlockingChains'); break;
    case 'SAP_HANA': metricsToCheck.push('DB_HANA_MemPct', 'DB_HANA_DiskPct'); break;
    case 'ORACLE': metricsToCheck.push('DB_ORA_TablespacePct'); break;
    case 'MSSQL': metricsToCheck.push('DB_MSSQL_LogPct', 'DB_MSSQL_DataPct'); break;
    case 'IBM_DB2': metricsToCheck.push('DB_DB2_TablespacePct'); break;
  }
  metricsToCheck.push('APP_JVM_HeapPct');

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);
  const currentMetrics = {};

  for (const metricName of metricsToCheck) {
    try {
      const result = await cw.send(new GetMetricStatisticsCommand({
        Namespace: CW_NAMESPACE, MetricName: metricName,
        Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
        StartTime: startTime, EndTime: endTime,
        Period: 300, Statistics: ['Average'],
      }));
      const dp = result.Datapoints?.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))[0];
      if (dp) currentMetrics[metricName] = dp.Average;
    } catch (err) { /* metrica no disponible */ }
  }
  return currentMetrics;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: executeOperation
//  Ejecuta la operacion via SSM Run Command
// ═══════════════════════════════════════════════════════════════

async function executeOperation(operation) {
  log.info('Ejecutando operacion', { operationType: operation.operationType, systemId: operation.systemId });

  const commands = operation.commands || [];
  if (commands.length === 0) return { success: false, error: 'Sin comandos para ejecutar' };

  const instanceId = await getInstanceId(operation.systemId);
  if (!instanceId) {
    log.info('Sin instanceId, modo simulacion', { systemId: operation.systemId });
    return {
      success: true, simulated: true,
      message: `Simulacion: ${operation.operationType} para ${operation.systemId}`,
      commands: commands.length,
    };
  }

  try {
    const ssmResult = await ssmClient.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: (operation.osType || 'LINUX') === 'WINDOWS' ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript',
      TimeoutSeconds: 600,
      Parameters: { commands, executionTimeout: ['540'] },
      Comment: `Avvale SAP AlwaysOps Scheduled: ${operation.operationType} - ${operation.operationId}`,
    }));

    const commandId = ssmResult.Command?.CommandId;
    if (!commandId) throw new Error('SSM no retornó CommandId');
    log.info('SSM comando enviado', { commandId });

    await new Promise(r => setTimeout(r, 5000));

    try {
      const invocation = await ssmClient.send(new GetCommandInvocationCommand({
        CommandId: commandId, InstanceId: instanceId,
      }));
      // Solo Success es éxito confirmado; InProgress = aún corriendo (OK para comandos largos);
      // Failed, TimedOut, Cancelled = fallo real
      const isSuccess = invocation.Status === 'Success';
      const isPending = invocation.Status === 'InProgress' || invocation.Status === 'Pending';
      return {
        success: isSuccess || isPending,
        commandId, status: invocation.Status,
        output: invocation.StandardOutputContent?.substring(0, 500) || '',
      };
    } catch (err) {
      // No se pudo verificar el estado — el comando fue enviado pero status desconocido
      log.warn('No se pudo verificar invocacion', { error: err.message });
      return { success: false, commandId, status: 'UNKNOWN', message: `Comando enviado, verificación falló: ${err.message}` };
    }
  } catch (err) {
    log.error('Error SSM', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function getInstanceId(systemId) {
  try {
    const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
    const param = await ssmClient.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
    const config = JSON.parse(param.Parameter.Value);
    const sys = config.find(s => s.systemId === systemId);
    return sys?.instanceId || process.env.EC2_INSTANCE_ID || null;
  } catch (err) {
    return process.env.EC2_INSTANCE_ID || null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: escalateToApproval
//  Escala una operacion a aprobacion humana
// ═══════════════════════════════════════════════════════════════

async function escalateToApproval(operation, riskAssessment) {
  log.info('Escalando a aprobacion', { operationId: operation.operationId, riskLevel: riskAssessment.riskLevel });

  try {
    await lambda.send(new InvokeCommand({
      FunctionName: APPROVAL_FUNCTION,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        action: 'create-approval',
        systemId: operation.systemId,
        operationType: operation.operationType,
        operationId: operation.operationId,
        commands: operation.commands,
        severity: riskAssessment.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        reason: `Operacion programada: ${operation.operationType} — Riesgo: ${riskAssessment.riskLevel}`,
        riskAssessment, requestedBy: operation.requestedBy,
        costSafe: operation.operationType === 'BACKUP',
        metricName: `SCHEDULED_${operation.operationType}`,
        metricValue: riskAssessment.riskLevel,
      }),
    }));
    return { success: true, escalated: true };
  } catch (err) {
    log.error('Error escalando a aprobacion', { error: err.message });
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: updateOperationStatus
//  Actualiza el estado de una operacion en DynamoDB
// ═══════════════════════════════════════════════════════════════

async function updateOperationStatus(operation, status, result) {
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: SCHEDULED_OPS_TABLE,
      Key: { pk: operation.pk, sk: operation.sk },
      UpdateExpression: 'SET #status = :status, executionResult = :result, completedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status, ':result': result, ':now': new Date().toISOString(),
      },
    }));
  } catch (err) {
    log.error('Error actualizando operacion', { operationId: operation.operationId, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: notifyResult
//  Notifica el resultado via SNS
// ═══════════════════════════════════════════════════════════════

async function notifyResult(operation, status, result, riskAssessment) {
  if (!ALERTS_TOPIC_ARN) return;
  try {
    await sns.send(new PublishCommand({
      TopicArn: ALERTS_TOPIC_ARN,
      Subject: `Avvale SAP AlwaysOps Operacion ${status}: ${operation.operationType} en ${operation.systemId}`,
      Message: JSON.stringify({
        type: 'SCHEDULED_OPERATION_RESULT',
        operationId: operation.operationId,
        operationType: operation.operationType,
        systemId: operation.systemId, sid: operation.sid,
        status, requestedBy: operation.requestedBy,
        riskLevel: riskAssessment?.riskLevel || 'N/A',
        result: typeof result === 'string' ? result : JSON.stringify(result).substring(0, 500),
        timestamp: new Date().toISOString(),
      }),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'SCHEDULED_OPERATION_RESULT' },
        systemId: { DataType: 'String', StringValue: operation.systemId },
      },
    }));
  } catch (err) {
    log.warn('Error notificando resultado', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCION: processOperation
//  Procesa una operacion: evaluar riesgo -> ejecutar/escalar
// ═══════════════════════════════════════════════════════════════

async function processOperation(operation) {
  log.info('Procesando operacion', { operationId: operation.operationId, operationType: operation.operationType, systemId: operation.systemId });

  const locked = await lockOperation(operation);
  if (!locked) return { operationId: operation.operationId, skipped: true, reason: 'Ya en proceso' };

  // Evaluacion de riesgo IA
  let riskAssessment = null;
  if (operation.needsRiskAssessment !== false) {
    riskAssessment = await performRiskAssessment(operation);

    await ddbDoc.send(new UpdateCommand({
      TableName: SCHEDULED_OPS_TABLE,
      Key: { pk: operation.pk, sk: operation.sk },
      UpdateExpression: 'SET riskAssessment = :ra',
      ExpressionAttributeValues: { ':ra': riskAssessment },
    }));

    // v1.0 — H35: En trial, auto-aprobar operaciones en vez de requerir aprobación manual
    let trialAutoApproved = false;
    try {
      const opTrialCfg = await getTrialConfig(operation.systemId);
      if (opTrialCfg.mode === 'TRIAL' && opTrialCfg.autoApproveInTrial === true) {
        riskAssessment.autoExecute = true;
        trialAutoApproved = true;
        log.info('Auto-aprobando operacion en modo trial', { operationId: operation.operationId, riskLevel: riskAssessment.riskLevel });
      }
    } catch (trialErr) {
      // No-bloqueante
      log.warn('Error verificando auto-approve trial', { error: trialErr.message });
    }

    if (!riskAssessment.autoExecute) {
      log.info('Riesgo alto, escalando a aprobacion', { riskLevel: riskAssessment.riskLevel });
      await escalateToApproval(operation, riskAssessment);
      await updateOperationStatus(operation, 'PENDING_APPROVAL', {
        escalated: true, riskLevel: riskAssessment.riskLevel, reason: riskAssessment.reason,
      });
      await notifyResult(operation, 'PENDING_APPROVAL', riskAssessment, riskAssessment);
      return { operationId: operation.operationId, status: 'PENDING_APPROVAL', riskLevel: riskAssessment.riskLevel };
    }
  }

  // Ejecutar la operacion
  const execResult = await executeOperation(operation);
  const finalStatus = execResult.success ? 'COMPLETED' : 'FAILED';
  await updateOperationStatus(operation, finalStatus, execResult);
  await notifyResult(operation, finalStatus, execResult, riskAssessment);

  log.info('Operacion finalizada', { operationId: operation.operationId, status: finalStatus });
  return {
    operationId: operation.operationId, status: finalStatus,
    riskLevel: riskAssessment?.riskLevel || 'N/A', simulated: execResult.simulated || false,
  };
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H17: RECOVERY PIPELINE PARA FAILED_ORCHESTRATION
//  Cada invocación del scheduler revisa si hay breaches huérfanos
//  guardados por universal-collector cuando Step Functions falló.
//  Intenta re-lanzar la orquestación con backoff exponencial.
//  Después de MAX_RECOVERY_RETRIES intentos, marca como ABANDONED
//  y envía alerta CRITICAL.
// ═══════════════════════════════════════════════════════════════

async function recoverFailedOrchestrations() {
  if (!STATE_MACHINE_ARN) {
    log.info('STATE_MACHINE_ARN no configurado, omitiendo recovery pipeline');
    return { recovered: 0, abandoned: 0, errors: 0 };
  }

  log.info('Buscando orquestaciones fallidas para reprocesar');

  try {
    // v1.5 — Query via GSI 'recordType-index' (PK: recordType = 'FAILED_ORCHESTRATION') en lugar de Scan.
    // Los registros de orquestacion fallida se escriben con recordType='FAILED_ORCHESTRATION'.
    const result = await ddbDoc.send(new QueryCommand({
      TableName: METRICS_HISTORY_TABLE,
      IndexName: 'recordType-index',
      KeyConditionExpression: 'recordType = :rtype',
      ExpressionAttributeValues: { ':rtype': 'FAILED_ORCHESTRATION' },
      Limit: RECOVERY_BATCH_SIZE,
    }));

    const failedItems = result.Items || [];
    if (failedItems.length === 0) {
      log.info('Sin orquestaciones fallidas pendientes');
      return { recovered: 0, abandoned: 0, errors: 0 };
    }

    log.info('Orquestaciones fallidas encontradas', { count: failedItems.length });

    let recovered = 0;
    let abandoned = 0;
    let errors = 0;

    for (const item of failedItems) {
      const systemId = item.systemId || item.pk.replace('FAILED_ORCHESTRATION#', '');
      const retryCount = item.retryCount || 0;

      try {
        // Verificar si superó el máximo de reintentos
        if (retryCount >= MAX_RECOVERY_RETRIES) {
          log.info('Maximo reintentos superado, abandonando', { systemId, maxRetries: MAX_RECOVERY_RETRIES });

          // Marcar como abandonado (cambiar pk para no reprocesar)
          await ddbDoc.send(new PutCommand({
            TableName: METRICS_HISTORY_TABLE,
            Item: {
              pk: `ABANDONED_ORCHESTRATION#${systemId}`,
              sk: item.sk,
              breaches: item.breaches,
              originalError: item.error,
              retryCount,
              abandonedAt: new Date().toISOString(),
              ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 días TTL
            },
          }));

          // Eliminar el registro fallido original
          await ddbDoc.send(new DeleteCommand({
            TableName: METRICS_HISTORY_TABLE,
            Key: { pk: item.pk, sk: item.sk },
          }));

          // Enviar alerta CRITICAL
          if (ALERTS_TOPIC_ARN) {
            await sns.send(new PublishCommand({
              TopicArn: ALERTS_TOPIC_ARN,
              Subject: `🚨 Avvale SAP AlwaysOps: Orquestación ABANDONADA para ${systemId}`,
              Message: JSON.stringify({
                type: 'ORCHESTRATION_ABANDONED',
                severity: 'CRITICAL',
                systemId,
                breachCount: (item.breaches || []).length,
                retryCount,
                originalError: item.error,
                action: 'REQUIERE INTERVENCIÓN HUMANA — orquestación falló después de múltiples reintentos',
                timestamp: new Date().toISOString(),
              }, null, 2),
              MessageAttributes: {
                eventType: { DataType: 'String', StringValue: 'ORCHESTRATION_ABANDONED' },
                severity: { DataType: 'String', StringValue: 'CRITICAL' },
              },
            }));
          }

          abandoned++;
          continue;
        }

        // Backoff exponencial: esperar antes de reintentar
        const backoffMinutes = Math.pow(2, retryCount) * 5; // 5, 10, 20 minutos
        const createdAt = new Date(item.sk);
        const nextRetryAt = new Date(createdAt.getTime() + backoffMinutes * 60 * 1000);

        if (new Date() < nextRetryAt) {
          log.info('Sistema en backoff', { systemId, nextRetryInMin: Math.ceil((nextRetryAt - new Date()) / 60000) });
          continue;
        }

        // Reintentar la orquestación via Step Functions
        log.info('Reintentando orquestacion', { systemId, attempt: retryCount + 1, maxRetries: MAX_RECOVERY_RETRIES });

        const breaches = item.breaches || [];
        const input = {
          breaches,
          systemId,
          timestamp: new Date().toISOString(),
          recoveryAttempt: retryCount + 1,
          originalFailure: item.error,
        };

        await sfnClient.send(new StartExecutionCommand({
          stateMachineArn: STATE_MACHINE_ARN,
          name: `recovery-${systemId}-${Date.now()}`,
          input: JSON.stringify(input),
        }));

        // Éxito: eliminar el registro de fallo
        await ddbDoc.send(new DeleteCommand({
          TableName: METRICS_HISTORY_TABLE,
          Key: { pk: item.pk, sk: item.sk },
        }));

        log.info('Orquestacion re-lanzada exitosamente', { systemId });
        recovered++;

      } catch (retryErr) {
        log.error('Error reintentando orquestacion', { systemId, error: retryErr.message });

        // Incrementar retry count para el próximo intento
        try {
          await ddbDoc.send(new UpdateCommand({
            TableName: METRICS_HISTORY_TABLE,
            Key: { pk: item.pk, sk: item.sk },
            UpdateExpression: 'SET retryCount = :rc, lastRetryAt = :now, lastRetryError = :err',
            ExpressionAttributeValues: {
              ':rc': retryCount + 1,
              ':now': new Date().toISOString(),
              ':err': retryErr.message,
            },
          }));
        } catch (updateErr) {
          log.error('Error actualizando retryCount', { error: updateErr.message });
        }

        errors++;
      }
    }

    log.info('Recovery pipeline completado', { recovered, abandoned, errors });
    return { recovered, abandoned, errors };

  } catch (err) {
    log.error('Error en recovery pipeline', { error: err.message });
    return { recovered: 0, abandoned: 0, errors: 0, pipelineError: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  H28: FUNCION: scheduleDRDrill
//  Crea una operacion de DR Drill programada en DynamoDB.
//  Si el tipo de drill requiere aprobacion, la solicita via
//  approval-gateway antes de ejecutar.
// ═══════════════════════════════════════════════════════════════

async function scheduleDRDrill(systemId, drillType, scheduledTime, requestedBy) {
  log.info('Programando drill', { drillType, systemId });

  const drillTemplate = DR_DRILL_TYPES[drillType];
  if (!drillTemplate) {
    throw new Error(`Tipo de DR Drill desconocido: ${drillType}. Válidos: ${Object.keys(DR_DRILL_TYPES).join(', ')}`);
  }

  const operationId = `DR-${drillType}-${systemId}-${Date.now()}`;
  const initialStatus = drillTemplate.requiresApproval ? 'PENDING_APPROVAL' : 'SCHEDULED';

  const drillRecord = {
    pk: `OP#${operationId}`,
    sk: `SYSTEM#${systemId}`,
    type: 'DR_DRILL',
    drillType,
    drillName: drillTemplate.name,
    drillDescription: drillTemplate.description,
    riskLevel: drillTemplate.riskLevel,
    estimatedDurationMinutes: drillTemplate.estimatedDurationMinutes,
    steps: drillTemplate.steps,
    status: initialStatus,
    operationId,
    systemId,
    scheduledTime: scheduledTime || new Date().toISOString(),
    requestedBy: requestedBy || 'SYSTEM',
    createdAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 días TTL
  };

  // Guardar en DynamoDB
  await ddbDoc.send(new PutCommand({
    TableName: SCHEDULED_OPS_TABLE,
    Item: drillRecord,
  }));

  log.info('Drill guardado', { operationId, status: initialStatus });

  // Si requiere aprobacion, crear solicitud via approval-gateway
  if (drillTemplate.requiresApproval) {
    try {
      await lambda.send(new InvokeCommand({
        FunctionName: APPROVAL_FUNCTION,
        InvocationType: 'Event',
        Payload: JSON.stringify({
          action: 'create-approval',
          systemId,
          operationType: 'DR_DRILL',
          operationId,
          severity: drillTemplate.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
          reason: `DR Drill programado: ${drillTemplate.name} — ${drillTemplate.description}`,
          riskAssessment: {
            riskLevel: drillTemplate.riskLevel,
            reason: `DR Drill tipo ${drillType} con ${drillTemplate.steps.length} pasos. Duración estimada: ${drillTemplate.estimatedDurationMinutes} min`,
            recommendation: 'Requiere aprobación antes de ejecutar',
            bedrockUsed: false,
            autoExecute: false,
          },
          requestedBy: requestedBy || 'SYSTEM',
          costSafe: false,
          metricName: 'DR_DRILL',
          metricValue: drillType,
        }),
      }));
      log.info('Solicitud de aprobacion creada', { operationId });
    } catch (err) {
      log.error('Error creando solicitud de aprobacion', { error: err.message });
    }
  }

  return {
    operationId,
    systemId,
    drillType,
    drillName: drillTemplate.name,
    status: initialStatus,
    scheduledTime: drillRecord.scheduledTime,
    estimatedDurationMinutes: drillTemplate.estimatedDurationMinutes,
    totalSteps: drillTemplate.steps.length,
  };
}

// ═══════════════════════════════════════════════════════════════
//  H28: FUNCION: executeDRDrill
//  Ejecuta un DR Drill paso a paso via SSM Run Command.
//  Cada paso se ejecuta secuencialmente; si un paso falla,
//  se abortan los pasos restantes.
//  Publica métricas a CloudWatch y notifica resultados via SNS.
// ═══════════════════════════════════════════════════════════════

async function executeDRDrill(systemId, drill, sys) {
  const drillId = drill.operationId || `DR-${drill.drillType}-${systemId}-${Date.now()}`;
  const drillTemplate = DR_DRILL_TYPES[drill.drillType];

  if (!drillTemplate) {
    log.error('Tipo de drill desconocido', { drillType: drill.drillType });
    return {
      drillId, systemId, drillType: drill.drillType,
      startTime: new Date().toISOString(), endTime: new Date().toISOString(),
      duration: 0, totalSteps: 0, completedSteps: 0,
      status: 'FAILED',
      steps: [],
      recommendation: `Tipo de DR Drill desconocido: ${drill.drillType}`,
    };
  }

  log.info('Iniciando drill', { drillName: drillTemplate.name, systemId, totalSteps: drillTemplate.steps.length });
  const drillStartTime = new Date();
  const stepResults = [];
  let completedSteps = 0;
  let drillStatus = 'SUCCESS';

  // Obtener instanceId del sistema
  const instanceId = sys?.instanceId || await getInstanceId(systemId);
  const osType = sys?.osType || drill.osType || 'LINUX';
  const isWindows = osType === 'WINDOWS';
  const documentName = isWindows ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript';

  for (const step of drillTemplate.steps) {
    const stepStart = new Date();
    log.info('Ejecutando paso de drill', { step: completedSteps + 1, totalSteps: drillTemplate.steps.length, stepName: step.name, description: step.description });

    // Generar comando SSM según OS y tipo de paso
    const ssmCommand = isWindows
      ? `Write-Output "DR-DRILL: Ejecutando ${step.command} para ${systemId}"; & sapcontrol -function ${step.command}`
      : `echo "DR-DRILL: Ejecutando ${step.command} para ${systemId}" && sapcontrol -function ${step.command}`;

    let stepStatus = 'SUCCESS';
    let stepOutput = '';

    if (!instanceId) {
      // Modo simulacion si no hay instanceId
      log.info('Paso simulado (sin instanceId)', { stepName: step.name });
      stepOutput = `Simulación: ${step.command} ejecutado correctamente para ${systemId}`;

      if (step.waitSeconds) {
        log.info('Esperando (simulado como 1s)', { waitSeconds: step.waitSeconds });
        await new Promise(r => setTimeout(r, 1000));
      }
    } else {
      // Ejecucion real via SSM
      try {
        const ssmResult = await ssmClient.send(new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: documentName,
          TimeoutSeconds: Math.max(step.waitSeconds || 120, 120),
          Parameters: { commands: [ssmCommand], executionTimeout: [String(Math.max(step.waitSeconds || 60, 60))] },
          Comment: `DR-DRILL ${drillId}: ${step.name} — ${step.description}`,
        }));

        const commandId = ssmResult.Command?.CommandId;
        if (!commandId) throw new Error('SSM no retornó CommandId');

        // Esperar el tiempo requerido por el paso (o 5 segundos minimo)
        const waitTime = (step.waitSeconds || 5) * 1000;
        log.info('Esperando para paso', { waitSeconds: step.waitSeconds || 5, stepName: step.name });
        await new Promise(r => setTimeout(r, waitTime));

        // Verificar resultado del comando
        try {
          const invocation = await ssmClient.send(new GetCommandInvocationCommand({
            CommandId: commandId, InstanceId: instanceId,
          }));

          if (invocation.Status === 'Success') {
            stepStatus = 'SUCCESS';
            stepOutput = invocation.StandardOutputContent?.substring(0, 1000) || 'Comando exitoso';
          } else if (invocation.Status === 'InProgress' || invocation.Status === 'Pending') {
            stepStatus = 'SUCCESS'; // Aún corriendo es aceptable para pasos largos
            stepOutput = `Comando en progreso (${invocation.Status})`;
          } else if (invocation.Status === 'TimedOut') {
            stepStatus = 'TIMEOUT';
            stepOutput = `Paso excedió tiempo límite: ${invocation.StandardErrorContent?.substring(0, 500) || 'Sin detalle'}`;
          } else {
            stepStatus = 'FAILED';
            stepOutput = invocation.StandardErrorContent?.substring(0, 500) || `Comando falló con estado: ${invocation.Status}`;
          }
        } catch (invErr) {
          log.warn('No se pudo verificar invocacion de paso', { stepName: step.name, error: invErr.message });
          stepStatus = 'UNKNOWN';
          stepOutput = `Comando enviado pero verificación falló: ${invErr.message}`;
        }
      } catch (ssmErr) {
        log.error('Error SSM en paso de drill', { stepName: step.name, error: ssmErr.message });
        stepStatus = 'FAILED';
        stepOutput = `Error SSM: ${ssmErr.message}`;
      }
    }

    const stepEnd = new Date();
    const stepDuration = stepEnd - stepStart;

    stepResults.push({
      name: step.name,
      description: step.description,
      status: stepStatus,
      output: stepOutput,
      duration: `${stepDuration}ms`,
    });

    // Si el paso fue exitoso, incrementar contador
    if (stepStatus === 'SUCCESS') {
      completedSteps++;
    } else {
      // Si un paso falla, abortar los pasos restantes
      log.error('Paso fallo, abortando drill', { stepName: step.name, stepStatus });
      drillStatus = completedSteps > 0 ? 'PARTIAL' : 'FAILED';
      break;
    }
  }

  const drillEndTime = new Date();
  const totalDuration = drillEndTime - drillStartTime;

  // Si todos los pasos fueron exitosos
  if (completedSteps === drillTemplate.steps.length) {
    drillStatus = 'SUCCESS';
  }

  log.info('Drill completado', { drillId, status: drillStatus, completedSteps, totalSteps: drillTemplate.steps.length, durationMs: totalDuration });

  // Publicar métricas a CloudWatch
  try {
    await cw.send(new PutMetricDataCommand({
      Namespace: CW_NAMESPACE,
      MetricData: [
        {
          MetricName: 'DR_Drill_Duration',
          Value: totalDuration / 1000, // en segundos
          Unit: 'Seconds',
          Dimensions: [
            { Name: 'SAPSystemId', Value: systemId },
            { Name: 'DrillType', Value: drill.drillType },
          ],
        },
        {
          MetricName: 'DR_Drill_Success',
          Value: drillStatus === 'SUCCESS' ? 1 : 0,
          Unit: 'Count',
          Dimensions: [
            { Name: 'SAPSystemId', Value: systemId },
            { Name: 'DrillType', Value: drill.drillType },
          ],
        },
      ],
    }));
  } catch (cwErr) {
    log.warn('Error publicando metricas CloudWatch', { error: cwErr.message });
  }

  // Generar recomendación según resultado
  let recommendation = '';
  if (drillStatus === 'SUCCESS') {
    recommendation = `DR Drill ${drillTemplate.name} completado exitosamente. Todos los ${drillTemplate.steps.length} pasos finalizaron correctamente en ${Math.ceil(totalDuration / 1000)}s.`;
  } else if (drillStatus === 'PARTIAL') {
    recommendation = `DR Drill ${drillTemplate.name} completado parcialmente (${completedSteps}/${drillTemplate.steps.length} pasos). Revisar los pasos fallidos y corregir antes de reprogramar.`;
  } else {
    recommendation = `DR Drill ${drillTemplate.name} falló. Ningún paso se completó exitosamente. Verificar configuración del sistema y conectividad antes de reintentar.`;
  }

  const drillResult = {
    drillId,
    systemId,
    drillType: drill.drillType,
    drillName: drillTemplate.name,
    startTime: drillStartTime.toISOString(),
    endTime: drillEndTime.toISOString(),
    duration: `${totalDuration}ms`,
    totalSteps: drillTemplate.steps.length,
    completedSteps,
    status: drillStatus,
    steps: stepResults,
    recommendation,
  };

  // Notificar resultado via SNS
  if (ALERTS_TOPIC_ARN) {
    try {
      const statusEmoji = drillStatus === 'SUCCESS' ? 'OK' : drillStatus === 'PARTIAL' ? 'WARN' : 'FAIL';
      await sns.send(new PublishCommand({
        TopicArn: ALERTS_TOPIC_ARN,
        Subject: `Avvale SAP AlwaysOps DR Drill [${statusEmoji}]: ${drillTemplate.name} en ${systemId}`,
        Message: JSON.stringify({
          type: 'DR_DRILL_RESULT',
          ...drillResult,
          timestamp: new Date().toISOString(),
        }, null, 2),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: 'DR_DRILL_RESULT' },
          systemId: { DataType: 'String', StringValue: systemId },
          drillType: { DataType: 'String', StringValue: drill.drillType },
          drillStatus: { DataType: 'String', StringValue: drillStatus },
        },
      }));
    } catch (snsErr) {
      log.warn('Error notificando resultado via SNS', { error: snsErr.message });
    }
  }

  return drillResult;
}

// ═══════════════════════════════════════════════════════════════
//  H28: FUNCION: generateDRReport
//  Genera un reporte estructurado de compliance para el DR drill.
//  Incluye: resumen, resultados paso a paso, RTO/RPO actual vs
//  objetivo, mapeo de compliance (ISO 27001, SOX-ITGC) y
//  recomendaciones de mejora.
// ═══════════════════════════════════════════════════════════════

function generateDRReport(drillResult) {
  log.info('Generando reporte de compliance', { drillId: drillResult.drillId });

  const drillTemplate = DR_DRILL_TYPES[drillResult.drillType] || {};
  const durationMs = parseInt(drillResult.duration) || 0;
  const durationMinutes = Math.ceil(durationMs / 60000);
  const estimatedMinutes = drillTemplate.estimatedDurationMinutes || 60;

  // Calcular RTO (Recovery Time Objective) — tiempo real de recuperación
  const rtoTargetMinutes = estimatedMinutes;
  const rtoActualMinutes = durationMinutes;
  const rtoMet = rtoActualMinutes <= rtoTargetMinutes;

  // Calcular RPO (Recovery Point Objective) — basado en si backup/restore pasos fueron exitosos
  const dataSteps = (drillResult.steps || []).filter(s =>
    ['full_backup', 'verify_backup', 'restore_test', 'validate_data', 'verify_sync'].includes(s.name)
  );
  const dataStepsSuccessful = dataSteps.filter(s => s.status === 'SUCCESS').length;
  const rpoMet = dataSteps.length === 0 || dataStepsSuccessful === dataSteps.length;

  // Construir reporte de compliance
  const report = {
    reportId: `RPT-${drillResult.drillId}`,
    generatedAt: new Date().toISOString(),
    reportType: 'DR_DRILL_COMPLIANCE',

    // Resumen ejecutivo
    summary: {
      drillId: drillResult.drillId,
      systemId: drillResult.systemId,
      drillType: drillResult.drillType,
      drillName: drillResult.drillName || drillTemplate.name || drillResult.drillType,
      description: drillTemplate.description || 'DR Drill automatizado',
      executionDate: drillResult.startTime,
      overallStatus: drillResult.status,
      totalSteps: drillResult.totalSteps,
      completedSteps: drillResult.completedSteps,
      duration: drillResult.duration,
      durationMinutes,
    },

    // Resultados paso a paso
    stepResults: (drillResult.steps || []).map((step, index) => ({
      stepNumber: index + 1,
      name: step.name,
      description: step.description || '',
      status: step.status,
      output: step.output || '',
      duration: step.duration || 'N/A',
    })),

    // RTO — Recovery Time Objective
    rto: {
      targetMinutes: rtoTargetMinutes,
      actualMinutes: rtoActualMinutes,
      met: rtoMet,
      assessment: rtoMet
        ? `RTO cumplido: recuperación en ${rtoActualMinutes} min (objetivo: ${rtoTargetMinutes} min)`
        : `RTO NO cumplido: recuperación tomó ${rtoActualMinutes} min (objetivo: ${rtoTargetMinutes} min). Investigar cuellos de botella.`,
    },

    // RPO — Recovery Point Objective
    rpo: {
      dataIntegritySteps: dataSteps.length,
      dataIntegrityPassed: dataStepsSuccessful,
      met: rpoMet,
      assessment: rpoMet
        ? 'RPO cumplido: todos los pasos de integridad de datos fueron exitosos'
        : `RPO NO cumplido: ${dataStepsSuccessful}/${dataSteps.length} pasos de integridad de datos exitosos. Riesgo de pérdida de datos.`,
    },

    // Mapeo de compliance
    compliance: {
      'ISO_27001_A.17.1': {
        control: 'A.17.1 — Information security continuity',
        description: 'Continuidad de seguridad de la información planificada e implementada',
        status: drillResult.status === 'SUCCESS' ? 'COMPLIANT' : 'NON_COMPLIANT',
        evidence: `DR Drill ${drillResult.drillType} ejecutado el ${drillResult.startTime}. Resultado: ${drillResult.status}. ${drillResult.completedSteps}/${drillResult.totalSteps} pasos completados.`,
        lastTested: drillResult.startTime,
      },
      'SOX_ITGC_04': {
        control: 'SOX-ITGC-04 — IT Operations and Disaster Recovery',
        description: 'Controles generales de TI para operaciones y recuperación ante desastres',
        status: drillResult.status === 'SUCCESS' && rtoMet && rpoMet ? 'COMPLIANT' : 'NON_COMPLIANT',
        evidence: `DR Drill completado. RTO: ${rtoMet ? 'CUMPLIDO' : 'NO CUMPLIDO'} (${rtoActualMinutes}/${rtoTargetMinutes} min). RPO: ${rpoMet ? 'CUMPLIDO' : 'NO CUMPLIDO'}. Drill status: ${drillResult.status}.`,
        lastTested: drillResult.startTime,
      },
    },

    // Recomendaciones de mejora
    recommendations: [],
  };

  // Generar recomendaciones basadas en resultados
  if (drillResult.status !== 'SUCCESS') {
    report.recommendations.push({
      priority: 'HIGH',
      area: 'Ejecución del Drill',
      recommendation: `El drill finalizó con estado ${drillResult.status}. Revisar los pasos fallidos y corregir la configuración antes de la próxima ejecución.`,
    });
  }

  if (!rtoMet) {
    report.recommendations.push({
      priority: 'HIGH',
      area: 'Recovery Time Objective (RTO)',
      recommendation: `El RTO excedió el objetivo por ${rtoActualMinutes - rtoTargetMinutes} minutos. Considerar: optimizar scripts de recuperación, mejorar infraestructura de red, pre-configurar recursos de failover.`,
    });
  }

  if (!rpoMet) {
    report.recommendations.push({
      priority: 'CRITICAL',
      area: 'Recovery Point Objective (RPO)',
      recommendation: `El RPO no fue cumplido. ${dataSteps.length - dataStepsSuccessful} paso(s) de integridad de datos fallaron. Investigar inmediatamente: verificar procesos de backup, validar configuración de replicación.`,
    });
  }

  // Recomendaciones generales
  const failedSteps = (drillResult.steps || []).filter(s => s.status !== 'SUCCESS');
  for (const step of failedSteps) {
    report.recommendations.push({
      priority: 'MEDIUM',
      area: `Paso: ${step.name}`,
      recommendation: `El paso "${step.name}" falló con estado ${step.status}. Salida: ${(step.output || '').substring(0, 200)}. Revisar configuración y permisos.`,
    });
  }

  if (report.recommendations.length === 0) {
    report.recommendations.push({
      priority: 'LOW',
      area: 'General',
      recommendation: 'DR Drill completado exitosamente. Continuar con la frecuencia de testing establecida. Considerar aumentar la complejidad de los escenarios de prueba.',
    });
  }

  log.info('Reporte generado', { reportId: report.reportId, recommendations: report.recommendations.length });
  return report;
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event) => {
  log.initFromEvent(event);
  log.info('Scheduler Engine invocado');
  const startTime = Date.now();

  try {
    // v1.0 — H17: Recovery Pipeline — recuperar orquestaciones fallidas
    const recoveryResult = await recoverFailedOrchestrations();
    if (recoveryResult.recovered > 0 || recoveryResult.abandoned > 0) {
      log.info('Recovery Pipeline resultado', { recovered: recoveryResult.recovered, abandoned: recoveryResult.abandoned });
    }

    const operations = await getScheduledOperations();

    if (operations.length === 0) {
      const duration = Date.now() - startTime;
      log.info('Sin operaciones pendientes', { durationMs: duration });
      return { statusCode: 200, body: { message: 'Sin operaciones pendientes', recovery: recoveryResult, duration: `${duration}ms` } };
    }

    log.info('Procesando operaciones', { count: operations.length });
    const results = [];

    for (const operation of operations) {
      try {
        // ─── v1.0 — H35: Trial Mode — verificar restricciones para esta operación ───
        let opTrialConfig = null;
        let opIsTrial = false;
        try {
          opTrialConfig = await getTrialConfig(operation.systemId);
          opIsTrial = opTrialConfig.mode === 'TRIAL';
        } catch (trialErr) {
          // No-bloqueante: continuar en modo normal si falla
          log.warn('Error obteniendo config trial', { systemId: operation.systemId, error: trialErr.message });
        }

        // v1.0 — H35: En trial, los DR drills están deshabilitados
        if (opIsTrial && opTrialConfig.drDrillsEnabled === false && (operation.type === 'DR_DRILL' || operation.operationType === 'DR_DRILL')) {
          log.info('DR Drill deshabilitado en modo trial', { operationId: operation.operationId });
          await updateOperationStatus(operation, 'SKIPPED_TRIAL', {
            reason: 'DR Drills deshabilitados en modo trial',
            mode: 'TRIAL',
          });
          results.push({
            operationId: operation.operationId,
            status: 'SKIPPED_TRIAL',
            type: 'DR_DRILL',
            reason: 'DR Drills deshabilitados en modo trial',
            mode: 'TRIAL',
          });
          continue;
        }

        // H28 — DR Drill: si la operacion es tipo DR_DRILL, ejecutar drill especializado
        if (operation.type === 'DR_DRILL') {
          log.info('Operacion DR_DRILL detectada', { operationId: operation.operationId, drillType: operation.drillType });

          const locked = await lockOperation(operation);
          if (!locked) {
            results.push({ operationId: operation.operationId, skipped: true, reason: 'Ya en proceso' });
            continue;
          }

          // Obtener config del sistema para instanceId y osType
          let sysConfig = null;
          try {
            const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
            const param = await ssmClient.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
            const config = JSON.parse(param.Parameter.Value);
            sysConfig = config.find(s => s.systemId === operation.systemId) || null;
          } catch (cfgErr) { /* sin config disponible */ }

          const drillResult = await executeDRDrill(operation.systemId, operation, sysConfig);

          // Generar reporte de compliance
          const drillReport = generateDRReport(drillResult);

          // Guardar resultado y reporte en DynamoDB
          await updateOperationStatus(operation, drillResult.status, {
            drillResult,
            complianceReport: drillReport,
          });

          results.push({
            operationId: operation.operationId,
            status: drillResult.status,
            type: 'DR_DRILL',
            drillType: operation.drillType,
            completedSteps: drillResult.completedSteps,
            totalSteps: drillResult.totalSteps,
            duration: drillResult.duration,
            complianceReportId: drillReport.reportId,
          });
          continue;
        }

        results.push(await processOperation(operation));
      } catch (err) {
        log.error('Error procesando operacion', { operationId: operation.operationId, error: err.message, stack: err.stack });
        await updateOperationStatus(operation, 'FAILED', { error: err.message });
        results.push({ operationId: operation.operationId, status: 'FAILED', error: err.message });
      }
    }

    const duration = Date.now() - startTime;
    const completed = results.filter(r => r.status === 'COMPLETED').length;
    const failed = results.filter(r => r.status === 'FAILED').length;
    const escalated = results.filter(r => r.status === 'PENDING_APPROVAL').length;
    const drDrills = results.filter(r => r.type === 'DR_DRILL').length;

    log.info('Ejecucion completada', { completed, failed, escalated, drDrills, durationMs: duration });
    return {
      statusCode: 200,
      body: { message: `Procesadas ${results.length} operaciones`, completed, failed, escalated, drDrills, recovery: recoveryResult, results, duration: `${duration}ms` },
    };
  } catch (err) {
    log.error('Error fatal', { error: err.message, stack: err.stack });
    return { statusCode: 500, body: { error: err.message } };
  }
};
