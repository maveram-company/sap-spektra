'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.5 — Step Executor
//  Ejecuta secuencias de pasos de HA con checkpoints,
//  rollback automatico, evidence pack y timeout control.
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');
const { StepStatus, OperationStatus } = require('../ha-types');
const { registry } = require('./driver-registry');

class StepExecutor {
  /**
   * @param {Object} options
   * @param {number} options.globalTimeoutMs - Timeout global para toda la operacion (default: 30 min)
   * @param {Function} options.onStepStart - Callback cuando un step inicia
   * @param {Function} options.onStepComplete - Callback cuando un step completa
   * @param {Function} options.onStepFail - Callback cuando un step falla
   * @param {Function} options.onRollbackStart - Callback cuando inicia rollback
   * @param {Function} options.onProgress - Callback para progreso general
   */
  constructor(options = {}) {
    this.globalTimeoutMs = options.globalTimeoutMs || 30 * 60 * 1000; // 30 min
    this.onStepStart = options.onStepStart || (() => {});
    this.onStepComplete = options.onStepComplete || (() => {});
    this.onStepFail = options.onStepFail || (() => {});
    this.onRollbackStart = options.onRollbackStart || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this._evidence = [];
    this._cancelled = false;
  }

  /** Cancelar ejecucion en curso */
  cancel() {
    this._cancelled = true;
  }

  /**
   * Ejecutar secuencia de pasos
   * @param {Object} plan - Plan generado por plan-builder
   * @param {Object} context - Contexto de ejecucion (systemId, nodes, etc.)
   * @returns {Object} Resultado de la ejecucion
   */
  async executeStepSequence(plan, context) {
    const startTime = Date.now();
    const executedSteps = [];
    let currentStepIndex = 0;
    let status = OperationStatus.EXECUTING;
    let error = null;
    this._cancelled = false;
    this._evidence = [];

    try {
      // Timeout global
      const globalTimer = setTimeout(() => {
        this._cancelled = true;
        error = new Error(`Timeout global excedido: ${this.globalTimeoutMs}ms`);
      }, this.globalTimeoutMs);

      for (const step of plan.steps) {
        // Verificar cancelacion
        if (this._cancelled) {
          step.status = StepStatus.SKIPPED;
          executedSteps.push(step);
          status = OperationStatus.FAILED;
          if (!error) error = new Error('Operacion cancelada');
          break;
        }

        currentStepIndex++;
        this.onProgress({
          currentStep: currentStepIndex,
          totalSteps: plan.steps.length,
          stepName: step.name,
          percentage: Math.round((currentStepIndex / plan.steps.length) * 100),
        });

        try {
          // Ejecutar el step
          const result = await this._executeStep(step, context);
          step.status = StepStatus.COMPLETED;
          step.result = result;
          step.timestamps.completedAt = new Date().toISOString();
          step.durationMs = Date.now() - new Date(step.timestamps.startedAt).getTime();
          executedSteps.push(step);

          this.onStepComplete({ step, result });

          // Crear evidence entry
          this._addEvidence('step_completed', {
            stepId: step.stepId,
            stepName: step.name,
            duration: step.durationMs,
            result: result,
          });

        } catch (stepError) {
          step.status = StepStatus.FAILED;
          step.result = { error: stepError.message };
          step.timestamps.completedAt = new Date().toISOString();
          step.durationMs = Date.now() - new Date(step.timestamps.startedAt).getTime();
          executedSteps.push(step);

          this.onStepFail({ step, error: stepError });
          this._addEvidence('step_failed', {
            stepId: step.stepId,
            stepName: step.name,
            error: stepError.message,
          });

          // Iniciar rollback
          error = stepError;
          status = OperationStatus.ROLLBACK;
          this.onRollbackStart({ failedStep: step, error: stepError });

          await this._rollback(executedSteps, context);
          status = OperationStatus.FAILED;
          break;
        }
      }

      clearTimeout(globalTimer);

      if (status === OperationStatus.EXECUTING) {
        status = OperationStatus.COMPLETED;
      }

    } catch (fatalError) {
      status = OperationStatus.FAILED;
      error = fatalError;
      this._addEvidence('fatal_error', { error: fatalError.message });
    }

    const totalDuration = Date.now() - startTime;

    return {
      status,
      executedSteps,
      totalDurationMs: totalDuration,
      error: error ? { message: error.message, stack: error.stack } : null,
      evidence: this._evidence,
      summary: {
        totalSteps: plan.steps.length,
        completedSteps: executedSteps.filter(s => s.status === StepStatus.COMPLETED).length,
        failedSteps: executedSteps.filter(s => s.status === StepStatus.FAILED).length,
        rolledBackSteps: executedSteps.filter(s => s.status === StepStatus.ROLLED_BACK).length,
        skippedSteps: executedSteps.filter(s => s.status === StepStatus.SKIPPED).length,
      },
    };
  }

  /** Ejecutar un step individual con timeout */
  async _executeStep(step, context) {
    step.status = StepStatus.EXECUTING;
    step.timestamps.startedAt = new Date().toISOString();
    this.onStepStart({ step });

    // Steps de sistema (lock, evidence, health) se manejan internamente
    if (step.driverType === 'SYSTEM') {
      return this._executeSystemStep(step, context);
    }

    // Obtener driver del registro
    const driver = registry.getDriver(step.driverType, step.driverName);

    // Ejecutar con timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Step timeout: ${step.name} excedio ${step.timeoutMs}ms`)), step.timeoutMs);
    });

    return Promise.race([
      driver.executeStep(step, context),
      timeoutPromise,
    ]);
  }

  /** Ejecutar pasos de sistema (lock, evidence, health) */
  async _executeSystemStep(step, context) {
    switch (step.action) {
      case 'acquireLock':
        // Mock en modo local - en produccion usa DynamoDB
        return { locked: true, lockId: crypto.randomUUID(), ttl: step.config.ttlSeconds };

      case 'releaseLock':
        return { released: true };

      case 'capturePreState':
        return {
          capturedAt: new Date().toISOString(),
          systemId: step.config.systemId,
          sourceNode: step.config.sourceNode,
          targetNode: step.config.targetNode,
        };

      case 'verifyPostFailover':
      case 'verifyPostTakeover':
        // En produccion, verificar que SAP responde, DB accesible, etc.
        return { healthy: true, checkedAt: new Date().toISOString() };

      default:
        return { action: step.action, status: 'completed' };
    }
  }

  /** Ejecutar rollback de pasos completados (en orden inverso) */
  async _rollback(executedSteps, context) {
    const rollbackable = executedSteps
      .filter(s => s.status === StepStatus.COMPLETED && s.canRollback)
      .reverse();

    for (const step of rollbackable) {
      try {
        this._addEvidence('rollback_started', { stepId: step.stepId, stepName: step.name });

        if (step.driverType === 'SYSTEM') {
          // System steps: rollback simple
          step.status = StepStatus.ROLLED_BACK;
          continue;
        }

        const driver = registry.getDriver(step.driverType, step.driverName);
        await driver.rollbackStep(step, context);
        step.status = StepStatus.ROLLED_BACK;

        this._addEvidence('rollback_completed', { stepId: step.stepId, stepName: step.name });
      } catch (rollbackError) {
        // Rollback fallo — log pero continuar con otros
        this._addEvidence('rollback_failed', {
          stepId: step.stepId,
          stepName: step.name,
          error: rollbackError.message,
        });
        console.error(`Rollback fallo para step ${step.name}: ${rollbackError.message}`);
      }
    }
  }

  /** Agregar entrada de evidencia */
  _addEvidence(action, data) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      data,
      previousHash: this._evidence.length > 0
        ? this._evidence[this._evidence.length - 1].hash
        : null,
    };
    entry.hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ ...entry, hash: undefined }))
      .digest('hex');
    this._evidence.push(entry);
    return entry;
  }
}

module.exports = { StepExecutor };
