'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.4 — Execution Lock (per-SID)
//  Previene ejecucion simultanea de runbooks en el mismo SID.
//  Usa DynamoDB conditional writes con TTL automatico.
//
//  Uso:
//    const { acquireSidLock, releaseSidLock, isSidLocked } = require('./execution-lock');
//    const locked = await acquireSidLock('OMP', 'exec-123', 300);
//    if (!locked) throw new Error('SID ya tiene un runbook en ejecucion');
//    // ... ejecutar runbook ...
//    await releaseSidLock('OMP', 'exec-123');
// ═══════════════════════════════════════════════════════════════

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const LOCKS_TABLE = process.env.LOCKS_TABLE || 'sap-alwaysops-execution-locks';

/**
 * Intenta adquirir un lock para un SID.
 * Usa conditional PutItem para garantizar atomicidad.
 *
 * @param {string} sid - System ID a lockear
 * @param {string} executionId - ID unico de la ejecucion que pide el lock
 * @param {number} ttlSeconds - Tiempo maximo del lock (default: 300s = 5 min)
 * @returns {Promise<boolean>} - true si el lock fue adquirido, false si ya estaba lockeado
 */
async function acquireSidLock(sid, executionId, ttlSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = now + ttlSeconds;

  try {
    await ddbDoc.send(new PutCommand({
      TableName: LOCKS_TABLE,
      Item: {
        PK: `LOCK#${sid}`,
        SK: 'ACTIVE',
        executionId,
        lockedAt: new Date().toISOString(),
        ttl,
      },
      // Solo escribir si:
      // 1. No existe el lock, O
      // 2. El lock existente ya expiro (TTL pasado)
      ConditionExpression: 'attribute_not_exists(PK) OR #ttl < :now',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':now': now },
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return false; // Lock ya existente y no expirado
    }
    throw err; // Error inesperado
  }
}

/**
 * Libera el lock de un SID.
 * Solo libera si el executionId coincide (evita liberar locks ajenos).
 *
 * @param {string} sid - System ID
 * @param {string} executionId - ID de la ejecucion que tiene el lock
 * @returns {Promise<boolean>} - true si se libero, false si no era su lock
 */
async function releaseSidLock(sid, executionId) {
  try {
    await ddbDoc.send(new DeleteCommand({
      TableName: LOCKS_TABLE,
      Key: { PK: `LOCK#${sid}`, SK: 'ACTIVE' },
      ConditionExpression: 'executionId = :execId',
      ExpressionAttributeValues: { ':execId': executionId },
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return false; // No era su lock
    }
    throw err;
  }
}

/**
 * Verifica si un SID esta lockeado.
 *
 * @param {string} sid - System ID
 * @returns {Promise<{locked: boolean, executionId?: string, lockedAt?: string}>}
 */
async function isSidLocked(sid) {
  const result = await ddbDoc.send(new GetCommand({
    TableName: LOCKS_TABLE,
    Key: { PK: `LOCK#${sid}`, SK: 'ACTIVE' },
  }));

  if (!result.Item) {
    return { locked: false };
  }

  // Verificar si el TTL ya paso (DynamoDB puede tardar en limpiar TTL items)
  const now = Math.floor(Date.now() / 1000);
  if (result.Item.ttl && result.Item.ttl < now) {
    return { locked: false }; // Lock expirado
  }

  return {
    locked: true,
    executionId: result.Item.executionId,
    lockedAt: result.Item.lockedAt,
  };
}

module.exports = {
  acquireSidLock,
  releaseSidLock,
  isSidLocked,
};
