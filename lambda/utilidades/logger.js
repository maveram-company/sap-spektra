'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v2.0 — Structured Logger
//  Logger JSON estructurado para todas las Lambdas.
//  Emite logs en formato JSON para CloudWatch Logs Insights.
//
//  Uso:
//    const log = require('../utilidades/logger')('mi-componente');
//    log.initFromEvent(event);  // extrae correlationId + requestId
//    log.info('Mensaje', { systemId: 'SAP-PRD-01', metric: 42 });
//    log.error('Fallo', { error: err.message });
//
//  Propagacion Lambda-to-Lambda:
//    const payload = { ...body, _correlationId: log.getCorrelationId() };
//    lambda.invoke({ Payload: JSON.stringify(payload) });
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'] || 20;
const SERVICE_NAME = process.env.SERVICE_NAME || 'sap-alwaysops';
const VERSION = process.env.SENTINEL_VERSION || '2.0';

/**
 * Genera un correlationId unico (prefijo 'cid-' + 12 hex chars)
 */
function generateCorrelationId() {
  return 'cid-' + crypto.randomBytes(6).toString('hex');
}

/**
 * Extrae el correlationId de un evento Lambda.
 * Busca en: headers, queryStringParameters, body._correlationId, requestContext
 * Si no encuentra, genera uno nuevo.
 */
function extractCorrelationId(event) {
  if (!event) return generateCorrelationId();

  // 1. Header X-Correlation-Id (API Gateway / ALB)
  const headers = event.headers || {};
  const headerCid = headers['x-correlation-id'] || headers['X-Correlation-Id'];
  if (headerCid) return headerCid;

  // 2. Body._correlationId (Lambda-to-Lambda invocation)
  if (event._correlationId) return event._correlationId;
  if (event.body) {
    try {
      const parsed = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (parsed && parsed._correlationId) return parsed._correlationId;
    } catch (_) { /* body no es JSON, ignorar */ }
  }

  // 3. requestContext.requestId (API Gateway auto-generated)
  if (event.requestContext && event.requestContext.requestId) {
    return event.requestContext.requestId;
  }

  // 4. Generar nuevo
  return generateCorrelationId();
}

/**
 * Crea un logger estructurado para un componente Lambda.
 * @param {string} component — Nombre del Lambda o modulo
 * @returns {Object} Logger con metodos debug, info, warn, error, metric, initFromEvent
 */
function createLogger(component) {
  let _requestId = '';
  let _correlationId = '';
  let _systemId = '';

  function emit(level, message, data = {}) {
    if (LEVELS[level] < MIN_LEVEL) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: SERVICE_NAME,
      version: VERSION,
      component,
      correlationId: _correlationId || undefined,
      requestId: _requestId || undefined,
      systemId: _systemId || data.systemId || undefined,
      message,
      ...data,
    };

    // No duplicar systemId si ya viene en data
    if (data.systemId && _systemId) delete entry.systemId;
    if (data.systemId) entry.systemId = data.systemId;
    else if (_systemId) entry.systemId = _systemId;

    // Eliminar campos undefined para logs mas limpios
    Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);

    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    /**
     * Inicializar logger desde un evento Lambda.
     * Extrae correlationId, requestId y opcionalmente systemId.
     * LLAMAR al inicio de cada handler.
     * @param {Object} event — Evento Lambda
     * @param {Object} [context] — Contexto Lambda (opcional, para awsRequestId)
     */
    initFromEvent(event, context) {
      _correlationId = extractCorrelationId(event);
      _requestId = (context && context.awsRequestId)
        || (event && event.requestContext && event.requestContext.requestId)
        || '';
      // Extraer systemId si esta disponible en el evento
      if (event && event.pathParameters && event.pathParameters.systemId) {
        _systemId = event.pathParameters.systemId;
      } else if (event && event.systemId) {
        _systemId = event.systemId;
      }
      emit('debug', 'Logger inicializado', {
        correlationId: _correlationId,
        requestId: _requestId,
      });
    },

    /** Establecer el requestId para esta invocacion (backward compatible) */
    setRequestId(id) { _requestId = id; },

    /** Establecer correlationId manualmente */
    setCorrelationId(id) { _correlationId = id; },

    /** Establecer systemId para contextualizar logs */
    setSystemId(id) { _systemId = id; },

    /** Obtener correlationId actual (para propagar a Lambda-to-Lambda) */
    getCorrelationId() { return _correlationId; },

    /** Obtener requestId actual */
    getRequestId() { return _requestId; },

    debug(msg, data) { emit('debug', msg, data); },
    info(msg, data) { emit('info', msg, data); },
    warn(msg, data) { emit('warn', msg, data); },
    error(msg, data) { emit('error', msg, data); },

    /**
     * Emitir metrica custom (para CloudWatch Embedded Metric Format)
     * @param {string} metricName — Nombre de la metrica
     * @param {number} value — Valor numerico
     * @param {string} unit — Unidad (Count, Milliseconds, Bytes, etc.)
     * @param {Object} dimensions — Dimensiones adicionales
     */
    metric(metricName, value, unit = 'Count', dimensions = {}) {
      const entry = {
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [{
            Namespace: 'SAPAlwaysOps/Operations',
            Dimensions: [Object.keys(dimensions)],
            Metrics: [{ Name: metricName, Unit: unit }],
          }],
        },
        ...dimensions,
        [metricName]: value,
        component,
        correlationId: _correlationId || undefined,
        requestId: _requestId || undefined,
      };
      Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);
      console.log(JSON.stringify(entry));
    },

    /**
     * Wrapper para medir duracion de una operacion async
     * @param {string} operationName — Nombre de la operacion
     * @param {Function} fn — Funcion async a ejecutar
     * @returns {*} Resultado de fn
     */
    async timed(operationName, fn) {
      const start = Date.now();
      try {
        const result = await fn();
        const duration = Date.now() - start;
        emit('info', `${operationName} completado`, { durationMs: duration, operation: operationName });
        return result;
      } catch (err) {
        const duration = Date.now() - start;
        emit('error', `${operationName} fallido`, { durationMs: duration, operation: operationName, error: err.message, stack: err.stack });
        throw err;
      }
    },

    /**
     * Crear un child logger con contexto adicional fijo
     * Util para sub-operaciones que comparten contexto
     * @param {Object} extraContext — Campos extra para cada log
     * @returns {Object} Logger con el mismo correlationId y contexto extra
     */
    child(extraContext = {}) {
      const childLog = createLogger(component);
      childLog.setRequestId(_requestId);
      childLog.setCorrelationId(_correlationId);
      childLog.setSystemId(_systemId);
      // Wrap emit para incluir extra context
      const origDebug = childLog.debug.bind(childLog);
      const origInfo = childLog.info.bind(childLog);
      const origWarn = childLog.warn.bind(childLog);
      const origError = childLog.error.bind(childLog);
      childLog.debug = (msg, data) => origDebug(msg, { ...extraContext, ...data });
      childLog.info = (msg, data) => origInfo(msg, { ...extraContext, ...data });
      childLog.warn = (msg, data) => origWarn(msg, { ...extraContext, ...data });
      childLog.error = (msg, data) => origError(msg, { ...extraContext, ...data });
      return childLog;
    },
  };
}

// Exportar funcion principal y helpers utiles
createLogger.extractCorrelationId = extractCorrelationId;
createLogger.generateCorrelationId = generateCorrelationId;

module.exports = createLogger;
