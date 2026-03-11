'use strict';

// =================================================================
//  SAP Spektra v1.5 — Mock SAP Services Driver
//  Simula operaciones de stop/start de servicios SAP (ABAP, J2EE, ICM)
//  con listas de procesos realistas (disp+work, igswd_mt, gwrd, icman).
//  Soporta inyeccion de fallos y delays configurables.
// =================================================================

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType } = require('../../ha-types');

// Estados de procesos SAP simulados
const ProcessStatus = Object.freeze({
  GREEN: 'GREEN',       // Proceso corriendo
  YELLOW: 'YELLOW',     // Proceso iniciando/deteniendo
  GRAY: 'GRAY',         // Proceso detenido
  RED: 'RED',           // Proceso fallido/crash
});

// Plantilla de procesos SAP realista (ABAP stack)
const SAP_PROCESS_TEMPLATE = [
  { name: 'disp+work', description: 'Dispatcher', pid: null, status: ProcessStatus.GREEN, starttime: null },
  { name: 'igswd_mt', description: 'IGS Watchdog', pid: null, status: ProcessStatus.GREEN, starttime: null },
  { name: 'gwrd', description: 'Gateway', pid: null, status: ProcessStatus.GREEN, starttime: null },
  { name: 'icman', description: 'ICM (Internet Communication Manager)', pid: null, status: ProcessStatus.GREEN, starttime: null },
  { name: 'sapwebdisp', description: 'Web Dispatcher', pid: null, status: ProcessStatus.GREEN, starttime: null },
  { name: 'enserver', description: 'Enqueue Server', pid: null, status: ProcessStatus.GREEN, starttime: null },
  { name: 'enrepserver', description: 'Enqueue Replicator', pid: null, status: ProcessStatus.GREEN, starttime: null },
  { name: 'msg_server', description: 'Message Server', pid: null, status: ProcessStatus.GREEN, starttime: null },
];

class MockSapDriver extends BaseHaDriver {
  /**
   * @param {Object} config - Configuracion del driver mock SAP
   * @param {string} config.sid - SAP SID (e.g., 'PRD')
   * @param {string} config.instanceNumber - SAP instance number (e.g., '00')
   * @param {string} config.sourceInstanceId - EC2 ID del nodo source
   * @param {string} config.targetInstanceId - EC2 ID del nodo target
   * @param {string} config.sidadmUser - Usuario sidadm (default: <sid>adm)
   * @param {number} config.minDelayMs - Delay minimo en ms (default: 5000)
   * @param {number} config.maxDelayMs - Delay maximo en ms (default: 10000)
   * @param {string} config.failOnStep - Metodo donde inyectar fallo
   * @param {number} config.failRate - Probabilidad de fallo 0-1 (default: 0)
   * @param {number} config.stopTimeoutSeconds - Timeout para stop (default: 300)
   * @param {number} config.startTimeoutSeconds - Timeout para start (default: 300)
   */
  constructor(config = {}) {
    super('mock-sap', DriverType.SAP, '1.0.0-mock');

    this.config = config;
    this.sid = config.sid || 'PRD';
    this.instanceNumber = config.instanceNumber || '00';
    this.sidadmUser = config.sidadmUser || `${this.sid.toLowerCase()}adm`;

    // Delays simulados (5-10 segundos por defecto — SAP tarda mas en iniciar)
    this.minDelayMs = config.minDelayMs != null ? config.minDelayMs : 5000;
    this.maxDelayMs = config.maxDelayMs != null ? config.maxDelayMs : 10000;

    // Inyeccion de fallos
    this.failOnStep = config.failOnStep || null;
    this.failRate = config.failRate || 0;

    // Estado simulado de procesos SAP por nodo
    this._nodeState = {
      source: {
        instanceId: config.sourceInstanceId || 'i-0abc123primary',
        sapRunning: true,
        processes: this._generateProcessList('running'),
      },
      target: {
        instanceId: config.targetInstanceId || 'i-0abc123secondary',
        sapRunning: false,
        processes: this._generateProcessList('stopped'),
      },
    };

    // Historial de operaciones
    this._operationHistory = [];
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

  /** Determinar si la operacion debe fallar */
  _shouldFail(stepName) {
    if (this.failOnStep !== stepName) return false;
    if (this.failRate <= 0) return false;
    return Math.random() < this.failRate;
  }

  /** Generar lista de procesos SAP realista segun el estado */
  _generateProcessList(state) {
    const now = new Date().toISOString();
    const basePid = 10000 + Math.floor(Math.random() * 50000);

    return SAP_PROCESS_TEMPLATE.map((proc, idx) => {
      let status;
      switch (state) {
        case 'running':
          status = ProcessStatus.GREEN;
          break;
        case 'stopping':
          // Algunos procesos se detienen antes que otros
          status = idx < 3 ? ProcessStatus.YELLOW : ProcessStatus.GREEN;
          break;
        case 'stopped':
          status = ProcessStatus.GRAY;
          break;
        case 'starting':
          // Algunos procesos inician antes que otros
          status = idx < 4 ? ProcessStatus.GREEN : ProcessStatus.YELLOW;
          break;
        case 'crashed':
          status = idx === 0 ? ProcessStatus.RED : ProcessStatus.GRAY;
          break;
        default:
          status = ProcessStatus.GRAY;
      }

      return {
        name: proc.name,
        description: proc.description,
        pid: status === ProcessStatus.GRAY ? 0 : basePid + idx,
        status,
        starttime: status !== ProcessStatus.GRAY ? now : null,
        elapsedtime: status !== ProcessStatus.GRAY ? `${Math.floor(Math.random() * 86400)}` : '0',
      };
    });
  }

  /** Formatear lista de procesos como texto (similar a sapcontrol output) */
  _formatProcessListText(processes) {
    let output = `GetProcessList\n`;
    output += `OK\n`;
    output += `name, description, dispstatus, textstatus, starttime, elapsedtime, pid\n`;
    for (const proc of processes) {
      const statusText = proc.status === ProcessStatus.GREEN ? 'Running'
        : proc.status === ProcessStatus.YELLOW ? 'Starting/Stopping'
        : proc.status === ProcessStatus.RED ? 'Crashed'
        : 'Stopped';
      output += `${proc.name}, ${proc.description}, ${proc.status}, ${statusText}, ${proc.starttime || ''}, ${proc.elapsedtime || ''}, ${proc.pid}\n`;
    }
    return output;
  }

  /** Registrar operacion en historial */
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
   * Validar configuracion del mock SAP driver.
   */
  async validateConfig(config) {
    const c = config || this.config;
    const errors = [];

    if (!c.sid) errors.push('sid es requerido (SAP SID)');
    if (!c.instanceNumber) errors.push('instanceNumber es requerido (e.g., 00)');
    if (!c.sourceInstanceId && !c.targetInstanceId) {
      errors.push('Al menos sourceInstanceId o targetInstanceId es requerido');
    }

    this.createEvidenceEntry('validate_config', {
      valid: errors.length === 0,
      errors,
      sid: c.sid,
      instanceNumber: c.instanceNumber,
    });

    return {
      valid: errors.length === 0,
      errors,
      config: c,
    };
  }

  /**
   * Verificar prerequisitos para operaciones SAP.
   * Simula checks de SAP status, sapcontrol accesible y profiles.
   */
  async checkPrerequisites(context) {
    const cfg = { ...this.config, ...context };
    const checks = [];

    await this._simulateDelay('checkPrerequisites');

    // Check 1: SAP corriendo en source
    const sourceRunning = this._nodeState.source.sapRunning;
    checks.push({
      name: 'sap_status_source',
      displayName: 'SAP Status (source)',
      description: 'Verifica que SAP esta corriendo en el nodo source',
      status: sourceRunning ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
      required: true,
      details: sourceRunning
        ? `[MOCK] SAP ${this.sid} corriendo en source (${this._nodeState.source.instanceId}) — ${this._nodeState.source.processes.filter(p => p.status === ProcessStatus.GREEN).length} procesos GREEN`
        : `[MOCK] SAP ${this.sid} NO corriendo en source`,
      lastChecked: new Date().toISOString(),
      remediation: sourceRunning ? '' : 'Iniciar SAP en el nodo source antes de failover',
    });

    // Check 2: sapcontrol accesible
    checks.push({
      name: 'sapcontrol_access',
      displayName: 'sapcontrol Accesible',
      description: 'Verifica que sapcontrol esta disponible en ambos nodos',
      status: PrerequisiteStatus.PASS,
      required: true,
      details: `[MOCK] sapcontrol accesible como ${this.sidadmUser} en ambos nodos`,
      lastChecked: new Date().toISOString(),
      remediation: '',
    });

    // Check 3: Profiles existen en target
    checks.push({
      name: 'profiles_exist',
      displayName: 'Profiles SAP en Target',
      description: 'Verifica que los profiles SAP existen en el nodo target',
      status: PrerequisiteStatus.PASS,
      required: true,
      details: `[MOCK] Profiles encontrados en /sapmnt/${this.sid}/profile/ en target (${this._nodeState.target.instanceId})`,
      lastChecked: new Date().toISOString(),
      remediation: '',
    });

    // Check 4: Espacio en disco para logs
    checks.push({
      name: 'disk_space',
      displayName: 'Espacio en Disco',
      description: 'Verifica espacio disponible en /usr/sap para logs de SAP',
      status: PrerequisiteStatus.PASS,
      required: false,
      details: '[MOCK] Espacio disponible: /usr/sap 68% utilizado (32% libre)',
      lastChecked: new Date().toISOString(),
      remediation: '',
    });

    this.createEvidenceEntry('check_prerequisites', {
      checksCount: checks.length,
      allPassed: checks.every(c => c.status === PrerequisiteStatus.PASS),
      sid: this.sid,
    });

    return checks;
  }

  /**
   * Ejecutar operacion SAP.
   * Soporta acciones: 'stopOnSource', 'startOnTarget', 'stopOnTarget', 'startOnSource'.
   */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const action = step.action;

    this.log('info', `[MOCK] Ejecutando SAP Services action: ${action}`, {
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
      case 'stopOnSource':
        return this._stopSap(cfg, 'source');
      case 'startOnTarget':
        return this._startSap(cfg, 'target');
      case 'stopOnTarget':
        return this._stopSap(cfg, 'target');
      case 'startOnSource':
        return this._startSap(cfg, 'source');
      default:
        throw new Error(`[MOCK] SAP Services: accion desconocida: ${action}`);
    }
  }

  /**
   * Simular detencion de SAP en un nodo con transiciones de estado intermedias.
   * GREEN -> YELLOW (stopping) -> GRAY (stopped)
   */
  async _stopSap(cfg, node) {
    const nodeState = this._nodeState[node];
    const instanceId = nodeState.instanceId;
    const startTime = Date.now();

    this.log('info', `[MOCK] Deteniendo SAP ${this.sid} en nodo ${node} (${instanceId})`);

    // Capturar estado previo
    const preProcesses = [...nodeState.processes];
    this.createEvidenceEntry('sap_pre_stop_status', {
      node,
      instanceId,
      processes: this._formatProcessListText(preProcesses),
      runningCount: preProcesses.filter(p => p.status === ProcessStatus.GREEN).length,
    });

    // Fase 1: Enviar comando de stop
    this.log('info', `[MOCK] Fase 1: Enviando StopSystem a sapcontrol -nr ${this.instanceNumber}`);
    await this._simulateDelay('send_stop_command');

    this.createEvidenceEntry('sap_stop_command_sent', {
      node,
      command: `sapcontrol -nr ${this.instanceNumber} -function StopSystem ALL`,
      instanceId,
    });

    // Fase 2: Procesos transicionando a YELLOW (stopping)
    this.log('info', '[MOCK] Fase 2: Procesos deteniendo (estado YELLOW)');
    nodeState.processes = this._generateProcessList('stopping');
    await this._simulateDelay('processes_stopping');

    this.createEvidenceEntry('sap_processes_stopping', {
      node,
      processes: this._formatProcessListText(nodeState.processes),
    });

    // Fase 3: Todos los procesos detenidos (GRAY)
    this.log('info', '[MOCK] Fase 3: Todos los procesos detenidos (estado GRAY)');
    nodeState.processes = this._generateProcessList('stopped');
    nodeState.sapRunning = false;
    await this._simulateDelay('processes_stopped');

    this.createEvidenceEntry('sap_stop_completed', {
      node,
      instanceId,
      processes: this._formatProcessListText(nodeState.processes),
      allStopped: true,
    });

    const totalDurationMs = Date.now() - startTime;

    this.log('info', `[MOCK] SAP ${this.sid} detenido en nodo ${node} en ${totalDurationMs}ms`);

    this._recordOperation('stopSap', {
      node,
      instanceId,
      durationMs: totalDurationMs,
    });

    return {
      success: true,
      mock: true,
      action: 'stop',
      node,
      sid: this.sid,
      instanceNumber: this.instanceNumber,
      instanceId,
      graceful: true,
      processList: nodeState.processes.map(p => ({
        name: p.name,
        description: p.description,
        status: p.status,
      })),
      durationMs: totalDurationMs,
    };
  }

  /**
   * Simular inicio de SAP en un nodo con transiciones de estado intermedias.
   * GRAY (stopped) -> YELLOW (starting) -> GREEN (running)
   */
  async _startSap(cfg, node) {
    const nodeState = this._nodeState[node];
    const instanceId = nodeState.instanceId;
    const startTime = Date.now();

    this.log('info', `[MOCK] Iniciando SAP ${this.sid} en nodo ${node} (${instanceId})`);

    // Fase 1: Enviar comando de start
    this.log('info', `[MOCK] Fase 1: Enviando StartSystem a sapcontrol -nr ${this.instanceNumber}`);
    await this._simulateDelay('send_start_command');

    this.createEvidenceEntry('sap_start_command_sent', {
      node,
      command: `sapcontrol -nr ${this.instanceNumber} -function StartSystem ALL`,
      instanceId,
    });

    // Fase 2: Procesos iniciando (YELLOW)
    this.log('info', '[MOCK] Fase 2: Procesos iniciando (estado YELLOW)');
    nodeState.processes = this._generateProcessList('starting');
    await this._simulateDelay('processes_starting');

    this.createEvidenceEntry('sap_processes_starting', {
      node,
      processes: this._formatProcessListText(nodeState.processes),
    });

    // Fase 3: Todos los procesos corriendo (GREEN)
    this.log('info', '[MOCK] Fase 3: Todos los procesos corriendo (estado GREEN)');
    nodeState.processes = this._generateProcessList('running');
    nodeState.sapRunning = true;
    await this._simulateDelay('processes_running');

    this.createEvidenceEntry('sap_start_completed', {
      node,
      instanceId,
      processes: this._formatProcessListText(nodeState.processes),
      allRunning: true,
      runningCount: nodeState.processes.filter(p => p.status === ProcessStatus.GREEN).length,
    });

    const totalDurationMs = Date.now() - startTime;

    this.log('info', `[MOCK] SAP ${this.sid} iniciado en nodo ${node} en ${totalDurationMs}ms`);

    this._recordOperation('startSap', {
      node,
      instanceId,
      durationMs: totalDurationMs,
    });

    return {
      success: true,
      mock: true,
      action: 'start',
      node,
      sid: this.sid,
      instanceNumber: this.instanceNumber,
      instanceId,
      processList: nodeState.processes.map(p => ({
        name: p.name,
        description: p.description,
        status: p.status,
        pid: p.pid,
      })),
      durationMs: totalDurationMs,
    };
  }

  /**
   * Rollback: revertir operacion SAP (stop -> start, start -> stop).
   */
  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const action = step.action;

    this.log('warn', `[MOCK] Iniciando rollback de SAP Services (action: ${action})`);

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

    // Revertir la accion: stop -> start en el mismo nodo, start -> stop
    switch (action) {
      case 'stopOnSource':
        this.log('info', '[MOCK] Rollback: reiniciando SAP en source');
        return this._startSap(cfg, 'source');

      case 'startOnTarget':
        this.log('info', '[MOCK] Rollback: deteniendo SAP en target');
        return this._stopSap(cfg, 'target');

      case 'stopOnTarget':
        this.log('info', '[MOCK] Rollback: reiniciando SAP en target');
        return this._startSap(cfg, 'target');

      case 'startOnSource':
        this.log('info', '[MOCK] Rollback: deteniendo SAP en source');
        return this._stopSap(cfg, 'source');

      default:
        await this._simulateDelay('rollback');
        this.createEvidenceEntry('sap_rollback_generic', { action });
        return { success: true, mock: true, warning: 'Rollback generico' };
    }
  }

  /**
   * Health check: verificar estado de servicios SAP.
   * Retorna lista de procesos realista y estado general.
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
        error: '[MOCK] Fallo inyectado en healthCheck',
        timestamp: new Date().toISOString(),
      };
    }

    const delay = await this._simulateDelay('healthCheck');

    // Determinar nodo activo (el que tiene SAP corriendo)
    const activeNode = this._nodeState.source.sapRunning ? 'source' : 'target';
    const activeState = this._nodeState[activeNode];
    const allGreen = activeState.processes.every(p => p.status === ProcessStatus.GREEN);

    const result = {
      healthy: activeState.sapRunning && allGreen,
      mock: true,
      sid: this.sid,
      instanceNumber: this.instanceNumber,
      activeNode,
      activeInstanceId: activeState.instanceId,
      processes: activeState.processes.map(p => ({
        name: p.name,
        description: p.description,
        status: p.status,
        pid: p.pid,
      })),
      summary: {
        total: activeState.processes.length,
        green: activeState.processes.filter(p => p.status === ProcessStatus.GREEN).length,
        yellow: activeState.processes.filter(p => p.status === ProcessStatus.YELLOW).length,
        gray: activeState.processes.filter(p => p.status === ProcessStatus.GRAY).length,
        red: activeState.processes.filter(p => p.status === ProcessStatus.RED).length,
      },
      latencyMs: delay,
      timestamp: new Date().toISOString(),
    };

    this.createEvidenceEntry('health_check_completed', {
      healthy: result.healthy,
      sid: this.sid,
      activeNode,
      summary: result.summary,
    });

    return result;
  }

  // --- Metodos auxiliares publicos ---

  /** Obtener estado de un nodo especifico */
  getNodeState(node) {
    return this._nodeState[node]
      ? JSON.parse(JSON.stringify(this._nodeState[node]))
      : null;
  }

  /** Obtener lista de procesos formateada como texto (output sapcontrol) */
  getProcessListText(node) {
    const nodeState = this._nodeState[node];
    if (!nodeState) return 'Nodo no encontrado';
    return this._formatProcessListText(nodeState.processes);
  }

  /** Obtener historial de operaciones */
  getOperationHistory() {
    return [...this._operationHistory];
  }

  /** Forzar estado de SAP en un nodo (util para testing) */
  forceNodeState(node, running) {
    if (this._nodeState[node]) {
      this._nodeState[node].sapRunning = running;
      this._nodeState[node].processes = this._generateProcessList(running ? 'running' : 'stopped');
    }
  }
}

module.exports = MockSapDriver;
