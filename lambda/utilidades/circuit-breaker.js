'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — Circuit Breaker
//  Patron circuit breaker para proteger llamadas a Bedrock y SSM.
//
//  Estados:
//  - CLOSED: todo normal, las llamadas pasan
//  - OPEN: N fallos consecutivos, skip durante M minutos
//  - HALF_OPEN: 1 intento despues del timeout
//
//  Uso:
//    const cb = createCircuitBreaker('bedrock');
//    if (cb.canExecute()) { ... cb.recordSuccess() }
//    else { /* circuito abierto, skip */ }
// ═══════════════════════════════════════════════════════════════

const log = require('./logger')('circuit-breaker');

// Almacen en memoria (por instancia Lambda — se resetea en cold start)
const circuits = {};

const DEFAULT_CONFIG = {
  failureThreshold: 5,     // Fallos consecutivos para abrir
  resetTimeoutMs: 10 * 60 * 1000, // 10 minutos abierto
  halfOpenMaxAttempts: 1,  // Intentos en half-open
};

/**
 * Crea o recupera un circuit breaker para un componente.
 * @param {string} name - Nombre del circuito (ej: 'bedrock', 'ssm')
 * @param {Object} config - Configuracion opcional
 */
function createCircuitBreaker(name, config = {}) {
  if (!circuits[name]) {
    circuits[name] = {
      name,
      state: 'CLOSED',
      failures: 0,
      lastFailureTime: 0,
      halfOpenAttempts: 0,
      config: { ...DEFAULT_CONFIG, ...config },
    };
  }

  const circuit = circuits[name];
  const cfg = circuit.config;

  return {
    /**
     * Verifica si se puede ejecutar la operacion.
     * @returns {boolean}
     */
    canExecute() {
      if (circuit.state === 'CLOSED') return true;

      if (circuit.state === 'OPEN') {
        const elapsed = Date.now() - circuit.lastFailureTime;
        if (elapsed >= cfg.resetTimeoutMs) {
          // Transicion a HALF_OPEN
          circuit.state = 'HALF_OPEN';
          circuit.halfOpenAttempts = 0;
          log.info('State transition OPEN -> HALF_OPEN', { circuit: name, reason: 'timeout cumplido' });
          return true;
        }
        return false;
      }

      if (circuit.state === 'HALF_OPEN') {
        return circuit.halfOpenAttempts < cfg.halfOpenMaxAttempts;
      }

      return false;
    },

    /**
     * Registra una operacion exitosa.
     */
    recordSuccess() {
      if (circuit.state === 'HALF_OPEN') {
        log.info('State transition HALF_OPEN -> CLOSED', { circuit: name, reason: 'exito' });
      }
      circuit.state = 'CLOSED';
      circuit.failures = 0;
      circuit.halfOpenAttempts = 0;
    },

    /**
     * Registra un fallo.
     */
    recordFailure() {
      circuit.failures++;
      circuit.lastFailureTime = Date.now();

      if (circuit.state === 'HALF_OPEN') {
        circuit.state = 'OPEN';
        circuit.halfOpenAttempts++;
        log.info('State transition HALF_OPEN -> OPEN', { circuit: name, reason: 'fallo en half-open' });
        return;
      }

      if (circuit.failures >= cfg.failureThreshold) {
        circuit.state = 'OPEN';
        log.warn('State transition CLOSED -> OPEN', { circuit: name, failures: circuit.failures });
      }
    },

    /**
     * Devuelve el estado actual del circuito.
     */
    getState() {
      return {
        name: circuit.name,
        state: circuit.state,
        failures: circuit.failures,
        lastFailureTime: circuit.lastFailureTime
          ? new Date(circuit.lastFailureTime).toISOString()
          : null,
      };
    },

    /**
     * Resetea el circuito manualmente.
     */
    reset() {
      circuit.state = 'CLOSED';
      circuit.failures = 0;
      circuit.halfOpenAttempts = 0;
      log.info('Circuit RESET manual', { circuit: name });
    },
  };
}

/**
 * Devuelve el estado de todos los circuit breakers activos.
 */
function getAllCircuitStates() {
  return Object.keys(circuits).map(name => {
    const c = circuits[name];
    return {
      name: c.name,
      state: c.state,
      failures: c.failures,
      lastFailureTime: c.lastFailureTime
        ? new Date(c.lastFailureTime).toISOString()
        : null,
    };
  });
}

module.exports = { createCircuitBreaker, getAllCircuitStates };
