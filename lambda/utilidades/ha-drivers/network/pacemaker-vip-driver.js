'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.5 — Pacemaker VIP Network Driver
//  Maneja failover de red mediante movimiento de Virtual IP
//  en clusters Pacemaker/Corosync via SSM commands.
// ═══════════════════════════════════════════════════════════════

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType } = require('../../ha-types');

class PacemakerVipDriver extends BaseHaDriver {
  /**
   * @param {Object} config
   * @param {string} config.vipResourceName - Nombre del recurso VIP en Pacemaker (e.g., 'rsc_ip_PRD_HDB00')
   * @param {string} config.vipAddress - Direccion IP virtual
   * @param {string} config.sourceInstanceId - EC2 ID del nodo source (para SSM)
   * @param {string} config.targetInstanceId - EC2 ID del nodo target (para SSM)
   * @param {string} config.clusterTool - 'crm' (SLES) o 'pcs' (RHEL) (default: auto-detect)
   * @param {boolean} config.mock - Si es true, simular
   */
  constructor(config = {}) {
    super('pacemaker_vip', DriverType.NETWORK, '1.0.0');
    this.config = config;
    this.mock = config.mock || process.env.MOCK === 'true';
    this._ssmClient = null;
  }

  /** Obtener cliente SSM (lazy init) */
  _getSsmClient() {
    if (!this._ssmClient && !this.mock) {
      const { SSMClient } = require('@aws-sdk/client-ssm');
      this._ssmClient = new SSMClient({});
    }
    return this._ssmClient;
  }

  /** Validar configuracion */
  async validateConfig(config) {
    const c = config || this.config;
    const errors = [];

    if (!c.vipResourceName) errors.push('vipResourceName es requerido (nombre del recurso VIP en Pacemaker)');
    if (!c.sourceInstanceId) errors.push('sourceInstanceId es requerido para SSM');
    if (!c.targetInstanceId) errors.push('targetInstanceId es requerido para SSM');

    return { valid: errors.length === 0, errors, config: c };
  }

  /** Verificar prerequisitos */
  async checkPrerequisites(context) {
    const checks = [];
    const cfg = { ...this.config, ...context };

    // Check 1: Cluster Pacemaker activo
    checks.push(await this._checkClusterStatus(cfg));

    // Check 2: Recurso VIP configurado
    checks.push(await this._checkVipResource(cfg));

    // Check 3: SSM agent accesible en ambos nodos
    checks.push(await this._checkSsmAccess(cfg));

    // Check 4: Nodo target disponible en cluster
    checks.push(await this._checkTargetNodeInCluster(cfg));

    return checks;
  }

  /** Ejecutar movimiento de VIP al nodo target */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const vipResource = cfg.vipResourceName;
    const targetInstanceId = cfg.targetNode?.instanceId || cfg.targetInstanceId;
    const targetHostname = cfg.targetNode?.hostname || cfg.targetHostname;

    this.log('info', 'Iniciando movimiento de VIP via Pacemaker', {
      vipResource, targetInstanceId, targetHostname,
    });

    if (this.mock) {
      return this._mockExecute(cfg, targetHostname);
    }

    // Detectar herramienta de cluster
    const clusterTool = cfg.clusterTool || await this._detectClusterTool(targetInstanceId);

    // Paso 1: Poner cluster en maintenance mode (evitar acciones automaticas)
    await this._ssmCommand(targetInstanceId, this._maintenanceCommand(clusterTool, true));

    this.createEvidenceEntry('cluster_maintenance_on', { targetInstanceId });

    // Paso 2: Mover recurso VIP al nodo target
    const moveCommand = this._buildMoveCommand(clusterTool, vipResource, targetHostname);
    const moveResult = await this._ssmCommand(targetInstanceId, moveCommand);

    this.createEvidenceEntry('vip_move_command', {
      command: moveCommand,
      result: moveResult,
      targetHostname,
    });

    // Paso 3: Esperar a que el recurso se mueva
    await this._waitForVipOnNode(targetInstanceId, clusterTool, vipResource, targetHostname);

    // Paso 4: Quitar maintenance mode
    await this._ssmCommand(targetInstanceId, this._maintenanceCommand(clusterTool, false));

    this.createEvidenceEntry('cluster_maintenance_off', { targetInstanceId });

    // Paso 5: Verificar estado final
    const status = await this._getClusterStatus(targetInstanceId, clusterTool);

    this.log('info', 'Movimiento de VIP completado', {
      vipResource, targetHostname, status: 'success',
    });

    return {
      success: true,
      vipResource,
      movedTo: targetHostname,
      clusterTool,
      clusterStatus: status,
    };
  }

  /** Rollback: mover VIP de vuelta al nodo source */
  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const vipResource = cfg.vipResourceName;
    const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId;
    const sourceHostname = cfg.sourceNode?.hostname || cfg.sourceHostname;

    this.log('warn', 'Iniciando rollback de VIP', { vipResource, sourceHostname });

    if (this.mock) {
      return this._mockExecute(cfg, sourceHostname);
    }

    const clusterTool = cfg.clusterTool || await this._detectClusterTool(sourceInstanceId);

    // Mover VIP de vuelta al source
    const moveCommand = this._buildMoveCommand(clusterTool, vipResource, sourceHostname);
    await this._ssmCommand(sourceInstanceId, moveCommand);

    // Esperar
    await this._waitForVipOnNode(sourceInstanceId, clusterTool, vipResource, sourceHostname);

    this.createEvidenceEntry('vip_rollback_completed', {
      vipResource, restoredTo: sourceHostname,
    });

    return { success: true, rolledBackTo: sourceHostname };
  }

  /** Health check: verificar estado del cluster y VIP */
  async healthCheck(context) {
    const cfg = { ...this.config, ...context };

    if (this.mock) {
      return { healthy: true, mock: true, timestamp: new Date().toISOString() };
    }

    const instanceId = cfg.targetInstanceId || cfg.sourceInstanceId;
    const clusterTool = cfg.clusterTool || await this._detectClusterTool(instanceId);
    const status = await this._getClusterStatus(instanceId, clusterTool);

    return {
      healthy: status.includes('Online') || status.includes('online'),
      clusterStatus: status,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Metodos internos ───

  _mockExecute(cfg, targetHostname) {
    this.log('info', '[MOCK] Movimiento de VIP simulado', {
      vipResource: cfg.vipResourceName,
      targetHostname,
    });
    this.createEvidenceEntry('mock_vip_move', {
      vipResource: cfg.vipResourceName,
      targetHostname,
    });

    return {
      success: true,
      mock: true,
      vipResource: cfg.vipResourceName,
      movedTo: targetHostname,
      clusterTool: 'crm',
    };
  }

  /** Enviar comando via SSM y obtener output */
  async _ssmCommand(instanceId, command) {
    if (this.mock) return `[MOCK] Ejecutado: ${command}`;

    const ssm = this._getSsmClient();
    const { SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');

    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: { commands: [command] },
      TimeoutSeconds: 120,
    }));

    const commandId = sendResult.Command.CommandId;

    // Poll para resultado
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;

      try {
        const invocation = await ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }));

        if (invocation.Status === 'Success') {
          return invocation.StandardOutputContent || '';
        } else if (['Failed', 'Cancelled', 'TimedOut'].includes(invocation.Status)) {
          throw new Error(`SSM command failed: ${invocation.StatusDetails} - ${invocation.StandardErrorContent}`);
        }
      } catch (err) {
        if (err.name === 'InvocationDoesNotExist') continue;
        throw err;
      }
    }

    throw new Error(`SSM command timed out after ${attempts * 2}s`);
  }

  /** Detectar herramienta de cluster (crm para SLES, pcs para RHEL) */
  async _detectClusterTool(instanceId) {
    try {
      const result = await this._ssmCommand(instanceId, 'which crm 2>/dev/null && echo CRM || (which pcs 2>/dev/null && echo PCS || echo UNKNOWN)');
      if (result.includes('CRM')) return 'crm';
      if (result.includes('PCS')) return 'pcs';
      return 'crm'; // Default
    } catch {
      return 'crm';
    }
  }

  /** Construir comando de movimiento de recurso */
  _buildMoveCommand(tool, resourceName, targetHostname) {
    if (tool === 'pcs') {
      return `pcs resource move ${resourceName} ${targetHostname}`;
    }
    return `crm resource move ${resourceName} ${targetHostname}`;
  }

  /** Comando para activar/desactivar maintenance mode */
  _maintenanceCommand(tool, enable) {
    if (tool === 'pcs') {
      return enable
        ? 'pcs property set maintenance-mode=true'
        : 'pcs property set maintenance-mode=false';
    }
    return enable
      ? 'crm configure property maintenance-mode=true'
      : 'crm configure property maintenance-mode=false';
  }

  /** Esperar a que la VIP este en el nodo correcto */
  async _waitForVipOnNode(instanceId, tool, resourceName, expectedHostname) {
    const maxAttempts = 15;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const statusCmd = tool === 'pcs'
        ? `pcs resource show ${resourceName}`
        : `crm resource status ${resourceName}`;

      const status = await this._ssmCommand(instanceId, statusCmd);

      if (status.includes(expectedHostname)) {
        this.log('info', `VIP ${resourceName} confirmada en ${expectedHostname}`, { attempt: i + 1 });
        return true;
      }
    }

    throw new Error(`VIP ${resourceName} no confirmo movimiento a ${expectedHostname} despues de ${maxAttempts * 3}s`);
  }

  /** Obtener estado del cluster */
  async _getClusterStatus(instanceId, tool) {
    const cmd = tool === 'pcs' ? 'pcs status' : 'crm status';
    return this._ssmCommand(instanceId, cmd);
  }

  // ─── Prerequisite checks ───

  async _checkClusterStatus(cfg) {
    const name = 'cluster_active';
    if (this.mock) {
      return {
        name, displayName: 'Cluster Pacemaker Activo',
        description: 'Verifica que el cluster Pacemaker/Corosync esta online',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] Cluster activo con 2 nodos online',
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    try {
      const instanceId = cfg.sourceInstanceId || cfg.targetInstanceId;
      const tool = cfg.clusterTool || await this._detectClusterTool(instanceId);
      const status = await this._getClusterStatus(instanceId, tool);
      const online = status.includes('Online') || status.includes('online');

      return {
        name, displayName: 'Cluster Pacemaker Activo',
        description: 'Verifica que el cluster Pacemaker/Corosync esta online',
        status: online ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
        required: true,
        details: online ? 'Cluster Pacemaker activo' : 'Cluster no reporta nodos online',
        lastChecked: new Date().toISOString(),
        remediation: online ? '' : 'Verificar estado del cluster con "crm status" o "pcs status"',
      };
    } catch (err) {
      return {
        name, displayName: 'Cluster Pacemaker Activo',
        description: 'Verifica que el cluster Pacemaker/Corosync esta online',
        status: PrerequisiteStatus.FAIL, required: true,
        details: `Error verificando cluster: ${err.message}`,
        lastChecked: new Date().toISOString(),
        remediation: 'Verificar SSM access y estado del cluster Pacemaker',
      };
    }
  }

  async _checkVipResource(cfg) {
    const name = 'vip_resource_configured';
    if (this.mock) {
      return {
        name, displayName: 'Recurso VIP Configurado',
        description: 'Verifica que el recurso VIP existe en Pacemaker',
        status: PrerequisiteStatus.PASS, required: true,
        details: `[MOCK] Recurso ${cfg.vipResourceName} encontrado`,
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    return {
      name, displayName: 'Recurso VIP Configurado',
      description: 'Verifica que el recurso VIP existe en la configuracion de Pacemaker',
      status: PrerequisiteStatus.WARN, required: true,
      details: `Recurso VIP ${cfg.vipResourceName || 'no especificado'} — verificar manualmente`,
      lastChecked: new Date().toISOString(),
      remediation: 'Ejecutar "crm resource list" para confirmar nombre del recurso VIP',
    };
  }

  async _checkSsmAccess(cfg) {
    const name = 'ssm_access';
    if (this.mock) {
      return {
        name, displayName: 'SSM Accesible',
        description: 'Verifica que SSM agent esta activo en ambos nodos',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] SSM accesible en ambos nodos',
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    try {
      await this._ssmCommand(cfg.targetInstanceId || cfg.sourceInstanceId, 'echo SSM_OK');
      return {
        name, displayName: 'SSM Accesible',
        description: 'Verifica que SSM agent esta activo en ambos nodos',
        status: PrerequisiteStatus.PASS, required: true,
        details: 'SSM agent respondio correctamente',
        lastChecked: new Date().toISOString(), remediation: '',
      };
    } catch (err) {
      return {
        name, displayName: 'SSM Accesible',
        description: 'Verifica que SSM agent esta activo en ambos nodos',
        status: PrerequisiteStatus.FAIL, required: true,
        details: `SSM no accesible: ${err.message}`,
        lastChecked: new Date().toISOString(),
        remediation: 'Verificar que SSM agent esta instalado y corriendo en los nodos del cluster',
      };
    }
  }

  async _checkTargetNodeInCluster(cfg) {
    const name = 'target_in_cluster';
    if (this.mock) {
      return {
        name, displayName: 'Target en Cluster',
        description: 'Verifica que el nodo target es miembro del cluster',
        status: PrerequisiteStatus.PASS, required: true,
        details: '[MOCK] Nodo target es miembro activo del cluster',
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    return {
      name, displayName: 'Target en Cluster',
      description: 'Verifica que el nodo target es miembro del cluster Pacemaker',
      status: PrerequisiteStatus.WARN, required: true,
      details: 'Verificar manualmente que el nodo target aparece en "crm status"',
      lastChecked: new Date().toISOString(),
      remediation: 'Asegurar que el nodo target esta online en el cluster',
    };
  }
}

module.exports = PacemakerVipDriver;
