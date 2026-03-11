'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.5 — HA Orchestration Types
//  JSDoc typedefs, enums, and interface definitions for
//  High Availability orchestration (failover/takeover/failback).
// ═══════════════════════════════════════════════════════════════

// ─── Enums ───

/** Tipo de operacion HA */
const OperationType = Object.freeze({
  FAILOVER: 'FAILOVER',    // Failover automatico por falla detectada
  TAKEOVER: 'TAKEOVER',    // Takeover manual planificado (maintenance)
  FAILBACK: 'FAILBACK',    // Retorno al nodo primario original
});

/** Estado de una operacion HA */
const OperationStatus = Object.freeze({
  PLANNED: 'PLANNED',
  PREREQUISITES_CHECK: 'PREREQUISITES_CHECK',
  EXECUTING: 'EXECUTING',
  ROLLBACK: 'ROLLBACK',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

/** Tipo de driver */
const DriverType = Object.freeze({
  NETWORK: 'NETWORK',
  DB: 'DB',
  SAP: 'SAP',
});

/** Estrategia de switching de red */
const NetworkStrategy = Object.freeze({
  EIP: 'EIP',              // AWS Elastic IP reassociation
  ROUTE53: 'ROUTE53',      // Route53 DNS failover
  PACEMAKER_VIP: 'PACEMAKER_VIP', // Pacemaker Virtual IP
});

/** Estado de un step individual */
const StepStatus = Object.freeze({
  PENDING: 'PENDING',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
  SKIPPED: 'SKIPPED',
});

/** Estado de un prerequisito */
const PrerequisiteStatus = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIP: 'SKIP',
});

/** Modo de replicacion HANA SR */
const ReplicationMode = Object.freeze({
  SYNC: 'SYNC',
  SYNCMEM: 'SYNCMEM',
  ASYNC: 'ASYNC',
});

// ─── JSDoc Typedefs ───

/**
 * @typedef {Object} HAOperation
 * @property {string} operationId - UUID unico de la operacion
 * @property {string} systemId - ID del sistema SAP (e.g., 'SAP-PRD-01')
 * @property {string} sid - SID del sistema (e.g., 'PRD')
 * @property {string} operationType - FAILOVER|TAKEOVER|FAILBACK
 * @property {string} status - PLANNED|PREREQUISITES_CHECK|EXECUTING|ROLLBACK|COMPLETED|FAILED|CANCELLED
 * @property {string} triggeredBy - Email/ID del usuario o 'SYSTEM' para automatico
 * @property {string} reason - Razon de la operacion
 * @property {HAStep[]} plannedSteps - Pasos planificados
 * @property {HAStep[]} executedSteps - Pasos ejecutados (con resultados)
 * @property {Object} evidencePack - Evidence pack de la operacion
 * @property {string} networkStrategy - EIP|ROUTE53|PACEMAKER_VIP
 * @property {string} dbStrategy - HANA_SR|DECLARATIVE
 * @property {string} sapStrategy - SAP_SERVICES
 * @property {Object} sourceNode - {instanceId, hostname, role:'PRIMARY'}
 * @property {Object} targetNode - {instanceId, hostname, role:'SECONDARY'}
 * @property {Object} timestamps - {createdAt, startedAt, completedAt, cancelledAt}
 * @property {number} estimatedDurationMs - Duracion estimada en ms
 * @property {string} rollbackReason - Razon del rollback (si aplica)
 * @property {Object} error - Error details (si fallo)
 */

/**
 * @typedef {Object} HAStep
 * @property {string} stepId - ID unico del paso
 * @property {number} order - Orden de ejecucion (1, 2, 3...)
 * @property {string} name - Nombre descriptivo del paso
 * @property {string} driverType - NETWORK|DB|SAP
 * @property {string} driverName - Nombre especifico del driver
 * @property {string} action - Accion a ejecutar (e.g., 'switchEip', 'takeoverDb')
 * @property {Object} config - Configuracion especifica del paso
 * @property {string} status - PENDING|EXECUTING|COMPLETED|FAILED|ROLLED_BACK|SKIPPED
 * @property {number} timeoutMs - Timeout del paso en ms
 * @property {boolean} canRollback - Si el paso es reversible
 * @property {Object} result - Resultado de la ejecucion
 * @property {Object} evidence - Evidence entry del paso
 * @property {Object} timestamps - {startedAt, completedAt}
 * @property {number} durationMs - Duracion real en ms
 */

/**
 * @typedef {Object} HAPrerequisite
 * @property {string} name - Nombre del check (e.g., 'checkReplicationHealth')
 * @property {string} displayName - Nombre para mostrar en UI
 * @property {string} description - Descripcion del check
 * @property {string} status - PASS|FAIL|WARN|SKIP
 * @property {boolean} required - Si es obligatorio pasar
 * @property {string} details - Detalles del resultado
 * @property {string} lastChecked - ISO timestamp del ultimo check
 * @property {string} remediation - Como solucionar si falla
 */

/**
 * @typedef {Object} HADriverConfig
 * @property {string} driverType - NETWORK|DB|SAP
 * @property {string} driverName - Nombre unico del driver
 * @property {string} version - Version del driver
 * @property {Object} config - Configuracion especifica
 * @property {boolean} enabled - Si esta habilitado
 * @property {string} description - Descripcion del driver
 */

/**
 * @typedef {Object} HASystemInfo
 * @property {string} systemId
 * @property {string} sid
 * @property {boolean} haEnabled
 * @property {string} haStatus - HEALTHY|DEGRADED|FAILOVER_IN_PROGRESS|NOT_CONFIGURED|UNKNOWN
 * @property {Object} primaryNode - {instanceId, hostname, ip, zone}
 * @property {Object} secondaryNode - {instanceId, hostname, ip, zone}
 * @property {string} networkStrategy
 * @property {string} dbType - HANA|ASE|ORACLE|MAXDB
 * @property {string} replicationMode - SYNC|SYNCMEM|ASYNC
 * @property {string} replicationStatus - SOK|SFAIL|SYNCING|UNKNOWN
 * @property {HAPrerequisite[]} prerequisites
 * @property {HAOperation} lastOperation
 */

// ─── Interfaces (documented via JSDoc for runtime validation) ───

/**
 * Interface for network switch drivers.
 * All network drivers must implement these methods.
 *
 * @typedef {Object} INetworkDriver
 * @property {function(Object): Promise<Object>} validateConfig
 * @property {function(Object): Promise<HAPrerequisite[]>} checkPrerequisites
 * @property {function(HAStep, Object): Promise<Object>} executeStep
 * @property {function(HAStep, Object): Promise<Object>} rollbackStep
 * @property {function(Object): Promise<Object>} healthCheck
 */

/**
 * Interface for database HA drivers.
 * @typedef {Object} IDbHaDriver
 * @property {function(Object): Promise<Object>} validateConfig
 * @property {function(Object): Promise<HAPrerequisite[]>} checkPrerequisites
 * @property {function(HAStep, Object): Promise<Object>} executeStep
 * @property {function(HAStep, Object): Promise<Object>} rollbackStep
 * @property {function(Object): Promise<Object>} healthCheck
 */

/**
 * Interface for SAP services drivers.
 * @typedef {Object} ISapHaDriver
 * @property {function(Object): Promise<Object>} validateConfig
 * @property {function(Object): Promise<HAPrerequisite[]>} checkPrerequisites
 * @property {function(HAStep, Object): Promise<Object>} executeStep
 * @property {function(HAStep, Object): Promise<Object>} rollbackStep
 * @property {function(Object): Promise<Object>} healthCheck
 */

// ─── Factory helpers ───

function createHAOperation({ systemId, sid, operationType, triggeredBy, reason, networkStrategy, dbStrategy, sapStrategy, sourceNode, targetNode }) {
  const crypto = require('crypto');
  const operationId = crypto.randomUUID();
  return {
    pk: `HA_OP#${operationId}`,
    sk: 'META',
    operationId,
    systemId,
    sid,
    operationType,
    status: OperationStatus.PLANNED,
    triggeredBy,
    reason: reason || '',
    plannedSteps: [],
    executedSteps: [],
    evidencePack: { entries: [], hash: null },
    networkStrategy: networkStrategy || NetworkStrategy.EIP,
    dbStrategy: dbStrategy || 'HANA_SR',
    sapStrategy: sapStrategy || 'SAP_SERVICES',
    sourceNode: sourceNode || {},
    targetNode: targetNode || {},
    timestamps: {
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
    },
    estimatedDurationMs: 0,
    rollbackReason: null,
    error: null,
  };
}

function createHAStep({ order, name, driverType, driverName, action, config, timeoutMs, canRollback }) {
  const crypto = require('crypto');
  return {
    stepId: crypto.randomUUID(),
    order,
    name,
    driverType,
    driverName,
    action,
    config: config || {},
    status: StepStatus.PENDING,
    timeoutMs: timeoutMs || 120000,
    canRollback: canRollback !== false,
    result: null,
    evidence: null,
    timestamps: { startedAt: null, completedAt: null },
    durationMs: 0,
  };
}

function createPrerequisiteResult({ name, displayName, description, status, required, details, remediation }) {
  return {
    name,
    displayName: displayName || name,
    description: description || '',
    status: status || PrerequisiteStatus.SKIP,
    required: required !== false,
    details: details || '',
    lastChecked: new Date().toISOString(),
    remediation: remediation || '',
  };
}

module.exports = {
  // Enums
  OperationType,
  OperationStatus,
  DriverType,
  NetworkStrategy,
  StepStatus,
  PrerequisiteStatus,
  ReplicationMode,
  // Factories
  createHAOperation,
  createHAStep,
  createPrerequisiteResult,
};
