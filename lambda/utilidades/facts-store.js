'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.4 — Facts Store Versionado
//  Almacen inmutable de hechos sobre los sistemas SAP.
//  Discovery, collectors y runbooks escriben facts aqui.
//  Runbooks y simulaciones SOLO consumen facts del store.
//  Si faltan facts: devolver missingFacts[] y no ejecutar.
// ═══════════════════════════════════════════════════════════════

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const FACTS_TABLE = process.env.FACTS_TABLE || 'sap-alwaysops-facts-store';

// Categorias de facts
const FACT_CATEGORIES = Object.freeze({
  DISCOVERY: 'DISCOVERY',
  METRICS: 'METRICS',
  RUNBOOK_RESULT: 'RUNBOOK_RESULT',
  CAPABILITIES: 'CAPABILITIES',
  HA_STATE: 'HA_STATE',
});

/**
 * Almacena un fact versionado. Cada fact es inmutable (se versiona por timestamp).
 *
 * @param {string} sid - System ID
 * @param {string} host - Hostname o instance ID
 * @param {string} category - Categoria del fact (ver FACT_CATEGORIES)
 * @param {object} data - Datos del fact
 * @returns {Promise<object>} - El fact almacenado
 */
async function storeFact(sid, host, category, data) {
  const timestamp = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 dias

  const fact = {
    PK: `FACTS#${sid}`,
    SK: `${host}#${category}#${timestamp}`,
    sid,
    host,
    category,
    data,
    timestamp,
    ttl,
  };

  // Guardar el fact versionado
  await ddbDoc.send(new PutCommand({
    TableName: FACTS_TABLE,
    Item: fact,
  }));

  // Actualizar el "latest" pointer para acceso rapido
  await ddbDoc.send(new PutCommand({
    TableName: FACTS_TABLE,
    Item: {
      PK: `FACTS#${sid}`,
      SK: `${host}#${category}#LATEST`,
      sid,
      host,
      category,
      data,
      timestamp,
      ttl,
    },
  }));

  return fact;
}

/**
 * Obtiene el fact mas reciente de una categoria para un SID/host.
 *
 * @param {string} sid - System ID
 * @param {string} host - Hostname o instance ID
 * @param {string} category - Categoria del fact
 * @returns {Promise<object|null>} - El fact mas reciente o null
 */
async function getLatestFact(sid, host, category) {
  const result = await ddbDoc.send(new GetCommand({
    TableName: FACTS_TABLE,
    Key: {
      PK: `FACTS#${sid}`,
      SK: `${host}#${category}#LATEST`,
    },
  }));

  return result.Item || null;
}

/**
 * Obtiene el historial de facts de una categoria.
 *
 * @param {string} sid - System ID
 * @param {string} host - Hostname o instance ID
 * @param {string} category - Categoria del fact
 * @param {number} limit - Maximo de resultados (default: 10)
 * @returns {Promise<object[]>} - Lista de facts ordenados por timestamp desc
 */
async function getFactHistory(sid, host, category, limit = 10) {
  const result = await ddbDoc.send(new QueryCommand({
    TableName: FACTS_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `FACTS#${sid}`,
      ':prefix': `${host}#${category}#`,
    },
    ScanIndexForward: false, // Mas reciente primero
    Limit: limit,
  }));

  // Filtrar el LATEST pointer
  return (result.Items || []).filter(item => !item.SK.endsWith('#LATEST'));
}

/**
 * Verifica que existan todos los facts requeridos para una operacion.
 * Si faltan facts, retorna la lista de faltantes.
 *
 * @param {string} sid - System ID
 * @param {string} host - Hostname o instance ID
 * @param {string[]} requiredCategories - Categorias requeridas
 * @returns {Promise<{complete: boolean, missingFacts: string[]}>}
 */
async function checkRequiredFacts(sid, host, requiredCategories) {
  const missingFacts = [];

  for (const category of requiredCategories) {
    const fact = await getLatestFact(sid, host, category);
    if (!fact) {
      missingFacts.push(category);
    }
  }

  return {
    complete: missingFacts.length === 0,
    missingFacts,
  };
}

module.exports = {
  FACT_CATEGORIES,
  storeFact,
  getLatestFact,
  getFactHistory,
  checkRequiredFacts,
};
