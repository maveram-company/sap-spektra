'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Policy Engine (Fase 3E)
//  Ejecutar: node tests/policy-engine.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');

// Mock SSM antes de importar el modulo
const Module = require('module');
const originalResolve = Module._resolveFilename;

// Mock para @aws-sdk/client-ssm
const ssmMockModule = require.resolve('./mocks/ssm-mock');

Module._resolveFilename = function (request, parent, ...args) {
  if (request === '@aws-sdk/client-ssm') return ssmMockModule;
  return originalResolve.call(this, request, parent, ...args);
};

const {
  POLICY_ACTIONS,
  DEFAULT_POLICIES,
  evaluatePolicy,
  classifyRunbookSafety,
  matchesRule,
} = require('../lambda/utilidades/policy-engine');

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

async function runTests() {
  console.log('\n=== Policy Engine Tests ===\n');

  // --- POLICY_ACTIONS ---
  console.log('Constantes:');

  test('POLICY_ACTIONS tiene ALLOW, DENY, REQUIRE_APPROVAL', () => {
    assert.strictEqual(POLICY_ACTIONS.ALLOW, 'ALLOW');
    assert.strictEqual(POLICY_ACTIONS.DENY, 'DENY');
    assert.strictEqual(POLICY_ACTIONS.REQUIRE_APPROVAL, 'REQUIRE_APPROVAL');
  });

  test('DEFAULT_POLICIES tiene reglas validas', () => {
    assert.ok(DEFAULT_POLICIES.version);
    assert.ok(Array.isArray(DEFAULT_POLICIES.rules));
    assert.ok(DEFAULT_POLICIES.rules.length > 0);
  });

  // --- matchesRule ---
  console.log('\nmatchesRule:');

  test('regla con dryRun=true coincide con contexto dryRun=true', () => {
    const rule = { match: { dryRun: true }, action: 'ALLOW' };
    assert.strictEqual(matchesRule(rule, { dryRun: true }), true);
  });

  test('regla con dryRun=true no coincide con dryRun=false', () => {
    const rule = { match: { dryRun: true }, action: 'ALLOW' };
    assert.strictEqual(matchesRule(rule, { dryRun: false }), false);
  });

  test('regla con array environment coincide si esta incluido', () => {
    const rule = { match: { environment: ['DEV', 'QAS'] }, action: 'ALLOW' };
    assert.strictEqual(matchesRule(rule, { environment: 'DEV' }), true);
    assert.strictEqual(matchesRule(rule, { environment: 'QAS' }), true);
  });

  test('regla con array environment no coincide si no esta', () => {
    const rule = { match: { environment: ['DEV', 'QAS'] }, action: 'ALLOW' };
    assert.strictEqual(matchesRule(rule, { environment: 'PRD' }), false);
  });

  test('regla con string coincide exacto', () => {
    const rule = { match: { environment: 'PRD' }, action: 'DENY' };
    assert.strictEqual(matchesRule(rule, { environment: 'PRD' }), true);
    assert.strictEqual(matchesRule(rule, { environment: 'DEV' }), false);
  });

  test('campo faltante en contexto bloquea la regla (deny-by-default)', () => {
    const rule = { match: { dryRun: true, environment: 'DEV' }, action: 'ALLOW' };
    // Si environment no esta en contexto, la regla no aplica
    assert.strictEqual(matchesRule(rule, { dryRun: true }), false);
  });

  // --- evaluatePolicy ---
  console.log('\nevaluatePolicy:');

  await asyncTest('simulaciones (dryRun) siempre permitidas', async () => {
    const result = await evaluatePolicy('execute', { dryRun: true });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.action, 'ALLOW');
  });

  await asyncTest('costSafe en DEV permitido', async () => {
    const result = await evaluatePolicy('execute', { costSafe: true, environment: 'DEV' });
    assert.strictEqual(result.allowed, true);
  });

  await asyncTest('costSafe en PRD permitido', async () => {
    const result = await evaluatePolicy('execute', { costSafe: true, environment: 'PRD' });
    assert.strictEqual(result.allowed, true);
  });

  await asyncTest('no-costSafe en PRD requiere aprobacion', async () => {
    const result = await evaluatePolicy('execute', { costSafe: false, environment: 'PRD' });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.action, 'REQUIRE_APPROVAL');
  });

  await asyncTest('deny-by-default cuando no hay regla que coincida', async () => {
    const result = await evaluatePolicy('execute', { unknownField: 'xyz' });
    // Ninguna regla coincide exactamente (dryRun no esta, costSafe no esta, etc.)
    // Pero la primera regla { dryRun: true } no coincide porque dryRun no esta
    // costSafe tampoco esta... Termina en deny-by-default
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.action, 'DENY');
    assert.ok(result.reason.includes('deny-by-default'));
  });

  // --- classifyRunbookSafety ---
  console.log('\nclassifyRunbookSafety:');

  test('runbooks costSafe clasificados como SAFE', () => {
    const safeIds = ['RB-ASE-001', 'RB-HANA-001', 'RB-HA-001', 'RB-JVM-001'];
    for (const id of safeIds) {
      const result = classifyRunbookSafety(id, {});
      assert.strictEqual(result.level, 'SAFE', `${id} deberia ser SAFE`);
    }
  });

  test('runbooks con costo clasificados como RISKY', () => {
    const riskyIds = ['RB-ASE-002', 'RB-HANA-002'];
    for (const id of riskyIds) {
      const result = classifyRunbookSafety(id, {});
      assert.strictEqual(result.level, 'RISKY', `${id} deberia ser RISKY`);
    }
  });

  test('CRITICAL en PRD clasificado como REQUIRES_HUMAN', () => {
    const result = classifyRunbookSafety('RB-CUSTOM-001', { severity: 'CRITICAL', env: 'PRD' });
    assert.strictEqual(result.level, 'REQUIRES_HUMAN');
  });

  test('runbook desconocido sin breach CRITICAL es SAFE por defecto', () => {
    const result = classifyRunbookSafety('RB-UNKNOWN-001', { severity: 'LOW' });
    assert.strictEqual(result.level, 'SAFE');
  });

  // Restaurar resolver
  Module._resolveFilename = originalResolve;

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
