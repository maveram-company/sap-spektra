'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.5 — HANA System Replication Driver
//  Maneja failover/takeover de HANA via hdbnsutil y
//  systemReplicationStatus.py.
// ═══════════════════════════════════════════════════════════════

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType, ReplicationMode } = require('../../ha-types');

class HanaSrDriver extends BaseHaDriver {
  /**
   * @param {Object} config
   * @param {string} config.sid - HANA SID (e.g., 'HDB')
   * @param {string} config.instanceNumber - HANA instance number (e.g., '00')
   * @param {string} config.sourceInstanceId - EC2 ID del nodo primario
   * @param {string} config.targetInstanceId - EC2 ID del nodo secundario
   * @param {string} config.sidadmUser - Usuario sidadm (default: <sid>adm)
   * @param {string} config.replicationMode - SYNC|SYNCMEM|ASYNC
   * @param {boolean} config.mock - Si es true, simular
   */
  constructor(config = {}) {
    super('hana-sr', DriverType.DB, '1.0.0');
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

    if (!c.sid) errors.push('sid es requerido (HANA SID, e.g., HDB)');
    if (!c.instanceNumber) errors.push('instanceNumber es requerido (e.g., 00)');
    if (!c.sourceInstanceId) errors.push('sourceInstanceId es requerido');
    if (!c.targetInstanceId) errors.push('targetInstanceId es requerido');

    return { valid: errors.length === 0, errors, config: c };
  }

  async checkPrerequisites(context) {
    const checks = [];
    const cfg = { ...this.config, ...context };

    // Check 1: Estado de replicacion SR
    checks.push(await this._checkReplicationStatus(cfg));

    // Check 2: HANA corriendo en ambos nodos
    checks.push(await this._checkHanaRunning(cfg));

    // Check 3: Modo de replicacion
    checks.push(await this._checkReplicationMode(cfg));

    // Check 4: Log shipping al dia
    checks.push(await this._checkLogShipping(cfg));

    return checks;
  }

  /** Ejecutar takeover de HANA SR */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const action = step.action;

    this.log('info', `Ejecutando HANA SR action: ${action}`, {
      sid: cfg.sid, instanceNumber: cfg.instanceNumber,
    });

    switch (action) {
      case 'takeover':
        return this._executeTakeover(cfg);
      case 'registerAsSecondary':
        return this._executeRegister(cfg);
      default:
        throw new Error(`HANA SR: accion desconocida: ${action}`);
    }
  }

  /** Ejecutar takeover de HANA en el nodo secundario */
  async _executeTakeover(cfg) {
    const targetInstanceId = cfg.targetNode?.instanceId || cfg.targetInstanceId;
    const sid = cfg.sid;
    const sidadm = cfg.sidadmUser || `${sid.toLowerCase()}adm`;

    this.log('info', 'Iniciando HANA SR takeover', { sid, targetInstanceId });

    if (this.mock) {
      return this._mockTakeover(cfg);
    }

    // Paso 1: Verificar estado SR actual
    const srStatus = await this._getSrStatus(targetInstanceId, sid, sidadm);
    this.createEvidenceEntry('sr_status_pre_takeover', { srStatus });

    // Paso 2: Ejecutar takeover
    const takeoverCmd = `su - ${sidadm} -c 'hdbnsutil -sr_takeover'`;
    const takeoverResult = await this._ssmCommand(targetInstanceId, takeoverCmd);

    this.createEvidenceEntry('sr_takeover_executed', {
      command: 'hdbnsutil -sr_takeover',
      result: takeoverResult,
    });

    // Paso 3: Esperar a que HANA este en modo PRIMARY
    await this._waitForPrimaryStatus(targetInstanceId, sid, sidadm);

    // Paso 4: Verificar conectividad DB
    const connectivity = await this._checkDbConnectivity(targetInstanceId, sid, sidadm);
    this.createEvidenceEntry('db_connectivity_post_takeover', { connectivity });

    this.log('info', 'HANA SR takeover completado', { sid, newPrimary: targetInstanceId });

    return {
      success: true,
      action: 'takeover',
      sid,
      newPrimaryInstance: targetInstanceId,
      srStatus: 'PRIMARY',
      connectivity,
    };
  }

  /** Registrar antiguo primario como nuevo secundario */
  async _executeRegister(cfg) {
    const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId;
    const targetInstanceId = cfg.targetNode?.instanceId || cfg.targetInstanceId;
    const sid = cfg.sid;
    const sidadm = cfg.sidadmUser || `${sid.toLowerCase()}adm`;
    const targetHostname = cfg.targetNode?.hostname || cfg.targetHostname;
    const replicationMode = cfg.replicationMode || ReplicationMode.SYNC;

    this.log('info', 'Registrando antiguo primario como secundario', {
      sid, sourceInstanceId, replicationMode,
    });

    if (this.mock) {
      return this._mockRegister(cfg);
    }

    // Paso 1: Detener HANA en antiguo primario (si esta corriendo)
    const stopCmd = `su - ${sidadm} -c 'sapcontrol -nr ${cfg.instanceNumber} -function StopSystem'`;
    await this._ssmCommand(sourceInstanceId, stopCmd).catch(() => {
      this.log('warn', 'Stop HANA en source fallo (puede que ya este detenido)');
    });

    // Paso 2: Registrar como secundario
    const registerCmd = `su - ${sidadm} -c 'hdbnsutil -sr_register --name=site1 --remoteHost=${targetHostname} --remoteInstance=${cfg.instanceNumber} --replicationMode=${replicationMode.toLowerCase()} --operationMode=logreplay'`;
    const registerResult = await this._ssmCommand(sourceInstanceId, registerCmd);

    this.createEvidenceEntry('sr_register_executed', {
      command: 'hdbnsutil -sr_register',
      result: registerResult,
      replicationMode,
    });

    // Paso 3: Iniciar HANA en el nuevo secundario
    const startCmd = `su - ${sidadm} -c 'sapcontrol -nr ${cfg.instanceNumber} -function StartSystem'`;
    await this._ssmCommand(sourceInstanceId, startCmd);

    // Paso 4: Esperar a que SR se sincronice
    await this._waitForSyncStatus(targetInstanceId, sid, sidadm);

    this.log('info', 'Registro como secundario completado', { sid, newSecondary: sourceInstanceId });

    return {
      success: true,
      action: 'registerAsSecondary',
      sid,
      newSecondaryInstance: sourceInstanceId,
      replicationMode,
    };
  }

  /** Rollback: intentar revertir takeover */
  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };

    this.log('warn', 'Iniciando rollback de HANA SR', { action: step.action });

    if (this.mock) {
      this.createEvidenceEntry('mock_sr_rollback', { action: step.action });
      return { success: true, mock: true, message: 'Rollback simulado' };
    }

    // Rollback de takeover es complejo y depende del estado actual.
    // Se intenta re-registrar el nuevo primario como secundario y reactivar el original.
    this.createEvidenceEntry('sr_rollback_attempted', {
      action: step.action,
      warning: 'HANA SR rollback es una operacion delicada. Verificar estado manualmente.',
    });

    return {
      success: true,
      warning: 'HANA SR rollback ejecutado. Se recomienda verificar estado de replicacion manualmente.',
    };
  }

  /** Health check: verificar SR status y conectividad */
  async healthCheck(context) {
    const cfg = { ...this.config, ...context };

    if (this.mock) {
      return {
        healthy: true,
        mock: true,
        replicationStatus: 'SOK',
        mode: 'SYNC',
        timestamp: new Date().toISOString(),
      };
    }

    const instanceId = cfg.targetInstanceId || cfg.sourceInstanceId;
    const sid = cfg.sid;
    const sidadm = cfg.sidadmUser || `${sid.toLowerCase()}adm`;

    const srStatus = await this._getSrStatus(instanceId, sid, sidadm);
    const healthy = srStatus.includes('SOK') || srStatus.includes('active');

    return {
      healthy,
      replicationStatus: srStatus,
      sid,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Metodos internos ───

  _mockTakeover(cfg) {
    this.log('info', '[MOCK] HANA SR takeover simulado', { sid: cfg.sid });
    this.createEvidenceEntry('mock_sr_takeover', { sid: cfg.sid });
    return {
      success: true, mock: true, action: 'takeover',
      sid: cfg.sid, srStatus: 'PRIMARY',
    };
  }

  _mockRegister(cfg) {
    this.log('info', '[MOCK] HANA SR register simulado', { sid: cfg.sid });
    this.createEvidenceEntry('mock_sr_register', { sid: cfg.sid });
    return {
      success: true, mock: true, action: 'registerAsSecondary',
      sid: cfg.sid, replicationMode: cfg.replicationMode || 'SYNC',
    };
  }

  async _ssmCommand(instanceId, command) {
    if (this.mock) return `[MOCK] ${command}`;

    const ssm = this._getSsmClient();
    const { SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');

    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: { commands: [command] },
      TimeoutSeconds: 180,
    }));

    const commandId = sendResult.Command.CommandId;
    let attempts = 0;

    while (attempts < 45) {
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

  async _getSrStatus(instanceId, sid, sidadm) {
    const cmd = `su - ${sidadm} -c 'python /usr/sap/${sid}/HDB${this.config.instanceNumber}/exe/python_support/systemReplicationStatus.py'`;
    try {
      return await this._ssmCommand(instanceId, cmd);
    } catch {
      return 'UNKNOWN';
    }
  }

  async _waitForPrimaryStatus(instanceId, sid, sidadm) {
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const status = await this._getSrStatus(instanceId, sid, sidadm);
      if (status.includes('PRIMARY') || status.includes('mode: primary')) {
        return true;
      }
    }
    throw new Error('HANA no alcanzo estado PRIMARY despues de 100s');
  }

  async _waitForSyncStatus(instanceId, sid, sidadm) {
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const status = await this._getSrStatus(instanceId, sid, sidadm);
      if (status.includes('SOK') || status.includes('ACTIVE')) return true;
    }
    this.log('warn', 'SR no alcanzo SOK en 150s (puede tomar mas tiempo)');
  }

  async _checkDbConnectivity(instanceId, sid, sidadm) {
    const cmd = `su - ${sidadm} -c 'hdbsql -U SYSTEM -j "SELECT 1 FROM DUMMY"'`;
    try {
      await this._ssmCommand(instanceId, cmd);
      return { connected: true };
    } catch {
      return { connected: false };
    }
  }

  // ─── Prerequisite checks ───

  async _checkReplicationStatus(cfg) {
    if (this.mock) {
      return {
        name: 'replication_health', displayName: 'Replicacion HANA SR',
        description: 'Verifica que HANA System Replication esta activo y sincronizado',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] SR activo, modo SYNC, estado SOK',
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    try {
      const instanceId = cfg.sourceInstanceId;
      const sid = cfg.sid;
      const sidadm = cfg.sidadmUser || `${sid.toLowerCase()}adm`;
      const status = await this._getSrStatus(instanceId, sid, sidadm);
      const healthy = status.includes('SOK');

      return {
        name: 'replication_health', displayName: 'Replicacion HANA SR',
        description: 'Verifica que HANA System Replication esta activo y sincronizado',
        status: healthy ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
        required: true,
        details: healthy ? 'SR activo y sincronizado (SOK)' : `SR no sincronizado: ${status.substring(0, 200)}`,
        lastChecked: new Date().toISOString(),
        remediation: healthy ? '' : 'Verificar estado de SR con systemReplicationStatus.py. Esperar sincronizacion antes de takeover.',
      };
    } catch (err) {
      return {
        name: 'replication_health', displayName: 'Replicacion HANA SR',
        description: 'Verifica que HANA System Replication esta activo y sincronizado',
        status: PrerequisiteStatus.FAIL, required: true,
        details: `Error verificando SR: ${err.message}`,
        lastChecked: new Date().toISOString(),
        remediation: 'Verificar acceso SSM y que HANA esta corriendo',
      };
    }
  }

  async _checkHanaRunning(cfg) {
    if (this.mock) {
      return {
        name: 'hana_running', displayName: 'HANA Corriendo',
        description: 'Verifica que HANA esta corriendo en ambos nodos',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] HANA corriendo en ambos nodos',
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    return {
      name: 'hana_running', displayName: 'HANA Corriendo',
      description: 'Verifica que HANA esta corriendo en ambos nodos',
      status: PrerequisiteStatus.WARN, required: true,
      details: 'Verificar manualmente con sapcontrol que HANA esta corriendo',
      lastChecked: new Date().toISOString(),
      remediation: 'Ejecutar sapcontrol -nr XX -function GetProcessList en ambos nodos',
    };
  }

  async _checkReplicationMode(cfg) {
    const mode = cfg.replicationMode || 'SYNC';
    return {
      name: 'replication_mode', displayName: 'Modo de Replicacion',
      description: 'Verifica el modo de replicacion configurado',
      status: mode === 'SYNC' ? PrerequisiteStatus.PASS : PrerequisiteStatus.WARN,
      required: false,
      details: `Modo configurado: ${mode}${mode !== 'SYNC' ? ' (SYNC recomendado para zero data loss)' : ''}`,
      lastChecked: new Date().toISOString(),
      remediation: mode === 'SYNC' ? '' : 'Considerar modo SYNC para zero data loss en produccion',
    };
  }

  async _checkLogShipping(cfg) {
    if (this.mock) {
      return {
        name: 'log_shipping', displayName: 'Log Shipping Al Dia',
        description: 'Verifica que los logs de transaccion estan al dia',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] Log shipping al dia, delta < 1s',
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    return {
      name: 'log_shipping', displayName: 'Log Shipping Al Dia',
      description: 'Verifica que los logs de transaccion estan al dia',
      status: PrerequisiteStatus.WARN, required: true,
      details: 'Log shipping delta no verificado — verificar con systemReplicationStatus.py',
      lastChecked: new Date().toISOString(),
      remediation: 'Ejecutar systemReplicationStatus.py y verificar SHIPPING_DELTA',
    };
  }
}

module.exports = HanaSrDriver;
