'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.4 — Modelo Unificado de Ejecucion
//  Scan, simulacion, runbook y remediacion son "Execution".
//  Un solo formato para historial, auditoria y UI.
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');

// Tipos de ejecucion
const EXECUTION_TYPES = Object.freeze({
  RUNBOOK: 'RUNBOOK',
  SCHEDULED: 'SCHEDULED',
  SIMULATION: 'SIMULATION',
  SCAN: 'SCAN',
  CHAIN: 'CHAIN',
});

// Estados posibles
const EXECUTION_STATES = Object.freeze({
  PENDING: 'PENDING',
  EXECUTING: 'EXECUTING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
});

// Triggers
const EXECUTION_TRIGGERS = Object.freeze({
  BREACH: 'breach',
  SCHEDULE: 'schedule',
  APPROVAL: 'approval',
  MANUAL: 'manual',
  CHAIN: 'chain',
});

/**
 * Genera un executionId determinista basado en los parametros de la ejecucion.
 * Mismos inputs siempre producen el mismo ID (idempotencia).
 */
function generateExecutionId(systemId, runbookId, timestamp) {
  const input = `${systemId}:${runbookId}:${timestamp}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Crea un nuevo objeto Execution con todos los campos necesarios.
 */
function createExecution({ type, systemId, sid, runbookId, triggeredBy, dryRun = false, requestedBy = 'system', metadata = {} }) {
  const now = new Date().toISOString();
  const executionId = generateExecutionId(systemId, runbookId || type, now);

  return {
    executionId,
    type: type || EXECUTION_TYPES.RUNBOOK,
    systemId,
    sid,
    runbookId: runbookId || null,
    status: EXECUTION_STATES.PENDING,
    triggeredBy: triggeredBy || EXECUTION_TRIGGERS.BREACH,
    requestedBy,
    dryRun,
    startedAt: now,
    completedAt: null,
    policyDecision: null,
    artifacts: [],
    evidencePackRef: null,
    error: null,
    metadata,
  };
}

/**
 * Marca una ejecucion como completada exitosamente.
 */
function completeExecution(execution, result = {}) {
  return {
    ...execution,
    status: EXECUTION_STATES.SUCCESS,
    completedAt: new Date().toISOString(),
    artifacts: result.artifacts || execution.artifacts,
    evidencePackRef: result.evidencePackRef || execution.evidencePackRef,
    output: result.output || null,
    ssmStatus: result.ssmStatus || null,
  };
}

/**
 * Marca una ejecucion como fallida.
 */
function failExecution(execution, error) {
  return {
    ...execution,
    status: EXECUTION_STATES.FAILED,
    completedAt: new Date().toISOString(),
    error: {
      message: typeof error === 'string' ? error : error.message,
      code: error.code || 'UNKNOWN',
      stack: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : null,
    },
  };
}

/**
 * Marca una ejecucion como saltada (no ejecutada).
 */
function skipExecution(execution, reason) {
  return {
    ...execution,
    status: EXECUTION_STATES.SKIPPED,
    completedAt: new Date().toISOString(),
    error: { message: reason, code: 'SKIPPED' },
  };
}

module.exports = {
  EXECUTION_TYPES,
  EXECUTION_STATES,
  EXECUTION_TRIGGERS,
  generateExecutionId,
  createExecution,
  completeExecution,
  failExecution,
  skipExecution,
};
