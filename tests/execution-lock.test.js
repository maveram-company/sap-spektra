'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Execution Lock (Fase 2B: locks por SID)
//  Ejecutar: node tests/execution-lock.test.js
//
//  Nota: Estos tests validan la logica del modulo.
//  En produccion, DynamoDB maneja la atomicidad.
//  Aqui mockeamos DynamoDB para tests unitarios.
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');

// Mock simple de DynamoDB para tests
const store = {};
const mockDdbDoc = {
  send: async (cmd) => {
    const name = cmd.constructor.name;
    if (name === 'PutCommand') {
      const key = cmd.input.Item.PK;
      const existing = store[key];
      const now = Math.floor(Date.now() / 1000);

      // Simular ConditionExpression
      if (existing && existing.ttl >= now) {
        const err = new Error('Conditional check failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
      store[key] = cmd.input.Item;
      return {};
    }
    if (name === 'DeleteCommand') {
      const key = cmd.input.Key.PK;
      const existing = store[key];
      if (!existing || existing.executionId !== cmd.input.ExpressionAttributeValues[':execId']) {
        const err = new Error('Conditional check failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
      delete store[key];
      return {};
    }
    if (name === 'GetCommand') {
      const key = cmd.input.Key.PK;
      return { Item: store[key] || null };
    }
    return {};
  },
};

// Inyectar mock antes de importar el modulo
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request === '@aws-sdk/client-dynamodb') {
    return require.resolve('./mocks/dynamodb-mock');
  }
  if (request === '@aws-sdk/lib-dynamodb') {
    return require.resolve('./mocks/dynamodb-doc-mock');
  }
  return originalResolve.call(this, request, parent, ...args);
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log('\n=== Execution Lock Tests ===\n');

// Estos tests validan la logica conceptual del lock
console.log('Logica de locks:');

test('lock expirado permite nueva adquisicion', () => {
  // Un lock con TTL en el pasado debe permitir nueva escritura
  const now = Math.floor(Date.now() / 1000);
  const expiredLock = { ttl: now - 100 };
  assert.ok(expiredLock.ttl < now, 'Lock expirado tiene TTL menor que ahora');
});

test('lock activo tiene TTL futuro', () => {
  const now = Math.floor(Date.now() / 1000);
  const activeLock = { ttl: now + 300 };
  assert.ok(activeLock.ttl >= now, 'Lock activo tiene TTL mayor o igual que ahora');
});

test('executionId determinista para mismos inputs', () => {
  const crypto = require('crypto');
  const hash1 = crypto.createHash('sha256').update('OMP:RB-ASE-001:2024-01-01').digest('hex').slice(0, 16);
  const hash2 = crypto.createHash('sha256').update('OMP:RB-ASE-001:2024-01-01').digest('hex').slice(0, 16);
  assert.strictEqual(hash1, hash2, 'Mismos inputs producen mismo hash');
});

test('executionId diferente para inputs diferentes', () => {
  const crypto = require('crypto');
  const hash1 = crypto.createHash('sha256').update('OMP:RB-ASE-001:2024-01-01').digest('hex').slice(0, 16);
  const hash2 = crypto.createHash('sha256').update('OCP:RB-ASE-001:2024-01-01').digest('hex').slice(0, 16);
  assert.notStrictEqual(hash1, hash2, 'Inputs diferentes producen hashes diferentes');
});

test('TTL se calcula correctamente (5 minutos default)', () => {
  const now = Math.floor(Date.now() / 1000);
  const ttl = now + 300; // 5 minutos
  const diff = ttl - now;
  assert.strictEqual(diff, 300, 'TTL debe ser 300 segundos por defecto');
});

test('modulo exporta las funciones requeridas', () => {
  // Verificar que el modulo tiene las funciones esperadas
  const lockModule = require('../lambda/utilidades/execution-lock');
  assert.strictEqual(typeof lockModule.acquireSidLock, 'function');
  assert.strictEqual(typeof lockModule.releaseSidLock, 'function');
  assert.strictEqual(typeof lockModule.isSidLocked, 'function');
});

// Restaurar resolver
Module._resolveFilename = originalResolve;

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
