'use strict';

// =================================================================
//  Avvale SAP AlwaysOps v1.5 — Mock Network Driver
//  Simula operaciones de switching de red (EIP/Route53/VIP)
//  para pruebas locales sin AWS. Soporta inyeccion de fallos
//  y delays configurables para probar escenarios realistas.
// =================================================================

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType } = require('../../ha-types');

class MockNetworkDriver extends BaseHaDriver {
  /**
   * @param {Object} config - Configuracion del driver mock
   * @param {string} config.strategy - Estrategia simulada: EIP|ROUTE53|PACEMAKER_VIP
   * @param {number} config.minDelayMs - Delay minimo en ms (default: 2000)
   * @param {number} config.maxDelayMs - Delay maximo en ms (default: 5000)
   * @param {string} config.failOnStep - Metodo donde inyectar fallo ('executeStep'|'rollbackStep'|'healthCheck')
   * @param {number} config.failRate - Probabilidad de fallo 0-1 (default: 0)
   * @param {string} config.allocationId - ID simulado del recurso de red
   * @param {string} config.sourceInstanceId - EC2 ID del nodo primario
   * @param {string} config.targetInstanceId - EC2 ID del nodo secundario
   * @param {string} config.vipAddress - Direccion VIP simulada
   * @param {string} config.hostedZoneId - Hosted zone ID simulado (Route53)
   * @param {string} config.recordName - DNS record simulado (Route53)
   */
  constructor(config = {}) {
    super('mock-network', DriverType.NETWORK, '1.0.0-mock');

    // Configuracion base del driver
    this.config = config;
    this.strategy = config.strategy || 'EIP';

    // Configuracion de delays simulados (en milisegundos)
    this.minDelayMs = config.minDelayMs != null ? config.minDelayMs : 2000;
    this.maxDelayMs = config.maxDelayMs != null ? config.maxDelayMs : 5000;

    // Configuracion de inyeccion de fallos
    this.failOnStep = config.failOnStep || null;
    this.failRate = config.failRate || 0;

    // Estado interno simulado
    this._currentAssociation = {
      resourceId: config.allocationId || 'eipalloc-mock-001',
      instanceId: config.sourceInstanceId || 'i-0abc123primary',
      publicIp: config.vipAddress || '203.0.113.42',
      associationId: `eipassoc-mock-${Date.now()}`,
    };

    // Historial de operaciones internas para debug
    this._operationHistory = [];
  }

  // --- Utilidades internas ---

  /** Generar un delay aleatorio dentro del rango configurado */
  _randomDelay() {
    const range = this.maxDelayMs - this.minDelayMs;
    return this.minDelayMs + Math.floor(Math.random() * range);
  }

  /** Simular latencia de red con un sleep */
  async _simulateDelay(operationName) {
    const delay = this._randomDelay();
    this.log('info', `[MOCK] Simulando latencia de ${delay}ms para ${operationName}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }

  /** Determinar si la operacion actual debe fallar (inyeccion de fallos) */
  _shouldFail(stepName) {
    if (this.failOnStep !== stepName) return false;
    if (this.failRate <= 0) return false;
    // Si failRate es 1, siempre falla; si es 0.1, falla 10% de las veces
    return Math.random() < this.failRate;
  }

  /** Registrar operacion en historial interno */
  _recordOperation(action, details) {
    const record = {
      timestamp: new Date().toISOString(),
      action,
      ...details,
    };
    this._operationHistory.push(record);
    return record;
  }

  // --- Metodos abstractos implementados ---

  /**
   * Validar configuracion del mock network driver.
   * Verifica que los campos minimos esten presentes.
   */
  async validateConfig(config) {
    const c = config || this.config;
    const errors = [];

    // Validaciones minimas para el mock
    if (!c.sourceInstanceId && !c.targetInstanceId) {
      errors.push('Se requiere al menos sourceInstanceId o targetInstanceId');
    }

    // Validar que la estrategia es reconocida
    const validStrategies = ['EIP', 'ROUTE53', 'PACEMAKER_VIP'];
    if (c.strategy && !validStrategies.includes(c.strategy)) {
      errors.push(`Estrategia no reconocida: ${c.strategy}. Validas: ${validStrategies.join(', ')}`);
    }

    // Validar rango de delays
    if (c.minDelayMs != null && c.maxDelayMs != null && c.minDelayMs > c.maxDelayMs) {
      errors.push('minDelayMs no puede ser mayor que maxDelayMs');
    }

    // Crear evidencia de la validacion
    this.createEvidenceEntry('validate_config', {
      valid: errors.length === 0,
      errors,
      strategy: c.strategy || 'EIP',
    });

    return {
      valid: errors.length === 0,
      errors,
      config: c,
    };
  }

  /**
   * Verificar prerequisitos simulados para switching de red.
   * Retorna checks realistas segun la estrategia configurada.
   */
  async checkPrerequisites(context) {
    const cfg = { ...this.config, ...context };
    const checks = [];
    const delay = await this._simulateDelay('checkPrerequisites');

    // Check 1: Recurso de red existe (EIP/VIP/DNS)
    const resourceCheck = this._createResourceExistsCheck(cfg);
    checks.push(resourceCheck);

    // Check 2: Instancia target accesible
    checks.push({
      name: 'target_instance_reachable',
      displayName: 'Instancia Target Accesible',
      description: 'Verifica que la instancia EC2 destino responde',
      status: PrerequisiteStatus.PASS,
      required: true,
      details: `[MOCK] Instancia ${cfg.targetInstanceId || 'i-0abc123secondary'} accesible (ping ${delay}ms)`,
      lastChecked: new Date().toISOString(),
      remediation: '',
    });

    // Check 3: Permisos IAM simulados
    checks.push({
      name: 'iam_permissions',
      displayName: 'Permisos IAM para Network Switch',
      description: 'Verifica permisos IAM necesarios para la estrategia de red',
      status: PrerequisiteStatus.PASS,
      required: true,
      details: `[MOCK] Permisos verificados para estrategia ${this.strategy}`,
      lastChecked: new Date().toISOString(),
      remediation: '',
    });

    // Check 4: Misma VPC / Zona (warning si cross-AZ)
    checks.push({
      name: 'network_topology',
      displayName: 'Topologia de Red Compatible',
      description: 'Verifica que source y target comparten VPC y subnet compatible',
      status: PrerequisiteStatus.PASS,
      required: false,
      details: '[MOCK] Nodos en misma VPC (vpc-mock-001), diferentes AZ (us-east-1a/1b)',
      lastChecked: new Date().toISOString(),
      remediation: '',
    });

    // Crear evidencia de la verificacion de prerequisitos
    this.createEvidenceEntry('check_prerequisites', {
      strategy: this.strategy,
      checksCount: checks.length,
      allPassed: checks.every(c => c.status === PrerequisiteStatus.PASS),
      latencyMs: delay,
    });

    this._recordOperation('checkPrerequisites', {
      strategy: this.strategy,
      result: 'PASS',
      checksCount: checks.length,
    });

    return checks;
  }

  /**
   * Ejecutar switching de red simulado.
   * Desasocia recurso del source y lo asocia al target con delay realista.
   */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const targetInstanceId = cfg.targetNode?.instanceId || cfg.targetInstanceId || 'i-0abc123secondary';
    const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId || 'i-0abc123primary';
    const startTime = Date.now();

    this.log('info', `[MOCK] Iniciando switch de red (${this.strategy})`, {
      from: sourceInstanceId,
      to: targetInstanceId,
    });

    // Verificar inyeccion de fallos
    if (this._shouldFail('executeStep')) {
      const errorMsg = `[MOCK] Fallo inyectado en executeStep (failRate: ${this.failRate})`;
      this.log('error', errorMsg);
      this.createEvidenceEntry('execute_step_failed', {
        strategy: this.strategy,
        error: errorMsg,
        injectedFailure: true,
      });
      throw new Error(errorMsg);
    }

    // Fase 1: Desasociar del source
    this.log('info', '[MOCK] Fase 1: Desasociando recurso de red del nodo source');
    const phase1Delay = await this._simulateDelay('disassociate');

    const previousAssociation = { ...this._currentAssociation };
    this.createEvidenceEntry('network_disassociated', {
      strategy: this.strategy,
      resourceId: this._currentAssociation.resourceId,
      previousInstanceId: sourceInstanceId,
      associationId: previousAssociation.associationId,
      phaseLatencyMs: phase1Delay,
    });

    // Fase 2: Asociar al target
    this.log('info', '[MOCK] Fase 2: Asociando recurso de red al nodo target');
    const phase2Delay = await this._simulateDelay('associate');

    const newAssociationId = `eipassoc-mock-${Date.now()}`;
    this._currentAssociation = {
      resourceId: this._currentAssociation.resourceId,
      instanceId: targetInstanceId,
      publicIp: this._currentAssociation.publicIp,
      associationId: newAssociationId,
    };

    this.createEvidenceEntry('network_associated', {
      strategy: this.strategy,
      resourceId: this._currentAssociation.resourceId,
      targetInstanceId,
      newAssociationId,
      phaseLatencyMs: phase2Delay,
    });

    // Fase 3: Verificar propagacion
    this.log('info', '[MOCK] Fase 3: Verificando propagacion del cambio');
    const phase3Delay = await this._simulateDelay('verify_propagation');

    this.createEvidenceEntry('network_verified', {
      strategy: this.strategy,
      targetInstanceId,
      publicIp: this._currentAssociation.publicIp,
      propagationMs: phase3Delay,
    });

    const totalDurationMs = Date.now() - startTime;

    this.log('info', `[MOCK] Switch de red completado en ${totalDurationMs}ms`, {
      strategy: this.strategy,
      from: sourceInstanceId,
      to: targetInstanceId,
    });

    this._recordOperation('executeStep', {
      strategy: this.strategy,
      from: sourceInstanceId,
      to: targetInstanceId,
      durationMs: totalDurationMs,
    });

    // Respuesta realista segun la estrategia
    return this._buildExecuteResult(cfg, previousAssociation, newAssociationId, totalDurationMs);
  }

  /**
   * Rollback: revertir switching de red, reasociar al nodo original.
   */
  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId || 'i-0abc123primary';

    this.log('warn', `[MOCK] Iniciando rollback de red (${this.strategy})`, {
      restoringTo: sourceInstanceId,
    });

    // Verificar inyeccion de fallos en rollback
    if (this._shouldFail('rollbackStep')) {
      const errorMsg = `[MOCK] Fallo inyectado en rollbackStep (failRate: ${this.failRate})`;
      this.log('error', errorMsg);
      this.createEvidenceEntry('rollback_step_failed', {
        strategy: this.strategy,
        error: errorMsg,
        injectedFailure: true,
      });
      throw new Error(errorMsg);
    }

    // Simular rollback con delay
    const delay = await this._simulateDelay('rollback');

    const previousState = { ...this._currentAssociation };
    const rollbackAssociationId = `eipassoc-mock-rollback-${Date.now()}`;

    this._currentAssociation = {
      resourceId: this._currentAssociation.resourceId,
      instanceId: sourceInstanceId,
      publicIp: this._currentAssociation.publicIp,
      associationId: rollbackAssociationId,
    };

    this.createEvidenceEntry('network_rollback_completed', {
      strategy: this.strategy,
      restoredTo: sourceInstanceId,
      previousInstanceId: previousState.instanceId,
      newAssociationId: rollbackAssociationId,
      rollbackLatencyMs: delay,
    });

    this.log('info', `[MOCK] Rollback de red completado`, {
      restoredTo: sourceInstanceId,
    });

    this._recordOperation('rollbackStep', {
      strategy: this.strategy,
      restoredTo: sourceInstanceId,
      durationMs: delay,
    });

    return {
      success: true,
      mock: true,
      strategy: this.strategy,
      rolledBackTo: sourceInstanceId,
      newAssociationId: rollbackAssociationId,
      publicIp: this._currentAssociation.publicIp,
    };
  }

  /**
   * Health check: verificar que el recurso de red esta correctamente asociado.
   */
  async healthCheck(context) {
    const cfg = { ...this.config, ...context };

    // Verificar inyeccion de fallos en health check
    if (this._shouldFail('healthCheck')) {
      this.createEvidenceEntry('health_check_failed', {
        strategy: this.strategy,
        injectedFailure: true,
      });
      return {
        healthy: false,
        mock: true,
        strategy: this.strategy,
        error: '[MOCK] Fallo inyectado en healthCheck',
        timestamp: new Date().toISOString(),
      };
    }

    const delay = await this._simulateDelay('healthCheck');

    const result = {
      healthy: true,
      mock: true,
      strategy: this.strategy,
      currentAssociation: { ...this._currentAssociation },
      publicIp: this._currentAssociation.publicIp,
      associatedInstance: this._currentAssociation.instanceId,
      latencyMs: delay,
      timestamp: new Date().toISOString(),
    };

    this.createEvidenceEntry('health_check_completed', {
      healthy: true,
      strategy: this.strategy,
      associatedInstance: this._currentAssociation.instanceId,
    });

    return result;
  }

  // --- Metodos internos auxiliares ---

  /** Crear check de existencia del recurso de red segun estrategia */
  _createResourceExistsCheck(cfg) {
    const strategyDetails = {
      EIP: {
        name: 'eip_exists',
        displayName: 'Elastic IP Existe',
        description: 'Verifica que el Elastic IP existe y esta asignado',
        details: `[MOCK] EIP ${cfg.allocationId || 'eipalloc-mock-001'} encontrada (IP: ${cfg.vipAddress || '203.0.113.42'})`,
      },
      ROUTE53: {
        name: 'dns_record_exists',
        displayName: 'DNS Record Existe',
        description: 'Verifica que el record Route53 existe y es modificable',
        details: `[MOCK] Record ${cfg.recordName || 'sap-prd.internal'} encontrado en zona ${cfg.hostedZoneId || 'Z0123456789'}`,
      },
      PACEMAKER_VIP: {
        name: 'vip_configured',
        displayName: 'VIP Configurada en Pacemaker',
        description: 'Verifica que la VIP esta configurada en el cluster Pacemaker',
        details: `[MOCK] VIP ${cfg.vipAddress || '10.0.0.100'} configurada en recurso Pacemaker`,
      },
    };

    const detail = strategyDetails[this.strategy] || strategyDetails.EIP;

    return {
      ...detail,
      status: PrerequisiteStatus.PASS,
      required: true,
      lastChecked: new Date().toISOString(),
      remediation: '',
    };
  }

  /** Construir resultado del execute segun la estrategia */
  _buildExecuteResult(cfg, previousAssociation, newAssociationId, totalDurationMs) {
    const base = {
      success: true,
      mock: true,
      strategy: this.strategy,
      previousInstanceId: previousAssociation.instanceId,
      targetInstanceId: this._currentAssociation.instanceId,
      durationMs: totalDurationMs,
    };

    switch (this.strategy) {
      case 'EIP':
        return {
          ...base,
          allocationId: this._currentAssociation.resourceId,
          publicIp: this._currentAssociation.publicIp,
          newAssociationId,
          previousAssociationId: previousAssociation.associationId,
        };

      case 'ROUTE53':
        return {
          ...base,
          hostedZoneId: cfg.hostedZoneId || 'Z0123456789MOCK',
          recordName: cfg.recordName || 'sap-prd.internal',
          recordType: 'A',
          previousValue: previousAssociation.publicIp,
          newValue: cfg.targetIp || '10.0.2.10',
          ttl: cfg.ttl || 60,
          changeId: `C-MOCK-${Date.now()}`,
          propagationStatus: 'INSYNC',
        };

      case 'PACEMAKER_VIP':
        return {
          ...base,
          vipAddress: cfg.vipAddress || '10.0.0.100',
          resourceName: cfg.pacemakerResource || 'rsc_ip_PRD_HDB00',
          previousNode: cfg.sourceNode?.hostname || 'sap-prd-01a',
          newNode: cfg.targetNode?.hostname || 'sap-prd-01b',
          clusterStatus: 'ONLINE',
        };

      default:
        return base;
    }
  }

  /** Obtener historial de operaciones mock (util para debug) */
  getOperationHistory() {
    return [...this._operationHistory];
  }

  /** Obtener estado actual de la asociacion de red */
  getCurrentAssociation() {
    return { ...this._currentAssociation };
  }
}

module.exports = MockNetworkDriver;
