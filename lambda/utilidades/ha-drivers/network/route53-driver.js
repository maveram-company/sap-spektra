'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.5 — Route53 Network Driver
//  Maneja failover de red mediante actualizacion de DNS en Route53.
//  Soporta modo real (AWS Route53 API) y modo mock.
// ═══════════════════════════════════════════════════════════════

const BaseHaDriver = require('../base-driver');
const { PrerequisiteStatus, DriverType } = require('../../ha-types');

class Route53Driver extends BaseHaDriver {
  /**
   * @param {Object} config
   * @param {string} config.hostedZoneId - ID de la hosted zone (Z1234...)
   * @param {string} config.recordName - Nombre del record DNS (e.g., 'sap-prd.example.com')
   * @param {string} config.recordType - Tipo de record (A, CNAME, etc.)
   * @param {number} config.ttl - TTL del record en segundos (default: 60)
   * @param {string} config.sourceIp - IP del nodo primario
   * @param {string} config.targetIp - IP del nodo secundario
   * @param {string} config.healthCheckId - ID del health check de Route53 (opcional)
   * @param {boolean} config.mock - Si es true, simular
   */
  constructor(config = {}) {
    super('route53', DriverType.NETWORK, '1.0.0');
    this.config = config;
    this.mock = config.mock || process.env.MOCK === 'true';
    this._r53Client = null;
  }

  /** Obtener cliente Route53 (lazy init) */
  _getRoute53Client() {
    if (!this._r53Client && !this.mock) {
      const { Route53Client } = require('@aws-sdk/client-route-53');
      this._r53Client = new Route53Client({});
    }
    return this._r53Client;
  }

  /** Validar configuracion */
  async validateConfig(config) {
    const c = config || this.config;
    const errors = [];

    if (!c.hostedZoneId) errors.push('hostedZoneId es requerido');
    if (!c.recordName) errors.push('recordName es requerido');
    if (!c.recordType) errors.push('recordType es requerido (A, CNAME, etc.)');
    if (!c.targetIp && !c.targetHostname) errors.push('targetIp o targetHostname es requerido');

    return { valid: errors.length === 0, errors, config: c };
  }

  /** Verificar prerequisitos */
  async checkPrerequisites(context) {
    const checks = [];
    const cfg = { ...this.config, ...context };

    // Check 1: Hosted zone existe
    checks.push(await this._checkHostedZone(cfg));

    // Check 2: Record existe
    checks.push(await this._checkRecordExists(cfg));

    // Check 3: TTL apropiado
    checks.push(this._checkTtl(cfg));

    return checks;
  }

  /** Ejecutar switch DNS: UPSERT record apuntando al nuevo IP/hostname */
  async executeStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const hostedZoneId = cfg.hostedZoneId;
    const recordName = cfg.recordName;
    const recordType = cfg.recordType || 'A';
    const ttl = cfg.ttl || 60;
    const targetValue = cfg.targetNode?.ip || cfg.targetIp || cfg.targetHostname;

    this.log('info', 'Iniciando switch DNS en Route53', {
      hostedZoneId, recordName, recordType, targetValue,
    });

    if (this.mock) {
      return this._mockExecute(cfg, targetValue);
    }

    const r53 = this._getRoute53Client();
    const { ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');

    // Capturar valor actual antes del cambio
    const currentValue = await this._getCurrentRecordValue(cfg);

    // UPSERT del record
    const changeResult = await this.withRetry(async () => {
      return r53.send(new ChangeResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Comment: `SAP Spektra HA Failover - ${new Date().toISOString()}`,
          Changes: [{
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: recordName,
              Type: recordType,
              TTL: ttl,
              ResourceRecords: [{ Value: targetValue }],
            },
          }],
        },
      }));
    }, 3, 3000, 'Route53 UPSERT');

    const changeId = changeResult.ChangeInfo?.Id;

    this.createEvidenceEntry('dns_record_updated', {
      hostedZoneId,
      recordName,
      recordType,
      previousValue: currentValue,
      newValue: targetValue,
      ttl,
      changeId,
    });

    // Esperar propagacion (opcional, basado en TTL)
    this.log('info', 'Switch DNS completado, esperando propagacion', {
      changeId,
      estimatedPropagation: `${ttl}s`,
    });

    return {
      success: true,
      hostedZoneId,
      recordName,
      recordType,
      previousValue: currentValue,
      newValue: targetValue,
      ttl,
      changeId,
    };
  }

  /** Rollback: revertir record DNS al valor original */
  async rollbackStep(step, context) {
    const cfg = { ...this.config, ...step.config };
    const sourceValue = cfg.sourceNode?.ip || cfg.sourceIp || cfg.sourceHostname;

    this.log('warn', 'Iniciando rollback DNS en Route53', {
      recordName: cfg.recordName,
      revertTo: sourceValue,
    });

    if (this.mock) {
      return this._mockExecute(cfg, sourceValue);
    }

    const r53 = this._getRoute53Client();
    const { ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');

    const changeResult = await r53.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: cfg.hostedZoneId,
      ChangeBatch: {
        Comment: `SAP Spektra HA Rollback - ${new Date().toISOString()}`,
        Changes: [{
          Action: 'UPSERT',
          ResourceRecordSet: {
            Name: cfg.recordName,
            Type: cfg.recordType || 'A',
            TTL: cfg.ttl || 60,
            ResourceRecords: [{ Value: sourceValue }],
          },
        }],
      },
    }));

    this.createEvidenceEntry('dns_rollback_completed', {
      recordName: cfg.recordName,
      restoredTo: sourceValue,
      changeId: changeResult.ChangeInfo?.Id,
    });

    return {
      success: true,
      rolledBackTo: sourceValue,
      changeId: changeResult.ChangeInfo?.Id,
    };
  }

  /** Health check: verificar que el record DNS apunta a la instancia correcta */
  async healthCheck(context) {
    const cfg = { ...this.config, ...context };

    if (this.mock) {
      return { healthy: true, mock: true, timestamp: new Date().toISOString() };
    }

    const currentValue = await this._getCurrentRecordValue(cfg);
    const expectedValue = cfg.targetIp || cfg.targetHostname;

    return {
      healthy: currentValue === expectedValue,
      recordName: cfg.recordName,
      currentValue,
      expectedValue,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Metodos internos ───

  _mockExecute(cfg, targetValue) {
    this.log('info', '[MOCK] Switch DNS simulado', {
      recordName: cfg.recordName,
      targetValue,
    });
    this.createEvidenceEntry('mock_dns_switch', {
      recordName: cfg.recordName,
      targetValue,
    });

    return {
      success: true,
      mock: true,
      recordName: cfg.recordName,
      newValue: targetValue,
      changeId: `mock-change-${Date.now()}`,
    };
  }

  /** Obtener valor actual del record DNS */
  async _getCurrentRecordValue(cfg) {
    if (this.mock) return cfg.sourceIp || '10.0.1.10';

    try {
      const r53 = this._getRoute53Client();
      const { ListResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');

      const result = await r53.send(new ListResourceRecordSetsCommand({
        HostedZoneId: cfg.hostedZoneId,
        StartRecordName: cfg.recordName,
        StartRecordType: cfg.recordType || 'A',
        MaxItems: 1,
      }));

      const record = result.ResourceRecordSets?.[0];
      if (record && record.Name === cfg.recordName + '.' && record.Type === (cfg.recordType || 'A')) {
        return record.ResourceRecords?.[0]?.Value || null;
      }
      return null;
    } catch (err) {
      this.log('warn', 'No se pudo obtener valor actual del record DNS', { error: err.message });
      return null;
    }
  }

  async _checkHostedZone(cfg) {
    const name = 'hosted_zone_exists';
    if (this.mock) {
      return {
        name, displayName: 'Hosted Zone Existe',
        description: 'Verifica que la hosted zone de Route53 existe',
        status: PrerequisiteStatus.PASS, required: true,
        details: `[MOCK] Hosted zone ${cfg.hostedZoneId} encontrada`,
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    try {
      const r53 = this._getRoute53Client();
      const { GetHostedZoneCommand } = require('@aws-sdk/client-route-53');
      const result = await r53.send(new GetHostedZoneCommand({ Id: cfg.hostedZoneId }));
      return {
        name, displayName: 'Hosted Zone Existe',
        description: 'Verifica que la hosted zone de Route53 existe',
        status: PrerequisiteStatus.PASS, required: true,
        details: `Hosted zone ${result.HostedZone?.Name} encontrada`,
        lastChecked: new Date().toISOString(), remediation: '',
      };
    } catch (err) {
      return {
        name, displayName: 'Hosted Zone Existe',
        description: 'Verifica que la hosted zone de Route53 existe',
        status: PrerequisiteStatus.FAIL, required: true,
        details: `Error: ${err.message}`,
        lastChecked: new Date().toISOString(),
        remediation: 'Verificar hostedZoneId y permisos IAM para route53:GetHostedZone',
      };
    }
  }

  async _checkRecordExists(cfg) {
    const name = 'dns_record_exists';
    if (this.mock) {
      return {
        name, displayName: 'Record DNS Existe',
        description: 'Verifica que el record DNS existe en la hosted zone',
        status: PrerequisiteStatus.PASS, required: true,
        details: `[MOCK] Record ${cfg.recordName} encontrado`,
        lastChecked: new Date().toISOString(), remediation: '',
      };
    }

    const value = await this._getCurrentRecordValue(cfg);
    return {
      name, displayName: 'Record DNS Existe',
      description: 'Verifica que el record DNS existe en la hosted zone',
      status: value ? PrerequisiteStatus.PASS : PrerequisiteStatus.WARN,
      required: false, // UPSERT crea si no existe
      details: value ? `Record ${cfg.recordName} valor actual: ${value}` : `Record ${cfg.recordName} no encontrado (sera creado)`,
      lastChecked: new Date().toISOString(),
      remediation: value ? '' : 'El record sera creado automaticamente con UPSERT',
    };
  }

  _checkTtl(cfg) {
    const ttl = cfg.ttl || 60;
    const optimal = ttl <= 60;
    return {
      name: 'ttl_appropriate',
      displayName: 'TTL Apropiado',
      description: 'Verifica que el TTL del record es bajo para failover rapido',
      status: optimal ? PrerequisiteStatus.PASS : PrerequisiteStatus.WARN,
      required: false,
      details: `TTL configurado: ${ttl}s ${optimal ? '(optimo para failover)' : '(considerar reducir a 60s)'}`,
      lastChecked: new Date().toISOString(),
      remediation: optimal ? '' : 'Reducir TTL a 60s o menos antes del failover para minimizar tiempo de propagacion',
    };
  }
}

module.exports = Route53Driver;
