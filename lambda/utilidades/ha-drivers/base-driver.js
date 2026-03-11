'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.5 — Base HA Driver
//  Clase base abstracta para todos los drivers de HA.
//  Implementa funcionalidad comun: logging, evidence, timeout, retry.
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');
const { StepStatus } = require('../ha-types');

class BaseHaDriver {
  /**
   * @param {string} name - Nombre unico del driver (e.g., 'eip', 'route53')
   * @param {string} type - Tipo de driver: NETWORK|DB|SAP
   * @param {string} version - Version del driver
   */
  constructor(name, type, version) {
    if (new.target === BaseHaDriver) {
      throw new Error('BaseHaDriver es abstracto y no puede instanciarse directamente');
    }
    this.name = name;
    this.type = type;
    this.version = version || '1.0.0';
    this._evidence = [];
    this._logs = [];
  }

  // ─── Metodos abstractos (deben implementarse en subclases) ───

  async validateConfig(config) {
    throw new Error(`${this.name}: validateConfig() no implementado`);
  }

  async checkPrerequisites(context) {
    throw new Error(`${this.name}: checkPrerequisites() no implementado`);
  }

  async executeStep(step, context) {
    throw new Error(`${this.name}: executeStep() no implementado`);
  }

  async rollbackStep(step, context) {
    throw new Error(`${this.name}: rollbackStep() no implementado`);
  }

  async healthCheck(context) {
    throw new Error(`${this.name}: healthCheck() no implementado`);
  }

  // ─── Metodos comunes implementados ───

  /** Logging estructurado */
  log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      driver: this.name,
      type: this.type,
      level,
      message,
      ...data,
    };
    this._logs.push(entry);
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logFn(JSON.stringify(entry));
    return entry;
  }

  /** Crear entrada de evidencia para audit trail */
  createEvidenceEntry(action, result, metadata = {}) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      driver: this.name,
      driverType: this.type,
      action,
      result: typeof result === 'object' ? result : { value: result },
      ...metadata,
      previousHash: this._evidence.length > 0
        ? this._evidence[this._evidence.length - 1].hash
        : null,
    };
    // Hash chain para integridad
    entry.hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ ...entry, hash: undefined }))
      .digest('hex');
    this._evidence.push(entry);
    return entry;
  }

  /** Obtener toda la evidencia recopilada */
  getEvidence() {
    return [...this._evidence];
  }

  /** Obtener todos los logs */
  getLogs() {
    return [...this._logs];
  }

  /** Limpiar evidencia y logs (para nueva operacion) */
  reset() {
    this._evidence = [];
    this._logs = [];
  }

  /** Ejecutar una promesa con timeout */
  async withTimeout(promise, ms, operationName = 'operation') {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timeout: ${operationName} excedio ${ms}ms`));
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /** Ejecutar una funcion con reintentos y backoff exponencial */
  async withRetry(fn, maxRetries = 3, baseBackoffMs = 1000, operationName = 'operation') {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        this.log('warn', `Intento ${attempt}/${maxRetries} fallido para ${operationName}`, {
          error: err.message,
          attempt,
          maxRetries,
        });
        if (attempt < maxRetries) {
          const delay = baseBackoffMs * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`${operationName} fallo despues de ${maxRetries} intentos: ${lastError.message}`);
  }

  /** Informacion del driver */
  getInfo() {
    return {
      name: this.name,
      type: this.type,
      version: this.version,
      evidenceCount: this._evidence.length,
      logCount: this._logs.length,
    };
  }
}

module.exports = BaseHaDriver;
