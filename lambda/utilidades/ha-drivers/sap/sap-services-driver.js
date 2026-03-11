'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.5 — SAP Services Driver
//  Maneja stop/start de servicios SAP (ABAP, J2EE, ICM)
//  via sapcontrol y SSM commands.
// ═══════════════════════════════════════════════════════════════

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType } = require('../../ha-types');

class SapServicesDriver extends BaseHaDriver {
  /**
   * @param {Object} config
   * @param {string} config.sid - SAP SID (e.g., 'PRD')
   * @param {string} config.instanceNumber - SAP instance number (e.g., '00')
   * @param {string} config.sourceInstanceId - EC2 ID del nodo source
   * @param {string} config.targetInstanceId - EC2 ID del nodo target
   * @param {string} config.sidadmUser - Usuario sidadm (default: <sid>adm)
   * @param {number} config.stopTimeoutSeconds - Timeout para stop (default: 300)
   * @param {number} config.startTimeoutSeconds - Timeout para start (default: 300)
   * @param {boolean} config.mock - Si es true, simular
   */
  constructor(config = {}) {
    super('sap-services', DriverType.SAP, '1.0.0');
    this.config = config;
    this.mock = config.mock || process.env.MOCK === 'true';
    this._ssmClient = null;
  }

  _getSsmClient() {
    if (!this._ssmClient && !this.mock) {
      const { SSMClient } = require('@aws-sdk/client-ssm');
      this._ssmClient = new SSMClient({});
    }
    return this._ssmClient;
  }

  async validateConfig(config) {
    const c = config || this.config;
    const errors = [];

    if (!c.sid) errors.push('sid es requerido (SAP SID)');
    if (!c.instanceNumber) errors.push('instanceNumber es requerido (e.g., 00)');
    if (!c.sourceInstanceId && !c.targetInstanceId) {
      errors.push('Al menos sourceInstanceId o targetInstanceId es requerido');
    }

    return { valid: errors.length === 0, errors, config: c };
  }

  async checkPrerequisites(context) {
    const checks = [];
    const cfg = { ...this.config, ...context };

    // Check 1: SAP corriendo en source
    checks.push(await this._checkSapStatus(cfg, 'source'));

    // Check 2: sapcontrol accesible
    checks.push(await this._checkSapcontrolAccess(cfg));

    // Check 3: Profiles existen en target
    checks.push(await this._checkProfilesExist(cfg));

    return checks;
  }

  /** Ejecutar operacion SAP */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const action = step.action;

    this.log('info', `Ejecutando SAP Services action: ${action}`, {
      sid: cfg.sid, instanceNumber: cfg.instanceNumber,
    });

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
        throw new Error(`SAP Services: accion desconocida: ${action}`);
    }
  }

  /** Detener SAP en un nodo */
  async _stopSap(cfg, node) {
    const instanceId = node === 'source'
      ? (cfg.sourceNode?.instanceId || cfg.sourceInstanceId)
      : (cfg.targetNode?.instanceId || cfg.targetInstanceId);
    const sid = cfg.sid;
    const nr = cfg.instanceNumber;
    const sidadm = cfg.sidadmUser || `${sid.toLowerCase()}adm`;
    const graceful = cfg.graceful !== false;

    this.log('info', `Deteniendo SAP ${sid} en nodo ${node}`, { instanceId, graceful });

    if (this.mock) {
      this.createEvidenceEntry('mock_sap_stop', { sid, node, instanceId });
      return { success: true, mock: true, action: 'stop', node, sid };
    }

    // Capturar estado previo
    const preStatus = await this._getProcessList(instanceId, sid, nr, sidadm);
    this.createEvidenceEntry('sap_pre_stop_status', { node, processes: preStatus });

    // Ejecutar stop
    const stopCmd = graceful
      ? `su - ${sidadm} -c 'sapcontrol -nr ${nr} -function StopSystem ALL'`
      : `su - ${sidadm} -c 'sapcontrol -nr ${nr} -function StopSystem ALL 300'`;

    const stopResult = await this._ssmCommand(instanceId, stopCmd);
    this.createEvidenceEntry('sap_stop_executed', { node, output: stopResult.substring(0, 500) });

    // Esperar a que SAP se detenga
    const timeout = (cfg.stopTimeoutSeconds || 300) * 1000;
    const stopped = await this._waitForSapStatus(instanceId, sid, nr, sidadm, 'stopped', timeout);

    if (!stopped) {
      this.log('warn', 'SAP no se detuvo completamente en el timeout, forzando kill');
      await this._ssmCommand(instanceId, `su - ${sidadm} -c 'sapcontrol -nr ${nr} -function StopSystem ALL 0'`).catch(() => {});
    }

    this.log('info', `SAP ${sid} detenido en nodo ${node}`);

    return {
      success: true,
      action: 'stop',
      node,
      sid,
      instanceId,
      graceful,
    };
  }

  /** Iniciar SAP en un nodo */
  async _startSap(cfg, node) {
    const instanceId = node === 'target'
      ? (cfg.targetNode?.instanceId || cfg.targetInstanceId)
      : (cfg.sourceNode?.instanceId || cfg.sourceInstanceId);
    const sid = cfg.sid;
    const nr = cfg.instanceNumber;
    const sidadm = cfg.sidadmUser || `${sid.toLowerCase()}adm`;

    this.log('info', `Iniciando SAP ${sid} en nodo ${node}`, { instanceId });

    if (this.mock) {
      this.createEvidenceEntry('mock_sap_start', { sid, node, instanceId });
      return { success: true, mock: true, action: 'start', node, sid };
    }

    // Ejecutar start
    const startCmd = `su - ${sidadm} -c 'sapcontrol -nr ${nr} -function StartSystem ALL'`;
    const startResult = await this._ssmCommand(instanceId, startCmd);
    this.createEvidenceEntry('sap_start_executed', { node, output: startResult.substring(0, 500) });

    // Esperar a que SAP inicie
    const timeout = (cfg.startTimeoutSeconds || 300) * 1000;
    const started = await this._waitForSapStatus(instanceId, sid, nr, sidadm, 'running', timeout);

    if (!started) {
      throw new Error(`SAP ${sid} no inicio en ${timeout / 1000}s en nodo ${node}`);
    }

    // Verificar procesos
    const postStatus = await this._getProcessList(instanceId, sid, nr, sidadm);
    this.createEvidenceEntry('sap_post_start_status', { node, processes: postStatus });

    this.log('info', `SAP ${sid} iniciado en nodo ${node}`);

    return {
      success: true,
      action: 'start',
      node,
      sid,
      instanceId,
      processes: postStatus,
    };
  }

  /** Rollback: revertir operacion SAP */
  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };

    this.log('warn', 'Rollback de SAP Services', { action: step.action });

    if (this.mock) {
      this.createEvidenceEntry('mock_sap_rollback', { action: step.action });
      return { success: true, mock: true };
    }

    // Rollback de stop = start en el mismo nodo
    if (step.action === 'stopOnSource') {
      return this._startSap(cfg, 'source');
    }
    // Rollback de start on target = stop en target
    if (step.action === 'startOnTarget') {
      return this._stopSap(cfg, 'target');
    }

    return { success: true, warning: 'Rollback parcial' };
  }

  /** Health check: verificar estado de SAP */
  async healthCheck(context) {
    const cfg = { ...this.config, ...context };

    if (this.mock) {
      return {
        healthy: true, mock: true, sid: cfg.sid,
        processes: ['disp+work', 'igswd_mt', 'gwrd', 'icman'],
        timestamp: new Date().toISOString(),
      };
    }

    const instanceId = cfg.targetInstanceId || cfg.sourceInstanceId;
    const sid = cfg.sid;
    const nr = cfg.instanceNumber;
    const sidadm = cfg.sidadmUser || `${sid.toLowerCase()}adm`;

    try {
      const processes = await this._getProcessList(instanceId, sid, nr, sidadm);
      const allGreen = processes.includes('GREEN') || processes.includes('Running');

      return {
        healthy: allGreen,
        sid,
        processes: processes.substring(0, 500),
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        healthy: false,
        sid,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ─── Metodos internos ───

  async _ssmCommand(instanceId, command) {
    if (this.mock) return `[MOCK] ${command}`;

    const ssm = this._getSsmClient();
    const { SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');

    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: { commands: [command] },
      TimeoutSeconds: 300,
    }));

    const commandId = sendResult.Command.CommandId;
    let attempts = 0;

    while (attempts < 75) {
      await new Promise(resolve => setTimeout(resolve, 4000));
      attempts++;
      try {
        const inv = await ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId, InstanceId: instanceId,
        }));
        if (inv.Status === 'Success') return inv.StandardOutputContent || '';
        if (['Failed', 'Cancelled', 'TimedOut'].includes(inv.Status)) {
          throw new Error(`SSM fallo: ${inv.StatusDetails} - ${inv.StandardErrorContent}`);
        }
      } catch (err) {
        if (err.name === 'InvocationDoesNotExist') continue;
        throw err;
      }
    }
    throw new Error('SSM command timeout');
  }

  /** Obtener lista de procesos SAP */
  async _getProcessList(instanceId, sid, nr, sidadm) {
    const cmd = `su - ${sidadm} -c 'sapcontrol -nr ${nr} -function GetProcessList'`;
    try {
      return await this._ssmCommand(instanceId, cmd);
    } catch {
      return 'UNKNOWN';
    }
  }

  /** Esperar a que SAP alcance un estado */
  async _waitForSapStatus(instanceId, sid, nr, sidadm, expectedState, timeoutMs) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 10000));

      const processes = await this._getProcessList(instanceId, sid, nr, sidadm);

      if (expectedState === 'running' && (processes.includes('GREEN') || processes.includes('Running'))) {
        return true;
      }
      if (expectedState === 'stopped' && (processes.includes('UNKNOWN') || processes.includes('Stopped') || processes === 'UNKNOWN')) {
        return true;
      }
    }

    return false;
  }

  // ─── Prerequisite checks ───

  async _checkSapStatus(cfg, node) {
    const name = `sap_status_${node}`;
    const instanceId = node === 'source' ? cfg.sourceInstanceId : cfg.targetInstanceId;

    if (this.mock) {
      return {
        name, displayName: `SAP Status (${node})`,
        description: `Verifica que SAP esta corriendo en nodo ${node}`,
        status: PrerequisiteStatus.PASS, required: true,
        details: `[MOCK] SAP ${cfg.sid} corriendo en ${node}`,
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    if (!instanceId) {
      return {
        name, displayName: `SAP Status (${node})`,
        description: `Verifica que SAP esta corriendo en nodo ${node}`,
        status: PrerequisiteStatus.SKIP, required: node === 'source',
        details: `instanceId no configurado para ${node}`,
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    try {
      const sid = cfg.sid;
      const nr = cfg.instanceNumber;
      const sidadm = cfg.sidadmUser || `${sid.toLowerCase()}adm`;
      const processes = await this._getProcessList(instanceId, sid, nr, sidadm);
      const running = processes.includes('GREEN') || processes.includes('Running');

      return {
        name, displayName: `SAP Status (${node})`,
        description: `Verifica que SAP esta corriendo en nodo ${node}`,
        status: running ? PrerequisiteStatus.PASS : PrerequisiteStatus.WARN,
        required: node === 'source',
        details: running ? `SAP ${sid} corriendo en ${node}` : `SAP ${sid} no reporta GREEN en ${node}`,
        lastChecked: new Date().toISOString(),
        remediation: running ? '' : 'Verificar estado de SAP con sapcontrol',
      };
    } catch (err) {
      return {
        name, displayName: `SAP Status (${node})`,
        description: `Verifica que SAP esta corriendo en nodo ${node}`,
        status: PrerequisiteStatus.FAIL, required: node === 'source',
        details: `Error verificando SAP: ${err.message}`,
        lastChecked: new Date().toISOString(),
        remediation: 'Verificar acceso SSM y sapcontrol',
      };
    }
  }

  async _checkSapcontrolAccess(cfg) {
    if (this.mock) {
      return {
        name: 'sapcontrol_access', displayName: 'sapcontrol Accesible',
        description: 'Verifica que sapcontrol esta disponible',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] sapcontrol accesible', lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    return {
      name: 'sapcontrol_access', displayName: 'sapcontrol Accesible',
      description: 'Verifica que sapcontrol esta disponible en ambos nodos',
      status: PrerequisiteStatus.WARN, required: true,
      details: 'Verificar manualmente que sapcontrol esta en el PATH de sidadm',
      lastChecked: new Date().toISOString(),
      remediation: 'Ejecutar "su - <sid>adm -c \'which sapcontrol\'" en ambos nodos',
    };
  }

  async _checkProfilesExist(cfg) {
    if (this.mock) {
      return {
        name: 'profiles_exist', displayName: 'Profiles SAP en Target',
        description: 'Verifica que los profiles SAP existen en el nodo target',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] Profiles encontrados en target', lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    return {
      name: 'profiles_exist', displayName: 'Profiles SAP en Target',
      description: 'Verifica que los profiles SAP existen en el nodo target',
      status: PrerequisiteStatus.WARN, required: true,
      details: 'Verificar manualmente que /sapmnt/<SID>/profile/ existe y contiene los profiles necesarios',
      lastChecked: new Date().toISOString(),
      remediation: `Verificar directorio /sapmnt/${cfg.sid}/profile/ en el nodo target`,
    };
  }
}

module.exports = SapServicesDriver;
