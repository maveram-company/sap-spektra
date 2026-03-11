// ============================================================================
//  Avvale SAP AlwaysOps v2.0 — SSM Command Poller
//  Módulo compartido para ejecutar comandos SSM con polling robusto.
//  Implementa exponential backoff con jitter para evitar throttling.
// ============================================================================

'use strict';

const { SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');

/**
 * Ejecuta un comando SSM y espera el resultado con exponential backoff.
 * Reemplaza los loops de polling fijo (3s/5s) en todas las Lambdas.
 *
 * @param {SSMClient} ssm - Cliente SSM inicializado
 * @param {string} instanceId - ID de la instancia EC2 destino
 * @param {string[]} commands - Array de comandos shell a ejecutar
 * @param {object} [options] - Opciones de configuración
 * @param {string} [options.osType='LINUX'] - Tipo de OS (LINUX|WINDOWS)
 * @param {number} [options.commandTimeoutSeconds=60] - Timeout del comando SSM
 * @param {number} [options.initialDelayMs=2000] - Delay inicial entre polls
 * @param {number} [options.maxDelayMs=15000] - Delay máximo entre polls
 * @param {number} [options.backoffMultiplier=1.5] - Factor de backoff exponencial
 * @param {number} [options.maxWaitMs] - Timeout total de espera (default: env SSM_TIMEOUT_MS o 90000)
 * @param {number} [options.jitterMs=500] - Jitter aleatorio máximo por poll
 * @param {object} [options.logger] - Logger para trazabilidad
 * @returns {Promise<object>} - Resultado: { success, status, output, errorOutput, commandId, durationMs }
 */
async function ssmRunWithBackoff(ssm, instanceId, commands, options = {}) {
  const {
    osType = 'LINUX',
    commandTimeoutSeconds = 60,
    initialDelayMs = 2000,
    maxDelayMs = 15000,
    backoffMultiplier = 1.5,
    maxWaitMs = parseInt(process.env.SSM_TIMEOUT_MS || '90000'),
    jitterMs = 500,
    logger = console,
  } = options;

  const startTime = Date.now();
  const logPrefix = `[SSM-Poller]`;

  // ── Paso 1: Enviar comando ──
  logger.log(`${logPrefix} Enviando comando a ${instanceId} (OS: ${osType}, timeout: ${commandTimeoutSeconds}s)...`);

  let sendRes;
  try {
    sendRes = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: osType === 'WINDOWS' ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript',
      Parameters: { commands },
      TimeoutSeconds: commandTimeoutSeconds,
    }));
  } catch (sendErr) {
    const durationMs = Date.now() - startTime;
    logger.error(`${logPrefix} Error enviando comando a ${instanceId}: ${sendErr.message}`);
    return {
      success: false,
      status: 'SEND_FAILED',
      output: '',
      errorOutput: sendErr.message,
      commandId: null,
      durationMs,
      errorClass: classifyError(sendErr),
    };
  }

  const commandId = sendRes.Command.CommandId;
  logger.log(`${logPrefix} Comando ${commandId} enviado. Polling con backoff (initial: ${initialDelayMs}ms, max: ${maxDelayMs}ms)...`);

  // ── Paso 2: Polling con exponential backoff + jitter ──
  let delay = initialDelayMs;
  let invRes = null;
  let pollCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    // Aplicar jitter aleatorio para evitar thundering herd
    const actualDelay = delay + Math.floor(Math.random() * jitterMs);
    await new Promise(r => setTimeout(r, actualDelay));
    pollCount++;

    try {
      invRes = await ssm.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      }));

      // Si ya terminó (Success, Failed, TimedOut, Cancelled), salir del loop
      if (!['InProgress', 'Pending', 'Delayed'].includes(invRes.Status)) {
        break;
      }

      logger.log(`${logPrefix} Comando ${commandId} poll #${pollCount}: ${invRes.Status} (delay: ${actualDelay}ms)`);
    } catch (pollErr) {
      if (pollErr.name === 'InvocationDoesNotExist') {
        // El comando aún no llegó al agente SSM — esperar y reintentar
        logger.log(`${logPrefix} Comando ${commandId} aún no disponible en agente (poll #${pollCount})`);
      } else {
        // Error inesperado en polling — terminar
        const durationMs = Date.now() - startTime;
        logger.error(`${logPrefix} Error inesperado en polling ${commandId}: ${pollErr.message}`);
        return {
          success: false,
          status: 'POLL_ERROR',
          output: '',
          errorOutput: pollErr.message,
          commandId,
          durationMs,
          pollCount,
          errorClass: classifyError(pollErr),
        };
      }
    }

    // Exponential backoff: multiplicar delay pero no exceder maxDelay
    delay = Math.min(delay * backoffMultiplier, maxDelayMs);
  }

  const durationMs = Date.now() - startTime;

  // ── Paso 3: Evaluar resultado ──
  if (!invRes || ['InProgress', 'Pending', 'Delayed'].includes(invRes.Status)) {
    logger.warn(`${logPrefix} Comando ${commandId} TIMEOUT después de ${durationMs}ms (${pollCount} polls)`);
    return {
      success: false,
      status: 'TIMEOUT_WAITING',
      output: '',
      errorOutput: `Comando no completó en ${maxWaitMs / 1000}s`,
      commandId,
      durationMs,
      pollCount,
    };
  }

  const result = {
    success: invRes.Status === 'Success',
    status: invRes.Status,
    output: invRes.StandardOutputContent || '',
    errorOutput: invRes.StandardErrorContent || '',
    commandId,
    durationMs,
    pollCount,
    responseCode: invRes.ResponseCode,
  };

  if (result.success) {
    logger.log(`${logPrefix} Comando ${commandId} completado OK en ${durationMs}ms (${pollCount} polls)`);
  } else {
    logger.warn(`${logPrefix} Comando ${commandId} falló: ${invRes.Status} (RC: ${invRes.ResponseCode}) en ${durationMs}ms`);
  }

  return result;
}

/**
 * Clasifica errores SSM para logging y métricas.
 *
 * @param {Error} err - Error capturado
 * @returns {string} - Clasificación del error
 */
function classifyError(err) {
  if (err.name === 'InvalidInstanceId') return 'INSTANCE_OFFLINE';
  if (err.name === 'AccessDeniedException') return 'PERMISSION_DENIED';
  if (err.name === 'ThrottlingException' || (err.message && err.message.includes('throttl'))) return 'THROTTLED';
  if (err.name === 'InvalidDocument') return 'INVALID_DOCUMENT';
  if (err.name === 'UnsupportedPlatformType') return 'UNSUPPORTED_PLATFORM';
  if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') return 'NETWORK_ERROR';
  return 'UNKNOWN';
}

module.exports = {
  ssmRunWithBackoff,
  classifyError,
};
