'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v2.0 — Pagination Helper
//  Paginación cursor-based para DynamoDB queries.
//
//  Uso:
//    const { parsePaginationParams, buildPaginatedResponse, applyPagination } = require('../utilidades/pagination-helper');
//    const { limit, exclusiveStartKey } = parsePaginationParams(event);
//    // ... add Limit and ExclusiveStartKey to your DDB query
//    const response = buildPaginatedResponse(items, result.LastEvaluatedKey, limit);
// ═══════════════════════════════════════════════════════════════

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Parsea parámetros de paginación desde el evento API Gateway.
 * @param {Object} event - Evento Lambda (API Gateway)
 * @returns {{ limit: number, exclusiveStartKey: Object|null, cursor: string|null }}
 */
function parsePaginationParams(event) {
  const qs = event.queryStringParameters || {};

  // Parsear limit
  let limit = parseInt(qs.limit, 10);
  if (isNaN(limit) || limit < 1) limit = DEFAULT_PAGE_SIZE;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  // Parsear cursor (base64-encoded LastEvaluatedKey)
  let exclusiveStartKey = null;
  const cursor = qs.cursor || null;

  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      exclusiveStartKey = JSON.parse(decoded);
    } catch (err) {
      // Cursor inválido — ignorar silenciosamente, empezar desde el inicio
      exclusiveStartKey = null;
    }
  }

  return { limit, exclusiveStartKey, cursor };
}

/**
 * Construye respuesta paginada a partir de resultados de DynamoDB.
 * @param {Array} items - Items retornados por DynamoDB
 * @param {Object|null} lastEvaluatedKey - DynamoDB LastEvaluatedKey
 * @param {number} limit - Tamaño de página usado
 * @returns {{ items: Array, count: number, limit: number, nextCursor: string|null }}
 */
function buildPaginatedResponse(items, lastEvaluatedKey, limit) {
  let nextCursor = null;

  if (lastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
  }

  return {
    items: items || [],
    count: (items || []).length,
    limit,
    nextCursor,
    hasMore: !!nextCursor,
  };
}

/**
 * Aplica parámetros de paginación a un DynamoDB command input.
 * Modifica el input in-place agregando Limit y ExclusiveStartKey.
 * @param {Object} commandInput - Input para QueryCommand o ScanCommand
 * @param {Object} paginationParams - Output de parsePaginationParams
 * @returns {Object} El mismo commandInput modificado
 */
function applyPagination(commandInput, paginationParams) {
  commandInput.Limit = paginationParams.limit;

  if (paginationParams.exclusiveStartKey) {
    commandInput.ExclusiveStartKey = paginationParams.exclusiveStartKey;
  }

  return commandInput;
}

module.exports = {
  parsePaginationParams,
  buildPaginatedResponse,
  applyPagination,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
};
