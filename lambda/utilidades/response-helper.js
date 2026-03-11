// ============================================================================
//  Avvale SAP AlwaysOps v2.0 — Response Helper
//  Módulo compartido para generar respuestas HTTP consistentes.
//  Incluye CORS, correlation ID, y esquema de error estandarizado.
// ============================================================================

'use strict';

// Origenes permitidos para CORS (expandir en produccion con dominio CloudFront)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3456',
  'http://127.0.0.1:3456',
  'http://127.0.0.1:5173',
];

/**
 * Genera headers CORS seguros.
 * Solo permite origenes en la whitelist (no echo-back de Origin arbitrario).
 *
 * @param {string} [requestOrigin] - Header Origin de la request
 * @param {string} [cloudFrontDomain] - Dominio CloudFront del cliente (opcional)
 * @returns {object} - Headers CORS
 */
function corsHeaders(requestOrigin, cloudFrontDomain) {
  const allowed = [...ALLOWED_ORIGINS];
  if (cloudFrontDomain) {
    allowed.push(`https://${cloudFrontDomain}`);
  }

  const origin = allowed.includes(requestOrigin) ? requestOrigin : allowed[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Correlation-Id',
    'Vary': 'Origin',
  };
}

/**
 * Genera una respuesta HTTP exitosa con headers CORS y correlation ID.
 *
 * @param {number} statusCode - Codigo HTTP (200, 201, 204)
 * @param {object} body - Cuerpo de la respuesta
 * @param {object} [options] - Opciones adicionales
 * @param {string} [options.correlationId] - ID de correlacion para trazabilidad
 * @param {string} [options.requestOrigin] - Header Origin de la request
 * @param {string} [options.cloudFrontDomain] - Dominio CloudFront
 * @returns {object} - Respuesta formateada para API Gateway
 */
function respond(statusCode, body, options = {}) {
  const { correlationId, requestOrigin, cloudFrontDomain } = options;
  const corrId = correlationId || 'none';

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': corrId,
      'X-Sentinel-Version': '2.0',
      ...corsHeaders(requestOrigin, cloudFrontDomain),
    },
    body: JSON.stringify(body),
  };
}

/**
 * Genera una respuesta de error con esquema consistente.
 * Todas las respuestas de error siguen el mismo formato:
 * { errorCode, message, details, correlationId }
 *
 * @param {number} statusCode - Codigo HTTP de error (400, 401, 403, 404, 500)
 * @param {string} message - Mensaje de error legible
 * @param {object} [options] - Opciones adicionales
 * @param {string} [options.errorCode] - Codigo de error especifico (ej: 'INVALID_SID')
 * @param {object} [options.details] - Detalles adicionales del error
 * @param {string} [options.correlationId] - ID de correlacion
 * @param {string} [options.requestOrigin] - Header Origin de la request
 * @param {string} [options.cloudFrontDomain] - Dominio CloudFront
 * @returns {object} - Respuesta de error formateada para API Gateway
 */
function respondError(statusCode, message, options = {}) {
  const { errorCode, details, correlationId, requestOrigin, cloudFrontDomain } = options;
  const corrId = correlationId || 'none';

  const errorBody = {
    errorCode: errorCode || `ERR_${statusCode}`,
    message,
    correlationId: corrId,
  };

  if (details) {
    errorBody.details = details;
  }

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': corrId,
      'X-Sentinel-Version': '2.0',
      ...corsHeaders(requestOrigin, cloudFrontDomain),
    },
    body: JSON.stringify(errorBody),
  };
}

/**
 * Extrae el correlation ID de un evento de API Gateway.
 * Usa requestId de API Gateway como correlation ID.
 *
 * @param {object} event - Evento de API Gateway / Lambda
 * @returns {string} - Correlation ID
 */
function getCorrelationId(event) {
  return (
    event?.headers?.['x-correlation-id'] ||
    event?.requestContext?.requestId ||
    `gen-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  );
}

/**
 * Extrae el Origin de una request para CORS.
 *
 * @param {object} event - Evento de API Gateway / Lambda
 * @returns {string|undefined} - Header Origin
 */
function getRequestOrigin(event) {
  if (!event?.headers) return undefined;
  // API Gateway v2 normaliza headers a lowercase
  return event.headers.origin || event.headers.Origin;
}

module.exports = {
  respond,
  respondError,
  corsHeaders,
  getCorrelationId,
  getRequestOrigin,
  ALLOWED_ORIGINS,
};
