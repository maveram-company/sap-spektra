'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.5 — Declarative DB Driver
//  Driver generico para bases de datos sin driver especifico.
//  Configuracion por JSON: comandos de promote, demote, status, health.
//  Soporta MaxDB, ASE, Oracle, etc.
// ═══════════════════════════════════════════════════════════════

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType } = require('../../ha-types');

class DeclarativeDbDriver extends BaseHaDriver {
  /**
   * @param {Object} config
   * @param {string} config.dbType - Tipo de DB (ASE, ORACLE, MAXDB, etc.)
   * @param {string} config.promoteCommand - Comando para promover secundario a primario
   * @param {string} config.demoteCommand - Comando para demover primario a secundario
   * @param {string} config.statusCommand - Comando para verificar estado de replicacion
   * @param {string} config.healthCommand - Comando para health check
   * @param {string} config.expectedStatusOutput - Output esperado del status command cuando healthy
   * @param {string} config.sourceInstanceId - EC2 ID nodo source
   * @param {string} config.targetInstanceId - EC2 ID nodo target
   * @param {boolean} config.mock - Si es true, simular
   */
  constructor(config = {}) {
    super('declarative-db', DriverType.DB, '1.0.0');
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

    if (!c.dbType) errors.push('dbType es requerido (ASE, ORACLE, MAXDB, etc.)');
    if (!c.promoteCommand) errors.push('promoteCommand es requerido');
    if (!c.statusCommand) errors.push('statusCommand es requerido');
    if (!c.sourceInstanceId) errors.push('sourceInstanceId es requerido');
    if (!c.targetInstanceId) errors.push('targetInstanceId es requerido');

    return { valid: errors.length === 0, errors, config: c };
  }

  async checkPrerequisites(context) {
    const checks = [];
    const cfg = { ...this.config, ...context };

    // Check 1: DB status
    checks.push(await this._checkDbStatus(cfg));

    // Check 2: SSM access
    checks.push(await this._checkSsmAccess(cfg));

    // Check 3: Comandos configurados
    checks.push(this._checkCommandsConfigured(cfg));

    return checks;
  }

  /** Ejecutar operacion declarativa */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const action = step.action;

    switch (action) {
      case 'takeover':
        return this._executePromote(cfg);
      case 'registerAsSecondary':
        return this._executeDemote(cfg);
      default:
        throw new Error(`DeclarativeDB: accion desconocida: ${action}`);
    }
  }

  /** Promover secundario a primario */
  async _executePromote(cfg) {
    const targetInstanceId = cfg.targetNode?.instanceId || cfg.targetInstanceId;
    const promoteCmd = cfg.promoteCommand;

    this.log('info', `Promoviendo ${cfg.dbType} en instancia target`, {
      targetInstanceId, command: promoteCmd,
    });

    if (this.mock) {
      this.createEvidenceEntry('mock_db_promote', { dbType: cfg.dbType });
      return { success: true, mock: true, action: 'promote', dbType: cfg.dbType };
    }

    // Ejecutar comando de promote
    const result = await this._ssmCommand(targetInstanceId, promoteCmd);

    this.createEvidenceEntry('db_promote_executed', {
      dbType: cfg.dbType,
      command: promoteCmd,
      output: result.substring(0, 500),
    });

    // Verificar status post-promote
    if (cfg.statusCommand) {
      const status = await this._ssmCommand(targetInstanceId, cfg.statusCommand);
      this.createEvidenceEntry('db_status_post_promote', { status: status.substring(0, 500) });

      if (cfg.expectedStatusOutput && !status.includes(cfg.expectedStatusOutput)) {
        this.log('warn', 'Status post-promote no coincide con esperado', {
          expected: cfg.expectedStatusOutput,
          actual: status.substring(0, 200),
        });
      }
    }

    return {
      success: true,
      action: 'promote',
      dbType: cfg.dbType,
      targetInstanceId,
      output: result.substring(0, 500),
    };
  }

  /** Demover primario a secundario */
  async _executeDemote(cfg) {
    const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId;
    const demoteCmd = cfg.demoteCommand;

    if (!demoteCmd) {
      this.log('warn', 'No hay demoteCommand configurado, omitiendo demote');
      return { success: true, skipped: true, reason: 'No demoteCommand configured' };
    }

    this.log('info', `Demoviendo ${cfg.dbType} en instancia source`, {
      sourceInstanceId, command: demoteCmd,
    });

    if (this.mock) {
      this.createEvidenceEntry('mock_db_demote', { dbType: cfg.dbType });
      return { success: true, mock: true, action: 'demote', dbType: cfg.dbType };
    }

    const result = await this._ssmCommand(sourceInstanceId, demoteCmd);

    this.createEvidenceEntry('db_demote_executed', {
      dbType: cfg.dbType,
      command: demoteCmd,
      output: result.substring(0, 500),
    });

    return {
      success: true,
      action: 'demote',
      dbType: cfg.dbType,
      sourceInstanceId,
    };
  }

  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };

    this.log('warn', 'Rollback de DeclarativeDB', { action: step.action });

    if (this.mock) {
      return { success: true, mock: true, message: 'Rollback simulado' };
    }

    // Rollback = ejecutar promote en el nodo original
    if (step.action === 'takeover' && cfg.promoteCommand) {
      const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId;
      const result = await this._ssmCommand(sourceInstanceId, cfg.promoteCommand);
      this.createEvidenceEntry('db_rollback_promote', {
        dbType: cfg.dbType,
        restoredTo: sourceInstanceId,
      });
      return { success: true, rolledBackTo: sourceInstanceId };
    }

    return { success: true, warning: 'Rollback parcial — verificar manualmente' };
  }

  async healthCheck(context) {
    const cfg = { ...this.config, ...context };

    if (this.mock) {
      return { healthy: true, mock: true, dbType: cfg.dbType, timestamp: new Date().toISOString() };
    }

    if (!cfg.healthCommand) {
      return { healthy: true, warning: 'No healthCommand configured', timestamp: new Date().toISOString() };
    }

    try {
      const instanceId = cfg.targetInstanceId || cfg.sourceInstanceId;
      const result = await this._ssmCommand(instanceId, cfg.healthCommand);
      return {
        healthy: true,
        dbType: cfg.dbType,
        output: result.substring(0, 200),
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        healthy: false,
        dbType: cfg.dbType,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ─── SSM helper ───

  async _ssmCommand(instanceId, command) {
    if (this.mock) return `[MOCK] ${command}`;

    const ssm = this._getSsmClient();
    const { SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');

    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: { commands: [command] },
      TimeoutSeconds: 120,
    }));

    const commandId = sendResult.Command.CommandId;
    let attempts = 0;

    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 4000));
      attempts++;
      try {
        const inv = await ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId, InstanceId: instanceId,
        }));
        if (inv.Status === 'Success') return inv.StandardOutputContent || '';
        if (['Failed', 'Cancelled', 'TimedOut'].includes(inv.Status)) {
          throw new Error(`SSM fallo: ${inv.StatusDetails}`);
        }
      } catch (err) {
        if (err.name === 'InvocationDoesNotExist') continue;
        throw err;
      }
    }
    throw new Error('SSM command timeout');
  }

  // ─── Prerequisite checks ───

  async _checkDbStatus(cfg) {
    if (this.mock || !cfg.statusCommand) {
      return {
        name: 'db_status', displayName: `Estado ${cfg.dbType || 'DB'}`,
        description: `Verifica estado de replicacion de ${cfg.dbType || 'DB'}`,
        status: this.mock ? PrerequisiteStatus.PASS : PrerequisiteStatus.WARN,
        required: true,
        details: this.mock ? `[MOCK] ${cfg.dbType} replicacion activa` : 'statusCommand no configurado',
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    try {
      const result = await this._ssmCommand(cfg.sourceInstanceId, cfg.statusCommand);
      const healthy = cfg.expectedStatusOutput ? result.includes(cfg.expectedStatusOutput) : true;
      return {
        name: 'db_status', displayName: `Estado ${cfg.dbType}`,
        description: `Verifica estado de replicacion de ${cfg.dbType}`,
        status: healthy ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
        required: true,
        details: healthy ? `${cfg.dbType} replicacion activa` : `Status inesperado: ${result.substring(0, 200)}`,
        lastChecked: new Date().toISOString(),
        remediation: healthy ? '' : `Verificar manualmente con: ${cfg.statusCommand}`,
      };
    } catch (err) {
      return {
        name: 'db_status', displayName: `Estado ${cfg.dbType}`,
        description: `Verifica estado de replicacion de ${cfg.dbType}`,
        status: PrerequisiteStatus.FAIL, required: true,
        details: `Error: ${err.message}`,
        lastChecked: new Date().toISOString(),
        remediation: 'Verificar acceso SSM y estado de la DB',
      };
    }
  }

  async _checkSsmAccess(cfg) {
    if (this.mock) {
      return {
        name: 'ssm_access', displayName: 'SSM Accesible',
        description: 'Verifica conectividad SSM con los nodos',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] SSM accesible', lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    try {
      await this._ssmCommand(cfg.targetInstanceId || cfg.sourceInstanceId, 'echo OK');
      return {
        name: 'ssm_access', displayName: 'SSM Accesible',
        description: 'Verifica conectividad SSM con los nodos',
        status: PrerequisiteStatus.PASS, required: true,
        details: 'SSM respondio correctamente', lastChecked: new Date().toISOString(), remediation: '',
      };
    } catch (err) {
      return {
        name: 'ssm_access', displayName: 'SSM Accesible',
        description: 'Verifica conectividad SSM con los nodos',
        status: PrerequisiteStatus.FAIL, required: true,
        details: `SSM error: ${err.message}`, lastChecked: new Date().toISOString(),
        remediation: 'Verificar SSM agent y permisos IAM',
      };
    }
  }

  _checkCommandsConfigured(cfg) {
    const missing = [];
    if (!cfg.promoteCommand) missing.push('promoteCommand');
    if (!cfg.statusCommand) missing.push('statusCommand');

    return {
      name: 'commands_configured', displayName: 'Comandos Configurados',
      description: 'Verifica que los comandos de DB HA estan configurados',
      status: missing.length === 0 ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
      required: true,
      details: missing.length === 0
        ? `Todos los comandos configurados para ${cfg.dbType}`
        : `Faltan comandos: ${missing.join(', ')}`,
      lastChecked: new Date().toISOString(),
      remediation: missing.length > 0 ? `Configurar: ${missing.join(', ')} en HADriverConfigTable` : '',
    };
  }
}

module.exports = DeclarativeDbDriver;
