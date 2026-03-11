'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — DeclarativeDbDriver (mock=true)
//  Ejecutar: node tests/ha-drivers/db/declarative-db-driver.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const DeclarativeDbDriver = require('../../../lambda/utilidades/ha-drivers/db/declarative-db-driver');

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

const validConfig = {
  dbType: 'ASE',
  promoteCommand: '/opt/sybase/promote.sh',
  demoteCommand: '/opt/sybase/demote.sh',
  statusCommand: '/opt/sybase/status.sh',
  healthCommand: '/opt/sybase/health.sh',
  sourceInstanceId: 'i-src001',
  targetInstanceId: 'i-tgt002',
  mock: true,
};

console.log('\n=== DeclarativeDbDriver Tests ===\n');

async function runAll() {
  // ─── Constructor ───
  console.log('Constructor:');

  test('constructor sets driver metadata', () => {
    const d = new DeclarativeDbDriver(validConfig);
    assert.strictEqual(d.name, 'declarative-db');
    assert.strictEqual(d.type, 'DB');
    assert.strictEqual(d.version, '1.0.0');
    assert.strictEqual(d.mock, true);
  });

  // ─── validateConfig ───
  console.log('\nvalidateConfig:');

  await asyncTest('validateConfig() passes with valid config', async () => {
    const d = new DeclarativeDbDriver(validConfig);
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  await asyncTest('validateConfig() requires dbType', async () => {
    const d = new DeclarativeDbDriver({
      promoteCommand: 'x', statusCommand: 'y',
      sourceInstanceId: 'i-x', targetInstanceId: 'i-y',
    });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('dbType')));
  });

  await asyncTest('validateConfig() requires promoteCommand', async () => {
    const d = new DeclarativeDbDriver({
      dbType: 'ASE', statusCommand: 'y',
      sourceInstanceId: 'i-x', targetInstanceId: 'i-y',
    });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('promoteCommand')));
  });

  await asyncTest('validateConfig() requires statusCommand', async () => {
    const d = new DeclarativeDbDriver({
      dbType: 'ASE', promoteCommand: 'x',
      sourceInstanceId: 'i-x', targetInstanceId: 'i-y',
    });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('statusCommand')));
  });

  // ─── executeStep(takeover) ───
  console.log('\nexecuteStep(takeover):');

  await asyncTest('executeStep takeover calls promote mock', async () => {
    const d = new DeclarativeDbDriver(validConfig);
    const step = {
      action: 'takeover',
      config: {
        targetNode: { instanceId: 'i-tgt002' },
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.action, 'promote');
    assert.strictEqual(result.dbType, 'ASE');
  });

  // ─── executeStep(registerAsSecondary) ───
  console.log('\nexecuteStep(registerAsSecondary):');

  await asyncTest('executeStep registerAsSecondary calls demote mock', async () => {
    const d = new DeclarativeDbDriver(validConfig);
    const step = {
      action: 'registerAsSecondary',
      config: {
        sourceNode: { instanceId: 'i-src001' },
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.action, 'demote');
    assert.strictEqual(result.dbType, 'ASE');
  });

  // ─── rollbackStep ───
  console.log('\nrollbackStep:');

  await asyncTest('rollbackStep() succeeds in mock', async () => {
    const d = new DeclarativeDbDriver(validConfig);
    const step = { action: 'takeover', config: {} };
    const result = await d.rollbackStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
  });

  // ─── healthCheck ───
  console.log('\nhealthCheck:');

  await asyncTest('healthCheck() succeeds in mock', async () => {
    const d = new DeclarativeDbDriver(validConfig);
    const result = await d.healthCheck({});
    assert.strictEqual(result.healthy, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.dbType, 'ASE');
    assert.ok(result.timestamp);
  });

  // ─── Unknown action ───
  console.log('\nEdge Cases:');

  await asyncTest('executeStep throws for unknown action', async () => {
    const d = new DeclarativeDbDriver(validConfig);
    const step = { action: 'invalid_action', config: {} };
    let threw = false;
    try {
      await d.executeStep(step, {});
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('desconocida'));
    }
    assert.strictEqual(threw, true);
  });

  // ─── Summary ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAll();
