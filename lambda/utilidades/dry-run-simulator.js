'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.4 — Dry-Run Simulator
//  Simulador que evalua prechecks, policy, capabilities y estima
//  impacto/costo SIN ejecutar comandos reales via SSM.
//  NUNCA ejecuta SSM commands reales.
// ═══════════════════════════════════════════════════════════════

const { evaluatePolicy } = require('./policy-engine');
const { canExecuteRunbook } = require('./capabilities-matrix');
const { evaluatePrechecks } = require('./runbook-schema');
const { createExecution, completeExecution, EXECUTION_TYPES, EXECUTION_TRIGGERS } = require('./execution-model');

/**
 * Simula una ejecucion completa sin ejecutar comandos reales.
 *
 * @param {object} params
 * @param {string} params.runbookId - ID del runbook
 * @param {string} params.systemId - ID del sistema
 * @param {string} params.sid - SAP SID
 * @param {object} params.runbookDefinition - Definicion declarativa del runbook (si disponible)
 * @param {object} params.capabilities - Matriz de capacidades
 * @param {object} params.breach - Datos del breach/metrica
 * @param {string[]} params.commands - Comandos que se ejecutarian
 * @param {object} params.context - Contexto adicional (environment, userRole, etc.)
 * @returns {object} - Resultado de la simulacion
 */
async function simulateExecution({ runbookId, systemId, sid, runbookDefinition, capabilities, breach, commands, context = {} }) {
  const execution = createExecution({
    type: EXECUTION_TYPES.SIMULATION,
    systemId,
    sid,
    runbookId,
    triggeredBy: EXECUTION_TRIGGERS.MANUAL,
    dryRun: true,
    requestedBy: context.requestedBy || 'simulator',
  });

  const simulationResult = {
    execution,
    steps: [],
    summary: {},
  };

  // PASO 1: Evaluar politica
  const policyResult = await evaluatePolicy('execute', {
    ...context,
    dryRun: true,
    runbookId,
    severity: breach?.severity,
    costSafe: breach?.costSafe,
  });
  simulationResult.steps.push({
    step: 'POLICY_CHECK',
    result: policyResult.allowed ? 'PASS' : 'BLOCKED',
    details: policyResult,
  });

  // PASO 2: Verificar capabilities
  if (capabilities) {
    const capResult = canExecuteRunbook(capabilities, runbookId);
    simulationResult.steps.push({
      step: 'CAPABILITY_CHECK',
      result: capResult.allowed ? 'PASS' : 'BLOCKED',
      details: capResult,
    });
  }

  // PASO 3: Evaluar prechecks (si hay runbook declarativo)
  if (runbookDefinition && runbookDefinition.prechecks) {
    const precheckResult = evaluatePrechecks(runbookDefinition.prechecks, {
      capabilities,
      facts: context.facts || {},
      changeWindow: context.changeWindow !== false,
    });
    simulationResult.steps.push({
      step: 'PRECHECK',
      result: precheckResult.passed ? 'PASS' : 'BLOCKED',
      details: precheckResult,
    });
  }

  // PASO 4: Listar comandos que SE EJECUTARIAN (sin ejecutarlos)
  simulationResult.steps.push({
    step: 'COMMAND_LIST',
    result: 'SIMULATED',
    details: {
      commandCount: (commands || []).length,
      commands: (commands || []).map((cmd, i) => ({
        index: i + 1,
        command: cmd.length > 100 ? cmd.slice(0, 100) + '...' : cmd,
        wouldExecuteVia: 'SSM SendCommand',
      })),
    },
  });

  // PASO 5: Estimar costo/impacto
  const costEstimate = estimateCost(runbookId, breach);
  simulationResult.steps.push({
    step: 'COST_ESTIMATE',
    result: 'ESTIMATED',
    details: costEstimate,
  });

  // Resumen
  const allPassed = simulationResult.steps.every(s => s.result !== 'BLOCKED');
  simulationResult.summary = {
    canExecute: allPassed,
    blockedSteps: simulationResult.steps.filter(s => s.result === 'BLOCKED').map(s => s.step),
    estimatedDuration: `${(commands || []).length * 10}s`,
    costEstimate,
    commandCount: (commands || []).length,
    mode: 'DRY-RUN (sin ejecucion real)',
  };

  // Completar la ejecucion simulada
  simulationResult.execution = completeExecution(execution, {
    output: '[DRY-RUN] Simulacion completada. Ningun comando fue ejecutado.',
  });

  return simulationResult;
}

/**
 * Estima costo de un runbook (basico).
 */
function estimateCost(runbookId, breach) {
  const costModels = {
    'RB-ASE-002': { type: 'EBS_EXPANSION', estimatedUSD: 8.0, unit: 'per 100GB gp3/month' },
    'RB-HANA-002': { type: 'EBS_EXPANSION', estimatedUSD: 12.5, unit: 'per 100GB io2/month' },
    'default': { type: 'COMPUTE_ONLY', estimatedUSD: 0.0, unit: 'sin costo adicional' },
  };

  return costModels[runbookId] || costModels['default'];
}

module.exports = {
  simulateExecution,
  estimateCost,
};
