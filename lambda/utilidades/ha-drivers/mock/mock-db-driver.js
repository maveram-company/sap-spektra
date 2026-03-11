'use strict';

// =================================================================
//  Avvale SAP AlwaysOps v1.5 — Mock DB Driver
//  Simula operaciones de HANA System Replication (takeover/register)
//  con estados intermedios realistas (SYNCING -> TAKEOVER_IN_PROGRESS
//  -> PRIMARY). Soporta inyeccion de fallos y delays configurables.
// =================================================================

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType, ReplicationMode } = require('../../ha-types');

// Estados posibles de replicacion HANA SR simulados
const SrState = Object.freeze({
  SOK: 'SOK',               // Replicacion sincronizada
  SFAIL: 'SFAIL',           // Replicacion fallida
  SYNCING: 'SYNCING',       // Sincronizando (estado intermedio)
  TAKEOVER_IN_PROGRESS: 'TAKEOVER_IN_PROGRESS',  // Takeover en curso
  PRIMARY: 'PRIMARY',       // Nodo es primario
  SECONDARY: 'SECONDARY',   // Nodo es secundario
  UNKNOWN: 'UNKNOWN',       // Estado desconocido
  REGISTERING: 'REGISTERING', // Registrandose como secundario
});

class MockDbDriver extends BaseHaDriver {
  /**
   * @param {Object} config - Configuracion del driver mock de base de datos
   * @param {string} config.sid - HANA SID (e.g., 'HDB')
   * @param {string} config.instanceNumber - HANA instance number (e.g., '00')
   * @param {string} config.sourceInstanceId - EC2 ID del nodo primario
   * @param {string} config.targetInstanceId - EC2 ID del nodo secundario
   * @param {string} config.replicationMode - Modo de replicacion: SYNC|SYNCMEM|ASYNC
   * @param {number} config.minDelayMs - Delay minimo en ms (default: 3000)
   * @param {number} config.maxDelayMs - Delay maximo en ms (default: 8000)
   * @param {string} config.failOnStep - Metodo donde inyectar fallo
   * @param {number} config.failRate - Probabilidad de fallo 0-1 (default: 0)
   */
  constructor(config = {}) {
    super('mock-db', DriverType.DB, '1.0.0-mock');

    this.config = config;
    this.sid = config.sid || 'HDB';
    this.instanceNumber = config.instanceNumber || '00';
    this.replicationMode = config.replicationMode || ReplicationMode.SYNC;

    // Delays simulados (3-8 segundos por defecto — DB es mas lento que red)
    this.minDelayMs = config.minDelayMs != null ? config.minDelayMs : 3000;
    this.maxDelayMs = config.maxDelayMs != null ? config.maxDelayMs : 8000;

    // Inyeccion de fallos
    this.failOnStep = config.failOnStep || null;
    this.failRate = config.failRate || 0;

    // Estado simulado de replicacion SR
    this._srState = {
      sourceNode: {
        instanceId: config.sourceInstanceId || 'i-0abc123primary',
        role: 'PRIMARY',
        status: SrState.SOK,
        hanaRunning: true,
      },
      targetNode: {
        instanceId: config.targetInstanceId || 'i-0abc123secondary',
        role: 'SECONDARY',
        status: SrState.SOK,
        hanaRunning: true,
      },
      replicationMode: this.replicationMode,
      replicationStatus: SrState.SOK,
      logShippingDelta: '0.2s',
      lastSyncTimestamp: new Date().toISOString(),
    };

    // Historial de transiciones de estado
    this._stateTransitions = [];
  }

  // --- Utilidades internas ---

  /** Generar delay aleatorio dentro del rango */
  _randomDelay() {
    const range = this.maxDelayMs - this.minDelayMs;
    return this.minDelayMs + Math.floor(Math.random() * range);
  }

  /** Simular latencia con sleep */
  async _simulateDelay(operationName) {
    const delay = this._randomDelay();
    this.log('info', `[MOCK] Simulando latencia de ${delay}ms para ${operationName}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }

  /** Determinar si la operacion actual debe fallar */
  _shouldFail(stepName) {
    if (this.failOnStep !== stepName) return false;
    if (this.failRate <= 0) return false;
    return Math.random() < this.failRate;
  }

  /** Registrar transicion de estado en historial */
  _recordTransition(fromState, toState, action) {
    const transition = {
      timestamp: new Date().toISOString(),
      action,
      fromState,
      toState,
    };
    this._stateTransitions.push(transition);
    return transition;
  }

  // --- Metodos abstractos implementados ---

  /**
   * Validar configuracion del mock DB driver.
   */
  async validateConfig(config) {
    const c = config || this.config;
    const errors = [];

    if (!c.sid) errors.push('sid es requerido (HANA SID, e.g., HDB)');
    if (!c.instanceNumber) errors.push('instanceNumber es requerido (e.g., 00)');
    if (!c.sourceInstanceId) errors.push('sourceInstanceId es requerido');
    if (!c.targetInstanceId) errors.push('targetInstanceId es requerido');

    // Validar modo de replicacion
    const validModes = Object.values(ReplicationMode);
    if (c.replicationMode && !validModes.includes(c.replicationMode)) {
      errors.push(`Modo de replicacion no valido: ${c.replicationMode}. Validos: ${validModes.join(', ')}`);
    }

    this.createEvidenceEntry('validate_config', {
      valid: errors.length === 0,
      errors,
      sid: c.sid,
      replicationMode: c.replicationMode || 'SYNC',
    });

    return {
      valid: errors.length === 0,
      errors,
      config: c,
    };
  }

  /**
   * Verificar prerequisitos para takeover de HANA SR.
   * Simula checks de replicacion, HANA running, modo y log shipping.
   */
  async checkPrerequisites(context) {
    const cfg = { ...this.config, ...context };
    const checks = [];

    await this._simulateDelay('checkPrerequisites');

    // Check 1: Estado de replicacion SR
    checks.push({
      name: 'replication_health',
      displayName: 'Replicacion HANA SR',
      description: 'Verifica que HANA System Replication esta activo y sincronizado',
      status: this._srState.replicationStatus === SrState.SOK
        ? PrerequisiteStatus.PASS
        : PrerequisiteStatus.FAIL,
      required: true,
      details: `[MOCK] SR activo, modo ${this._srState.replicationMode}, estado ${this._srState.replicationStatus}`,
      lastChecked: new Date().toISOString(),
      remediation: this._srState.replicationStatus === SrState.SOK
        ? ''
        : 'Verificar estado de SR con systemReplicationStatus.py. Esperar sincronizacion antes de takeover.',
    });

    // Check 2: HANA corriendo en ambos nodos
    const bothRunning = this._srState.sourceNode.hanaRunning && this._srState.targetNode.hanaRunning;
    checks.push({
      name: 'hana_running',
      displayName: 'HANA Corriendo en Ambos Nodos',
      description: 'Verifica que HANA esta corriendo en source y target',
      status: bothRunning ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
      required: true,
      details: bothRunning
        ? `[MOCK] HANA corriendo en source (${this._srState.sourceNode.instanceId}) y target (${this._srState.targetNode.instanceId})`
        : `[MOCK] HANA no corriendo en todos los nodos`,
      lastChecked: new Date().toISOString(),
      remediation: bothRunning ? '' : 'Iniciar HANA en nodos donde no esta corriendo con sapcontrol',
    });

    // Check 3: Modo de replicacion
    const isSync = this._srState.replicationMode === ReplicationMode.SYNC;
    checks.push({
      name: 'replication_mode',
      displayName: 'Modo de Replicacion',
      description: 'Verifica el modo de replicacion configurado',
      status: isSync ? PrerequisiteStatus.PASS : PrerequisiteStatus.WARN,
      required: false,
      details: `[MOCK] Modo configurado: ${this._srState.replicationMode}${isSync ? '' : ' (SYNC recomendado para zero data loss)'}`,
      lastChecked: new Date().toISOString(),
      remediation: isSync ? '' : 'Considerar modo SYNC para zero data loss en produccion',
    });

    // Check 4: Log shipping al dia
    checks.push({
      name: 'log_shipping',
      displayName: 'Log Shipping Al Dia',
      description: 'Verifica que los logs de transaccion estan sincronizados',
      status: PrerequisiteStatus.PASS,
      required: true,
      details: `[MOCK] Log shipping al dia, delta: ${this._srState.logShippingDelta}`,
      lastChecked: new Date().toISOString(),
      remediation: '',
    });

    this.createEvidenceEntry('check_prerequisites', {
      checksCount: checks.length,
      allPassed: checks.every(c => c.status === PrerequisiteStatus.PASS || c.status === PrerequisiteStatus.WARN),
      replicationStatus: this._srState.replicationStatus,
    });

    return checks;
  }

  /**
   * Ejecutar operacion de base de datos.
   * Soporta acciones: 'takeover' y 'registerAsSecondary'.
   * Simula transiciones de estado intermedias realistas.
   */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const action = step.action;

    this.log('info', `[MOCK] Ejecutando HANA SR action: ${action}`, {
      sid: this.sid,
      instanceNumber: this.instanceNumber,
    });

    // Verificar inyeccion de fallos
    if (this._shouldFail('executeStep')) {
      const errorMsg = `[MOCK] Fallo inyectado en executeStep durante ${action} (failRate: ${this.failRate})`;
      this.log('error', errorMsg);
      this.createEvidenceEntry('execute_step_failed', {
        action,
        error: errorMsg,
        injectedFailure: true,
      });
      throw new Error(errorMsg);
    }

    switch (action) {
      case 'takeover':
        return this._executeTakeover(cfg);
      case 'registerAsSecondary':
        return this._executeRegister(cfg);
      default:
        throw new Error(`[MOCK] HANA SR: accion desconocida: ${action}`);
    }
  }

  /**
   * Simular takeover de HANA SR con estados intermedios.
   * Transicion: SOK -> SYNCING -> TAKEOVER_IN_PROGRESS -> PRIMARY
   */
  async _executeTakeover(cfg) {
    const targetInstanceId = cfg.targetNode?.instanceId || cfg.targetInstanceId || this._srState.targetNode.instanceId;
    const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId || this._srState.sourceNode.instanceId;
    const startTime = Date.now();

    // Estado previo para evidencia
    const preState = JSON.parse(JSON.stringify(this._srState));
    this.createEvidenceEntry('sr_status_pre_takeover', { srState: preState });

    // Fase 1: Verificar estado actual (SOK -> SYNCING)
    this.log('info', '[MOCK] Fase 1: Verificando sincronizacion final antes de takeover');
    this._srState.replicationStatus = SrState.SYNCING;
    this._recordTransition(SrState.SOK, SrState.SYNCING, 'pre_takeover_sync');
    await this._simulateDelay('verify_sync');

    this.createEvidenceEntry('sr_sync_verified', {
      status: SrState.SYNCING,
      logShippingDelta: this._srState.logShippingDelta,
    });

    // Fase 2: Ejecutar takeover (SYNCING -> TAKEOVER_IN_PROGRESS)
    this.log('info', '[MOCK] Fase 2: Ejecutando hdbnsutil -sr_takeover en nodo target');
    this._srState.replicationStatus = SrState.TAKEOVER_IN_PROGRESS;
    this._recordTransition(SrState.SYNCING, SrState.TAKEOVER_IN_PROGRESS, 'takeover_started');
    await this._simulateDelay('sr_takeover');

    this.createEvidenceEntry('sr_takeover_executed', {
      command: 'hdbnsutil -sr_takeover',
      status: SrState.TAKEOVER_IN_PROGRESS,
      targetInstanceId,
    });

    // Fase 3: Esperar a que sea PRIMARY (TAKEOVER_IN_PROGRESS -> PRIMARY)
    this.log('info', '[MOCK] Fase 3: Esperando transicion a PRIMARY');
    await this._simulateDelay('wait_primary');

    // Actualizar estado simulado: target ahora es PRIMARY
    this._srState.targetNode.role = 'PRIMARY';
    this._srState.targetNode.status = SrState.PRIMARY;
    this._srState.sourceNode.role = 'FORMER_PRIMARY';
    this._srState.sourceNode.status = SrState.UNKNOWN;
    this._srState.sourceNode.hanaRunning = false;
    this._srState.replicationStatus = SrState.PRIMARY;
    this._recordTransition(SrState.TAKEOVER_IN_PROGRESS, SrState.PRIMARY, 'takeover_completed');

    this.createEvidenceEntry('sr_takeover_completed', {
      newPrimary: targetInstanceId,
      formerPrimary: sourceInstanceId,
      status: SrState.PRIMARY,
    });

    // Fase 4: Verificar conectividad DB
    this.log('info', '[MOCK] Fase 4: Verificando conectividad de base de datos');
    await this._simulateDelay('verify_db_connectivity');

    this.createEvidenceEntry('db_connectivity_post_takeover', {
      connectivity: { connected: true, responseTimeMs: 45 },
      selectDummyResult: 'OK',
    });

    const totalDurationMs = Date.now() - startTime;

    this.log('info', `[MOCK] HANA SR takeover completado en ${totalDurationMs}ms`, {
      sid: this.sid,
      newPrimary: targetInstanceId,
    });

    return {
      success: true,
      mock: true,
      action: 'takeover',
      sid: this.sid,
      instanceNumber: this.instanceNumber,
      newPrimaryInstance: targetInstanceId,
      formerPrimaryInstance: sourceInstanceId,
      srStatus: SrState.PRIMARY,
      connectivity: { connected: true, responseTimeMs: 45 },
      stateTransitions: [
        { from: SrState.SOK, to: SrState.SYNCING },
        { from: SrState.SYNCING, to: SrState.TAKEOVER_IN_PROGRESS },
        { from: SrState.TAKEOVER_IN_PROGRESS, to: SrState.PRIMARY },
      ],
      durationMs: totalDurationMs,
    };
  }

  /**
   * Simular registro como secundario del antiguo primario.
   * Transicion: UNKNOWN -> REGISTERING -> SYNCING -> SOK
   */
  async _executeRegister(cfg) {
    const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId || this._srState.sourceNode.instanceId;
    const targetInstanceId = cfg.targetNode?.instanceId || cfg.targetInstanceId || this._srState.targetNode.instanceId;
    const targetHostname = cfg.targetNode?.hostname || cfg.targetHostname || 'sap-prd-01b';
    const replicationMode = cfg.replicationMode || this.replicationMode;
    const startTime = Date.now();

    // Fase 1: Detener HANA en antiguo primario
    this.log('info', '[MOCK] Fase 1: Deteniendo HANA en antiguo primario');
    this._srState.sourceNode.hanaRunning = false;
    await this._simulateDelay('stop_hana_source');

    this.createEvidenceEntry('hana_stopped_source', {
      instanceId: sourceInstanceId,
      command: 'sapcontrol -function StopSystem',
    });

    // Fase 2: Registrar como secundario (UNKNOWN -> REGISTERING)
    this.log('info', '[MOCK] Fase 2: Registrando como secundario con hdbnsutil -sr_register');
    this._srState.sourceNode.status = SrState.REGISTERING;
    this._recordTransition(SrState.UNKNOWN, SrState.REGISTERING, 'register_started');
    await this._simulateDelay('sr_register');

    this.createEvidenceEntry('sr_register_executed', {
      command: `hdbnsutil -sr_register --remoteHost=${targetHostname}`,
      replicationMode,
      sourceInstanceId,
    });

    // Fase 3: Iniciar HANA en nuevo secundario (REGISTERING -> SYNCING)
    this.log('info', '[MOCK] Fase 3: Iniciando HANA en nuevo secundario');
    this._srState.sourceNode.hanaRunning = true;
    this._srState.sourceNode.status = SrState.SYNCING;
    this._srState.sourceNode.role = 'SECONDARY';
    this._recordTransition(SrState.REGISTERING, SrState.SYNCING, 'hana_started_syncing');
    await this._simulateDelay('start_hana_secondary');

    this.createEvidenceEntry('hana_started_secondary', {
      instanceId: sourceInstanceId,
      status: SrState.SYNCING,
    });

    // Fase 4: Esperar sincronizacion (SYNCING -> SOK)
    this.log('info', '[MOCK] Fase 4: Esperando sincronizacion completa');
    await this._simulateDelay('wait_sync');

    this._srState.sourceNode.status = SrState.SOK;
    this._srState.replicationStatus = SrState.SOK;
    this._srState.lastSyncTimestamp = new Date().toISOString();
    this._srState.logShippingDelta = '0.3s';
    this._recordTransition(SrState.SYNCING, SrState.SOK, 'sync_completed');

    this.createEvidenceEntry('sr_sync_completed', {
      status: SrState.SOK,
      replicationMode,
      newSecondaryInstance: sourceInstanceId,
    });

    const totalDurationMs = Date.now() - startTime;

    this.log('info', `[MOCK] Registro como secundario completado en ${totalDurationMs}ms`, {
      sid: this.sid,
      newSecondary: sourceInstanceId,
    });

    return {
      success: true,
      mock: true,
      action: 'registerAsSecondary',
      sid: this.sid,
      instanceNumber: this.instanceNumber,
      newSecondaryInstance: sourceInstanceId,
      newPrimaryInstance: targetInstanceId,
      replicationMode,
      replicationStatus: SrState.SOK,
      stateTransitions: [
        { from: SrState.UNKNOWN, to: SrState.REGISTERING },
        { from: SrState.REGISTERING, to: SrState.SYNCING },
        { from: SrState.SYNCING, to: SrState.SOK },
      ],
      durationMs: totalDurationMs,
    };
  }

  /**
   * Rollback: intentar revertir operacion de DB.
   * En realidad, un rollback de takeover es complejo; aqui lo simulamos.
   */
  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const action = step.action;

    this.log('warn', `[MOCK] Iniciando rollback de HANA SR (action: ${action})`);

    // Verificar inyeccion de fallos
    if (this._shouldFail('rollbackStep')) {
      const errorMsg = `[MOCK] Fallo inyectado en rollbackStep (failRate: ${this.failRate})`;
      this.log('error', errorMsg);
      this.createEvidenceEntry('rollback_step_failed', {
        action,
        error: errorMsg,
        injectedFailure: true,
      });
      throw new Error(errorMsg);
    }

    await this._simulateDelay('rollback');

    // Restaurar estado previo (simplificado para mock)
    this._srState.sourceNode.role = 'PRIMARY';
    this._srState.sourceNode.status = SrState.PRIMARY;
    this._srState.sourceNode.hanaRunning = true;
    this._srState.targetNode.role = 'SECONDARY';
    this._srState.targetNode.status = SrState.SOK;
    this._srState.targetNode.hanaRunning = true;
    this._srState.replicationStatus = SrState.SOK;

    this._recordTransition(SrState.PRIMARY, SrState.SOK, 'rollback_completed');

    this.createEvidenceEntry('sr_rollback_completed', {
      action,
      restoredState: 'SOURCE=PRIMARY, TARGET=SECONDARY, SR=SOK',
      warning: 'HANA SR rollback simulado. En produccion verificar manualmente.',
    });

    this.log('info', '[MOCK] Rollback de HANA SR completado');

    return {
      success: true,
      mock: true,
      action: `rollback_${action}`,
      sid: this.sid,
      restoredState: {
        sourceRole: 'PRIMARY',
        targetRole: 'SECONDARY',
        replicationStatus: SrState.SOK,
      },
      warning: 'HANA SR rollback es una operacion delicada. Verificar estado de replicacion manualmente.',
    };
  }

  /**
   * Health check: verificar estado de replicacion y conectividad.
   */
  async healthCheck(context) {
    const cfg = { ...this.config, ...context };

    // Verificar inyeccion de fallos
    if (this._shouldFail('healthCheck')) {
      this.createEvidenceEntry('health_check_failed', {
        sid: this.sid,
        injectedFailure: true,
      });
      return {
        healthy: false,
        mock: true,
        sid: this.sid,
        replicationStatus: SrState.SFAIL,
        error: '[MOCK] Fallo inyectado en healthCheck',
        timestamp: new Date().toISOString(),
      };
    }

    const delay = await this._simulateDelay('healthCheck');

    const healthy = this._srState.replicationStatus === SrState.SOK ||
                    this._srState.replicationStatus === SrState.PRIMARY;

    const result = {
      healthy,
      mock: true,
      sid: this.sid,
      instanceNumber: this.instanceNumber,
      replicationStatus: this._srState.replicationStatus,
      replicationMode: this._srState.replicationMode,
      sourceNode: { ...this._srState.sourceNode },
      targetNode: { ...this._srState.targetNode },
      logShippingDelta: this._srState.logShippingDelta,
      lastSyncTimestamp: this._srState.lastSyncTimestamp,
      latencyMs: delay,
      timestamp: new Date().toISOString(),
    };

    this.createEvidenceEntry('health_check_completed', {
      healthy,
      replicationStatus: this._srState.replicationStatus,
      sid: this.sid,
    });

    return result;
  }

  // --- Metodos auxiliares publicos ---

  /** Obtener estado actual simulado de SR */
  getSrState() {
    return JSON.parse(JSON.stringify(this._srState));
  }

  /** Obtener historial de transiciones de estado */
  getStateTransitions() {
    return [...this._stateTransitions];
  }

  /** Forzar un estado de SR (util para testing) */
  forceSrState(status) {
    this._srState.replicationStatus = status;
    this._recordTransition(this._srState.replicationStatus, status, 'forced_state_change');
  }
}

module.exports = MockDbDriver;
