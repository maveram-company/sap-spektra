'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.5 — HA Plan Builder
//  Construye planes de ejecucion (failover/takeover/failback)
//  con pasos ordenados, dependencias y rollback plan.
// ═══════════════════════════════════════════════════════════════

const {
  OperationType,
  DriverType,
  NetworkStrategy,
  createHAStep,
} = require('../ha-types');
const { registry } = require('./driver-registry');

// Tiempos estimados por tipo de operacion (ms)
const ESTIMATED_TIMES = {
  NETWORK_SWITCH: {
    EIP: 15000,           // ~15s para EIP reassociation
    ROUTE53: 30000,       // ~30s para DNS propagation
    PACEMAKER_VIP: 20000, // ~20s para VIP move
  },
  DB_FAILOVER: {
    HANA_SR: 60000,       // ~60s para HANA SR takeover
    DECLARATIVE: 45000,   // ~45s generico
  },
  SAP_SWITCH: {
    SAP_SERVICES: 90000,  // ~90s para stop+start SAP
  },
  HEALTH_CHECK: 30000,    // ~30s para health verification
};

/**
 * Construye un plan de failover (automatico por falla)
 * Orden: Network → DB → SAP → Health
 */
function buildFailoverPlan(systemId, context) {
  const { networkStrategy, dbStrategy, sapStrategy, sourceNode, targetNode } = context;
  const steps = [];
  let order = 1;

  // Step 1: Acquire lock
  steps.push(createHAStep({
    order: order++,
    name: 'Adquirir lock exclusivo del sistema',
    driverType: 'SYSTEM',
    driverName: 'lock-manager',
    action: 'acquireLock',
    config: { systemId, ttlSeconds: 1800 },
    timeoutMs: 10000,
    canRollback: true,
  }));

  // Step 2: Pre-flight snapshot
  steps.push(createHAStep({
    order: order++,
    name: 'Capturar estado pre-failover',
    driverType: 'SYSTEM',
    driverName: 'evidence-collector',
    action: 'capturePreState',
    config: { systemId, sourceNode, targetNode },
    timeoutMs: 30000,
    canRollback: false,
  }));

  // Step 3: Network switch
  steps.push(createHAStep({
    order: order++,
    name: `Switch de red (${networkStrategy})`,
    driverType: DriverType.NETWORK,
    driverName: networkStrategy.toLowerCase(),
    action: 'switchToTarget',
    config: { sourceNode, targetNode, strategy: networkStrategy },
    timeoutMs: ESTIMATED_TIMES.NETWORK_SWITCH[networkStrategy] * 2 || 60000,
    canRollback: true,
  }));

  // Step 4: Database failover
  steps.push(createHAStep({
    order: order++,
    name: `Failover de base de datos (${dbStrategy})`,
    driverType: DriverType.DB,
    driverName: dbStrategy.toLowerCase().replace('_', '-'),
    action: 'takeover',
    config: { sourceNode, targetNode, strategy: dbStrategy },
    timeoutMs: ESTIMATED_TIMES.DB_FAILOVER[dbStrategy] * 2 || 120000,
    canRollback: true,
  }));

  // Step 5: SAP services restart on target
  steps.push(createHAStep({
    order: order++,
    name: 'Iniciar servicios SAP en nodo target',
    driverType: DriverType.SAP,
    driverName: 'sap-services',
    action: 'startOnTarget',
    config: { targetNode },
    timeoutMs: ESTIMATED_TIMES.SAP_SWITCH.SAP_SERVICES * 2 || 180000,
    canRollback: true,
  }));

  // Step 6: Health verification
  steps.push(createHAStep({
    order: order++,
    name: 'Verificacion de salud post-failover',
    driverType: 'SYSTEM',
    driverName: 'health-checker',
    action: 'verifyPostFailover',
    config: { systemId, targetNode },
    timeoutMs: ESTIMATED_TIMES.HEALTH_CHECK * 2 || 60000,
    canRollback: false,
  }));

  // Step 7: Release lock
  steps.push(createHAStep({
    order: order++,
    name: 'Liberar lock del sistema',
    driverType: 'SYSTEM',
    driverName: 'lock-manager',
    action: 'releaseLock',
    config: { systemId },
    timeoutMs: 10000,
    canRollback: false,
  }));

  const estimatedDuration = calculateEstimatedDuration(steps, context);

  return {
    operationType: OperationType.FAILOVER,
    systemId,
    steps,
    estimatedDurationMs: estimatedDuration,
    riskLevel: 'HIGH',
    rollbackPlan: buildRollbackSequence(steps),
    notes: [
      'Failover automatico: orden Network \u2192 DB \u2192 SAP',
      'Rollback disponible hasta completar step de DB',
      `Duracion estimada: ${Math.ceil(estimatedDuration / 1000)}s`,
    ],
  };
}

/**
 * Construye un plan de takeover (manual planificado)
 * Orden: SAP stop (source) → DB takeover → Network → SAP start (target) → Health
 */
function buildTakeoverPlan(systemId, context) {
  const { networkStrategy, dbStrategy, sapStrategy, sourceNode, targetNode } = context;
  const steps = [];
  let order = 1;

  // Step 1: Acquire lock
  steps.push(createHAStep({
    order: order++,
    name: 'Adquirir lock exclusivo del sistema',
    driverType: 'SYSTEM',
    driverName: 'lock-manager',
    action: 'acquireLock',
    config: { systemId, ttlSeconds: 3600 },
    timeoutMs: 10000,
    canRollback: true,
  }));

  // Step 2: Pre-flight snapshot
  steps.push(createHAStep({
    order: order++,
    name: 'Capturar estado pre-takeover',
    driverType: 'SYSTEM',
    driverName: 'evidence-collector',
    action: 'capturePreState',
    config: { systemId, sourceNode, targetNode },
    timeoutMs: 30000,
    canRollback: false,
  }));

  // Step 3: Stop SAP on source (graceful)
  steps.push(createHAStep({
    order: order++,
    name: 'Detener SAP en nodo primario (graceful)',
    driverType: DriverType.SAP,
    driverName: 'sap-services',
    action: 'stopOnSource',
    config: { sourceNode, graceful: true },
    timeoutMs: 180000,
    canRollback: true,
  }));

  // Step 4: Database takeover
  steps.push(createHAStep({
    order: order++,
    name: `Takeover de base de datos (${dbStrategy})`,
    driverType: DriverType.DB,
    driverName: dbStrategy.toLowerCase().replace('_', '-'),
    action: 'takeover',
    config: { sourceNode, targetNode, strategy: dbStrategy },
    timeoutMs: 120000,
    canRollback: true,
  }));

  // Step 5: Network switch
  steps.push(createHAStep({
    order: order++,
    name: `Switch de red (${networkStrategy})`,
    driverType: DriverType.NETWORK,
    driverName: networkStrategy.toLowerCase(),
    action: 'switchToTarget',
    config: { sourceNode, targetNode, strategy: networkStrategy },
    timeoutMs: 60000,
    canRollback: true,
  }));

  // Step 6: Start SAP on target
  steps.push(createHAStep({
    order: order++,
    name: 'Iniciar servicios SAP en nodo target',
    driverType: DriverType.SAP,
    driverName: 'sap-services',
    action: 'startOnTarget',
    config: { targetNode },
    timeoutMs: 180000,
    canRollback: true,
  }));

  // Step 7: Register old primary as secondary
  steps.push(createHAStep({
    order: order++,
    name: 'Registrar antiguo primario como secundario',
    driverType: DriverType.DB,
    driverName: dbStrategy.toLowerCase().replace('_', '-'),
    action: 'registerAsSecondary',
    config: { sourceNode, targetNode },
    timeoutMs: 120000,
    canRollback: false,
  }));

  // Step 8: Health verification
  steps.push(createHAStep({
    order: order++,
    name: 'Verificacion de salud post-takeover',
    driverType: 'SYSTEM',
    driverName: 'health-checker',
    action: 'verifyPostTakeover',
    config: { systemId, targetNode },
    timeoutMs: 60000,
    canRollback: false,
  }));

  // Step 9: Release lock
  steps.push(createHAStep({
    order: order++,
    name: 'Liberar lock del sistema',
    driverType: 'SYSTEM',
    driverName: 'lock-manager',
    action: 'releaseLock',
    config: { systemId },
    timeoutMs: 10000,
    canRollback: false,
  }));

  const estimatedDuration = calculateEstimatedDuration(steps, context);

  return {
    operationType: OperationType.TAKEOVER,
    systemId,
    steps,
    estimatedDurationMs: estimatedDuration,
    riskLevel: 'MEDIUM',
    rollbackPlan: buildRollbackSequence(steps),
    notes: [
      'Takeover planificado: orden SAP stop \u2192 DB \u2192 Network \u2192 SAP start \u2192 Re-register',
      'Downtime controlado durante el switch',
      `Duracion estimada: ${Math.ceil(estimatedDuration / 1000)}s`,
    ],
  };
}

/**
 * Construye un plan de failback (retorno al primario original)
 * Similar a takeover pero en direccion inversa
 */
function buildFailbackPlan(systemId, context) {
  // Failback = takeover con source/target invertidos
  const invertedContext = {
    ...context,
    sourceNode: context.targetNode,
    targetNode: context.sourceNode,
  };
  const plan = buildTakeoverPlan(systemId, invertedContext);
  plan.operationType = OperationType.FAILBACK;
  plan.riskLevel = 'MEDIUM';
  plan.notes = [
    'Failback: retorno al nodo primario original',
    'Orden identico al takeover pero con nodos invertidos',
    `Duracion estimada: ${Math.ceil(plan.estimatedDurationMs / 1000)}s`,
  ];
  return plan;
}

/** Calcular duracion estimada total del plan */
function calculateEstimatedDuration(steps, context) {
  let total = 0;
  for (const step of steps) {
    // Usar la mitad del timeout como estimacion
    total += Math.ceil(step.timeoutMs / 2);
  }
  return total;
}

/** Construir secuencia de rollback (pasos reversibles en orden inverso) */
function buildRollbackSequence(steps) {
  return steps
    .filter(s => s.canRollback)
    .reverse()
    .map((step, idx) => ({
      order: idx + 1,
      originalStepId: step.stepId,
      originalStepName: step.name,
      rollbackAction: `rollback_${step.action}`,
      driverType: step.driverType,
      driverName: step.driverName,
    }));
}

module.exports = {
  buildFailoverPlan,
  buildTakeoverPlan,
  buildFailbackPlan,
  calculateEstimatedDuration,
  buildRollbackSequence,
  ESTIMATED_TIMES,
};
