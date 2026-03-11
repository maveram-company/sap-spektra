'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — Token Tracker
//  Registra el consumo de tokens de Bedrock por invocacion.
//
//  Funciones:
//  - trackTokens(): Registra tokens input/output en DynamoDB
//  - getDailyUsage(): Consulta uso acumulado del dia
//  - checkDailyLimit(): Verifica si se excedio el limite diario
// ═══════════════════════════════════════════════════════════════

const log = require('./logger')('token-tracker');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ADVISOR_RESULTS_TABLE = process.env.ADVISOR_RESULTS_TABLE || 'sap-alwaysops-advisor-results';

/**
 * Registra tokens consumidos por una invocacion de Bedrock.
 * Almacena en la tabla advisor-results con PK TOKEN_USAGE#{date}.
 */
async function trackTokens(useCase, inputTokens, outputTokens, modelId) {
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 3600; // 90 dias

  try {
    // Registro individual
    await ddbDoc.send(new PutCommand({
      TableName: ADVISOR_RESULTS_TABLE,
      Item: {
        pk: `TOKEN_USAGE#${dateKey}`,
        sk: `${now.toISOString()}#${useCase}`,
        useCase,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        totalTokens: (inputTokens || 0) + (outputTokens || 0),
        modelId: modelId || 'unknown',
        timestamp: now.toISOString(),
        ttl,
      },
    }));

    // Actualizar acumulado diario
    await ddbDoc.send(new UpdateCommand({
      TableName: ADVISOR_RESULTS_TABLE,
      Key: {
        pk: `TOKEN_DAILY#${dateKey}`,
        sk: 'TOTAL',
      },
      UpdateExpression: 'ADD totalInputTokens :inp, totalOutputTokens :out, totalTokens :total, invocationCount :one SET #ttl = :ttl',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':inp': inputTokens || 0,
        ':out': outputTokens || 0,
        ':total': (inputTokens || 0) + (outputTokens || 0),
        ':one': 1,
        ':ttl': ttl,
      },
    }));
  } catch (err) {
    // No lanzar error — el tracking no debe romper la logica principal
    log.warn('Error registrando tokens', { error: err.message });
  }
}

/**
 * Obtiene el uso acumulado de tokens del dia actual.
 */
async function getDailyUsage(date) {
  const dateKey = date || new Date().toISOString().split('T')[0];

  try {
    const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
    const result = await ddbDoc.send(new GetCommand({
      TableName: ADVISOR_RESULTS_TABLE,
      Key: {
        pk: `TOKEN_DAILY#${dateKey}`,
        sk: 'TOTAL',
      },
    }));

    return result.Item || {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      invocationCount: 0,
    };
  } catch (err) {
    log.warn('Error consultando uso diario', { error: err.message });
    return { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, invocationCount: 0 };
  }
}

/**
 * Verifica si se excedio el limite diario de tokens.
 * @param {number} dailyLimit - Limite de tokens diarios
 * @returns {Object} { allowed, usage, limit, remaining }
 */
async function checkDailyLimit(dailyLimit) {
  const limit = dailyLimit || 100000;
  const usage = await getDailyUsage();
  const remaining = Math.max(0, limit - (usage.totalTokens || 0));

  return {
    allowed: remaining > 0,
    usage: usage.totalTokens || 0,
    limit,
    remaining,
    invocations: usage.invocationCount || 0,
  };
}

module.exports = { trackTokens, getDailyUsage, checkDailyLimit };
