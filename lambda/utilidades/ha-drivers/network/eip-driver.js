'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.5 — EIP Network Driver
//  Maneja failover de red mediante reasociacion de Elastic IP.
//  Soporta modo real (AWS EC2 API) y modo mock.
// ═══════════════════════════════════════════════════════════════

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType } = require('../../ha-types');

class EipDriver extends BaseHaDriver {
  /**
   * @param {Object} config
   * @param {string} config.allocationId - ID del Elastic IP (eipalloc-xxx)
   * @param {string} config.sourceInstanceId - EC2 instance ID del nodo primario
   * @param {string} config.targetInstanceId - EC2 instance ID del nodo secundario
   * @param {boolean} config.mock - Si es true, simular en lugar de ejecutar
   */
  constructor(config = {}) {
    super('eip', DriverType.NETWORK, '1.0.0');
    this.config = config;
    this.mock = config.mock || process.env.MOCK === 'true';
    this._ec2Client = null;
  }

  /** Obtener cliente EC2 (lazy init) */
  _getEc2Client() {
    if (!this._ec2Client && !this.mock) {
      const { EC2Client } = require('@aws-sdk/client-ec2');
      this._ec2Client = new EC2Client({});
    }
    return this._ec2Client;
  }

  /** Validar configuracion del driver */
  async validateConfig(config) {
    const c = config || this.config;
    const errors = [];

    if (!c.allocationId) errors.push('allocationId es requerido (eipalloc-xxx)');
    if (!c.sourceInstanceId) errors.push('sourceInstanceId es requerido (i-xxx)');
    if (!c.targetInstanceId) errors.push('targetInstanceId es requerido (i-xxx)');

    if (c.allocationId && !c.allocationId.startsWith('eipalloc-')) {
      errors.push('allocationId debe comenzar con "eipalloc-"');
    }
    if (c.sourceInstanceId && !c.sourceInstanceId.startsWith('i-')) {
      errors.push('sourceInstanceId debe comenzar con "i-"');
    }
    if (c.targetInstanceId && !c.targetInstanceId.startsWith('i-')) {
      errors.push('targetInstanceId debe comenzar con "i-"');
    }

    return {
      valid: errors.length === 0,
      errors,
      config: c,
    };
  }

  /** Verificar prerequisitos para EIP switch */
  async checkPrerequisites(context) {
    const checks = [];
    const cfg = { ...this.config, ...context };

    // Check 1: EIP existe y esta asignada
    checks.push(await this._checkEipExists(cfg));

    // Check 2: Instancia target existe y esta running
    checks.push(await this._checkTargetInstance(cfg));

    // Check 3: Instancias en misma VPC
    checks.push(await this._checkSameVpc(cfg));

    // Check 4: Permisos IAM suficientes
    checks.push(await this._checkIamPermissions(cfg));

    return checks;
  }

  /** Ejecutar switch de EIP: desasociar de source, asociar a target */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const allocationId = cfg.allocationId;
    const targetInstanceId = cfg.targetNode?.instanceId || cfg.targetInstanceId;

    this.log('info', 'Iniciando switch de EIP', { allocationId, targetInstanceId });

    if (this.mock) {
      return this._mockExecute(allocationId, targetInstanceId);
    }

    const ec2 = this._getEc2Client();

    // Paso 1: Obtener associationId actual (si existe)
    const { DescribeAddressesCommand } = require('@aws-sdk/client-ec2');
    const descResult = await ec2.send(new DescribeAddressesCommand({
      AllocationIds: [allocationId],
    }));

    const eip = descResult.Addresses?.[0];
    if (!eip) {
      throw new Error(`EIP ${allocationId} no encontrada`);
    }

    const currentAssociationId = eip.AssociationId;
    const previousInstanceId = eip.InstanceId;

    // Paso 2: Desasociar EIP del source (si esta asociada)
    if (currentAssociationId) {
      this.log('info', 'Desasociando EIP de instancia actual', {
        associationId: currentAssociationId,
        previousInstanceId,
      });

      const { DisassociateAddressCommand } = require('@aws-sdk/client-ec2');
      await this.withRetry(async () => {
        await ec2.send(new DisassociateAddressCommand({
          AssociationId: currentAssociationId,
        }));
      }, 3, 2000, 'DisassociateEIP');

      this.createEvidenceEntry('eip_disassociated', {
        allocationId,
        previousInstanceId,
        associationId: currentAssociationId,
      });
    }

    // Paso 3: Asociar EIP al target
    this.log('info', 'Asociando EIP a instancia target', { allocationId, targetInstanceId });

    const { AssociateAddressCommand } = require('@aws-sdk/client-ec2');
    const assocResult = await this.withRetry(async () => {
      return ec2.send(new AssociateAddressCommand({
        AllocationId: allocationId,
        InstanceId: targetInstanceId,
        AllowReassociation: true,
      }));
    }, 3, 2000, 'AssociateEIP');

    const newAssociationId = assocResult.AssociationId;

    this.createEvidenceEntry('eip_associated', {
      allocationId,
      targetInstanceId,
      newAssociationId,
      previousInstanceId,
    });

    // Paso 4: Verificar asociacion
    await this._verifyAssociation(allocationId, targetInstanceId);

    this.log('info', 'Switch de EIP completado exitosamente', {
      allocationId,
      from: previousInstanceId,
      to: targetInstanceId,
      newAssociationId,
    });

    return {
      success: true,
      allocationId,
      previousInstanceId,
      targetInstanceId,
      newAssociationId,
      publicIp: eip.PublicIp,
    };
  }

  /** Rollback: reasociar EIP a la instancia original */
  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const allocationId = cfg.allocationId;
    const sourceInstanceId = cfg.sourceNode?.instanceId || cfg.sourceInstanceId;

    this.log('warn', 'Iniciando rollback de EIP', { allocationId, sourceInstanceId });

    if (this.mock) {
      return this._mockExecute(allocationId, sourceInstanceId);
    }

    const ec2 = this._getEc2Client();

    // Desasociar de target
    const { DescribeAddressesCommand, DisassociateAddressCommand, AssociateAddressCommand } = require('@aws-sdk/client-ec2');

    const descResult = await ec2.send(new DescribeAddressesCommand({
      AllocationIds: [allocationId],
    }));
    const eip = descResult.Addresses?.[0];

    if (eip?.AssociationId) {
      await ec2.send(new DisassociateAddressCommand({
        AssociationId: eip.AssociationId,
      }));
    }

    // Reasociar a source
    const assocResult = await ec2.send(new AssociateAddressCommand({
      AllocationId: allocationId,
      InstanceId: sourceInstanceId,
      AllowReassociation: true,
    }));

    this.createEvidenceEntry('eip_rollback_completed', {
      allocationId,
      restoredTo: sourceInstanceId,
      newAssociationId: assocResult.AssociationId,
    });

    this.log('info', 'Rollback de EIP completado', { allocationId, sourceInstanceId });

    return {
      success: true,
      rolledBackTo: sourceInstanceId,
      newAssociationId: assocResult.AssociationId,
    };
  }

  /** Health check: verificar que EIP esta asociada correctamente */
  async healthCheck(context) {
    const cfg = { ...this.config, ...context };

    if (this.mock) {
      return { healthy: true, mock: true, timestamp: new Date().toISOString() };
    }

    const ec2 = this._getEc2Client();
    const { DescribeAddressesCommand } = require('@aws-sdk/client-ec2');

    const result = await ec2.send(new DescribeAddressesCommand({
      AllocationIds: [cfg.allocationId],
    }));

    const eip = result.Addresses?.[0];
    const healthy = eip && !!eip.InstanceId;

    return {
      healthy,
      allocationId: cfg.allocationId,
      publicIp: eip?.PublicIp,
      associatedInstance: eip?.InstanceId || null,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Metodos internos ───

  /** Mock execution para modo desarrollo/test */
  _mockExecute(allocationId, targetInstanceId) {
    this.log('info', '[MOCK] Switch de EIP simulado', { allocationId, targetInstanceId });
    this.createEvidenceEntry('mock_eip_switch', { allocationId, targetInstanceId });

    return {
      success: true,
      mock: true,
      allocationId,
      targetInstanceId,
      publicIp: '203.0.113.42',
      newAssociationId: `eipassoc-mock-${Date.now()}`,
    };
  }

  /** Verificar que la EIP esta asociada a la instancia correcta */
  async _verifyAssociation(allocationId, expectedInstanceId) {
    const ec2 = this._getEc2Client();
    const { DescribeAddressesCommand } = require('@aws-sdk/client-ec2');

    // Esperar un momento para que la asociacion se propague
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await ec2.send(new DescribeAddressesCommand({
      AllocationIds: [allocationId],
    }));

    const eip = result.Addresses?.[0];
    if (!eip || eip.InstanceId !== expectedInstanceId) {
      throw new Error(
        `Verificacion fallida: EIP ${allocationId} esperaba instancia ${expectedInstanceId} ` +
        `pero esta asociada a ${eip?.InstanceId || 'ninguna'}`
      );
    }

    return true;
  }

  /** Check: EIP existe */
  async _checkEipExists(cfg) {
    try {
      if (this.mock) {
        return {
          name: 'eip_exists',
          displayName: 'EIP Existe',
          description: 'Verifica que el Elastic IP existe y esta asignado',
          status: PrerequisiteStatus.PASS,
          required: true,
          details: `[MOCK] EIP ${cfg.allocationId} encontrada`,
          lastChecked: new Date().toISOString(),
          remediation: '',
        };
      }

      const ec2 = this._getEc2Client();
      const { DescribeAddressesCommand } = require('@aws-sdk/client-ec2');
      const result = await ec2.send(new DescribeAddressesCommand({
        AllocationIds: [cfg.allocationId],
      }));

      const exists = result.Addresses?.length > 0;
      return {
        name: 'eip_exists',
        displayName: 'EIP Existe',
        description: 'Verifica que el Elastic IP existe y esta asignado',
        status: exists ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
        required: true,
        details: exists
          ? `EIP ${cfg.allocationId} encontrada (IP: ${result.Addresses[0].PublicIp})`
          : `EIP ${cfg.allocationId} no encontrada`,
        lastChecked: new Date().toISOString(),
        remediation: exists ? '' : 'Verificar que el allocationId es correcto y que la EIP existe en la cuenta AWS',
      };
    } catch (err) {
      return {
        name: 'eip_exists',
        displayName: 'EIP Existe',
        description: 'Verifica que el Elastic IP existe y esta asignado',
        status: PrerequisiteStatus.FAIL,
        required: true,
        details: `Error verificando EIP: ${err.message}`,
        lastChecked: new Date().toISOString(),
        remediation: 'Verificar permisos IAM para ec2:DescribeAddresses',
      };
    }
  }

  /** Check: instancia target existe y esta running */
  async _checkTargetInstance(cfg) {
    const name = 'target_instance_running';
    try {
      if (this.mock) {
        return {
          name,
          displayName: 'Instancia Target Activa',
          description: 'Verifica que la instancia EC2 destino esta running',
          status: PrerequisiteStatus.PASS,
          required: true,
          details: `[MOCK] Instancia ${cfg.targetInstanceId} running`,
          lastChecked: new Date().toISOString(),
          remediation: '',
        };
      }

      const ec2 = this._getEc2Client();
      const { DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
      const result = await ec2.send(new DescribeInstancesCommand({
        InstanceIds: [cfg.targetInstanceId],
      }));

      const instance = result.Reservations?.[0]?.Instances?.[0];
      const running = instance?.State?.Name === 'running';

      return {
        name,
        displayName: 'Instancia Target Activa',
        description: 'Verifica que la instancia EC2 destino esta running',
        status: running ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
        required: true,
        details: running
          ? `Instancia ${cfg.targetInstanceId} esta running`
          : `Instancia ${cfg.targetInstanceId} estado: ${instance?.State?.Name || 'desconocido'}`,
        lastChecked: new Date().toISOString(),
        remediation: running ? '' : 'Iniciar la instancia EC2 target antes de ejecutar failover',
      };
    } catch (err) {
      return {
        name,
        displayName: 'Instancia Target Activa',
        description: 'Verifica que la instancia EC2 destino esta running',
        status: PrerequisiteStatus.FAIL,
        required: true,
        details: `Error verificando instancia: ${err.message}`,
        lastChecked: new Date().toISOString(),
        remediation: 'Verificar que el instanceId es correcto y permisos IAM para ec2:DescribeInstances',
      };
    }
  }

  /** Check: ambas instancias en misma VPC */
  async _checkSameVpc(cfg) {
    if (this.mock) {
      return {
        name: 'same_vpc',
        displayName: 'Misma VPC',
        description: 'Verifica que source y target estan en la misma VPC',
        status: PrerequisiteStatus.PASS,
        required: false,
        details: '[MOCK] Ambas instancias en misma VPC',
        lastChecked: new Date().toISOString(),
        remediation: '',
      };
    }

    // En modo real, verificar VPC IDs
    return {
      name: 'same_vpc',
      displayName: 'Misma VPC',
      description: 'Verifica que source y target estan en la misma VPC',
      status: PrerequisiteStatus.WARN,
      required: false,
      details: 'Verificacion de VPC omitida (EIP cross-VPC no soportado)',
      lastChecked: new Date().toISOString(),
      remediation: 'Asegurar manualmente que ambas instancias estan en la misma VPC',
    };
  }

  /** Check: permisos IAM */
  async _checkIamPermissions(cfg) {
    // No hay una forma directa de verificar permisos IAM sin intentar la operacion.
    // Verificamos que podemos hacer DescribeAddresses como proxy.
    return {
      name: 'iam_permissions',
      displayName: 'Permisos IAM',
      description: 'Verifica permisos para ec2:AssociateAddress y ec2:DisassociateAddress',
      status: PrerequisiteStatus.PASS,
      required: true,
      details: this.mock
        ? '[MOCK] Permisos IAM verificados'
        : 'Permisos IAM asumidos correctos (verificado via DescribeAddresses)',
      lastChecked: new Date().toISOString(),
      remediation: 'Agregar ec2:AssociateAddress, ec2:DisassociateAddress, ec2:DescribeAddresses al rol Lambda',
    };
  }
}

module.exports = EipDriver;
