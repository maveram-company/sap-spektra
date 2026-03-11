'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.5 — Driver Registry
//  Registro global de drivers HA. Singleton pattern.
// ═══════════════════════════════════════════════════════════════

const { DriverType } = require('../ha-types');

class DriverRegistry {
  constructor() {
    // Map<string, { DriverClass, instance, config }>
    this._drivers = new Map();
  }

  /** Generar key unica para tipo+nombre */
  _key(type, name) {
    return `${type}:${name}`;
  }

  /** Registrar un driver */
  registerDriver(type, name, DriverClass, config = {}) {
    if (!Object.values(DriverType).includes(type)) {
      throw new Error(`Tipo de driver invalido: ${type}. Validos: ${Object.values(DriverType).join(', ')}`);
    }
    const key = this._key(type, name);
    if (this._drivers.has(key)) {
      console.warn(`Driver ${key} ya registrado, reemplazando...`);
    }
    this._drivers.set(key, { DriverClass, instance: null, config });
    console.log(`Driver registrado: ${key} (${DriverClass.name || 'AnonymousClass'})`);
    return this;
  }

  /** Obtener instancia de un driver (lazy initialization) */
  getDriver(type, name) {
    const key = this._key(type, name);
    const entry = this._drivers.get(key);
    if (!entry) {
      throw new Error(`Driver no encontrado: ${key}. Registrados: ${[...this._drivers.keys()].join(', ')}`);
    }
    if (!entry.instance) {
      entry.instance = new entry.DriverClass(entry.config);
    }
    return entry.instance;
  }

  /** Verificar si un driver esta registrado */
  hasDriver(type, name) {
    return this._drivers.has(this._key(type, name));
  }

  /** Listar drivers registrados, opcionalmente por tipo */
  listDrivers(type = null) {
    const results = [];
    for (const [key, entry] of this._drivers.entries()) {
      const [driverType, driverName] = key.split(':');
      if (type && driverType !== type) continue;
      const info = entry.instance ? entry.instance.getInfo() : {
        name: driverName,
        type: driverType,
        version: 'not-instantiated',
      };
      results.push({
        ...info,
        registered: true,
        instantiated: !!entry.instance,
      });
    }
    return results;
  }

  /** Validar que una combinacion de drivers es compatible */
  validateDriverCombination(networkName, dbName, sapName) {
    const issues = [];
    const required = [
      { type: DriverType.NETWORK, name: networkName, label: 'Network' },
      { type: DriverType.DB, name: dbName, label: 'Database' },
      { type: DriverType.SAP, name: sapName, label: 'SAP' },
    ];

    for (const { type, name, label } of required) {
      if (!name) {
        issues.push(`${label} driver no especificado`);
        continue;
      }
      if (!this.hasDriver(type, name)) {
        issues.push(`${label} driver '${name}' no registrado`);
      }
    }

    return {
      compatible: issues.length === 0,
      issues,
      drivers: {
        network: networkName,
        db: dbName,
        sap: sapName,
      },
    };
  }

  /** Remover un driver del registro */
  unregisterDriver(type, name) {
    const key = this._key(type, name);
    const existed = this._drivers.delete(key);
    if (existed) console.log(`Driver desregistrado: ${key}`);
    return existed;
  }

  /** Limpiar todo el registro */
  clear() {
    this._drivers.clear();
  }

  /** Numero de drivers registrados */
  get size() {
    return this._drivers.size;
  }
}

// Singleton
const registry = new DriverRegistry();

module.exports = {
  DriverRegistry,
  registry,
  registerDriver: registry.registerDriver.bind(registry),
  getDriver: registry.getDriver.bind(registry),
  hasDriver: registry.hasDriver.bind(registry),
  listDrivers: registry.listDrivers.bind(registry),
  validateDriverCombination: registry.validateDriverCombination.bind(registry),
};
