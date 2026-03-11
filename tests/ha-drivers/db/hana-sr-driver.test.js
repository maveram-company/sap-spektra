'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — HanaSrDriver (mock=true)
//  Ejecutar: node tests/ha-drivers/db/hana-sr-driver.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const HanaSrDriver = require('../../../lambda/utilidades/ha-drivers/db/hana-sr-driver');

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
  sid: 'HDB',
  instanceNumber: '00',
  sourceInstanceId: 'i-src001',
  targetInstanceId: 'i-tgt002',
  replicationMode: 'SYNC',
  mock: true,
};

console.log('\n=== HanaSrDriver Tests ===\n');

async function runAll() {
  // ─── Constructor ───
  console.log('Constructor:');

  test('constructor sets driver metadata', () => {
    const d = new HanaSrDriver(validConfig);
    assert.strictEqual(d.name, 'hana-sr');
    assert.strictEqual(d.type, 'DB');
    assert.strictEqual(d.version, '1.0.0');
    assert.strictEqual(d.mock, true);
  });

  // ─── validateConfig ───
  console.log('\nvalidateConfig:');

  await asyncTest('validateConfig() passes with valid config', async () => {
    const d = new HanaSrDriver(validConfig);
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  await asyncTest('validateConfig() requires sid', async () => {
    const d = new HanaSrDriver({ instanceNumber: '00', sourceInstanceId: 'i-x', targetInstanceId: 'i-y' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('sid')));
  });

  await asyncTest('validateConfig() requires instanceNumber', async () => {
    const d = new HanaSrDriver({ sid: 'HDB', sourceInstanceId: 'i-x', targetInstanceId: 'i-y' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('instanceNumber')));
  });

  await asyncTest('validateConfig() requires sourceInstanceId', async () => {
    const d = new HanaSrDriver({ sid: 'HDB', instanceNumber: '00', targetInstanceId: 'i-y' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('sourceInstanceId')));
  });

  await asyncTest('validateConfig() requires targetInstanceId', async () => {
    const d = new HanaSrDriver({ sid: 'HDB', instanceNumber: '00', sourceInstanceId: 'i-x' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('targetInstanceId')));
  });

  // ─── checkPrerequisites ───
  console.log('\ncheckPrerequisites:');

  await asyncTest('checkPrerequisites() returns 4 checks', async () => {
    const d = new HanaSrDriver(validConfig);
    const checks = await d.checkPrerequisites({});
    assert.strictEqual(checks.length, 4);
    // Check names: replication, running, mode, log shipping
    const names = checks.map(c => c.name);
    assert.ok(names.includes('replication_health'));
    assert.ok(names.includes('hana_running'));
    assert.ok(names.includes('replication_mode'));
    assert.ok(names.includes('log_shipping'));
  });

  await asyncTest('all mock prerequisite checks pass', async () => {
    const d = new HanaSrDriver(validConfig);
    const checks = await d.checkPrerequisites({});
    checks.forEach(c => {
      assert.strictEqual(c.status, 'PASS');
    });
  });

  // ─── executeStep(takeover) ───
  console.log('\nexecuteStep(takeover):');

  await asyncTest('executeStep takeover mock returns success with PRIMARY status', async () => {
    const d = new HanaSrDriver(validConfig);
    const step = {
      action: 'takeover',
      config: {
        targetNode: { instanceId: 'i-tgt002' },
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.action, 'takeover');
    assert.strictEqual(result.srStatus, 'PRIMARY');
    assert.strictEqual(result.sid, 'HDB');
  });

  // ─── executeStep(registerAsSecondary) ───
  console.log('\nexecuteStep(registerAsSecondary):');

  await asyncTest('executeStep registerAsSecondary mock returns success', async () => {
    const d = new HanaSrDriver(validConfig);
    const step = {
      action: 'registerAsSecondary',
      config: {
        sourceNode: { instanceId: 'i-src001' },
        targetNode: { instanceId: 'i-tgt002', hostname: 'sap-prd-02' },
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.action, 'registerAsSecondary');
  });

  // ─── rollbackStep ───
  console.log('\nrollbackStep:');

  await asyncTest('rollbackStep() returns mock rollback', async () => {
    const d = new HanaSrDriver(validConfig);
    const step = { action: 'takeover', config: {} };
    const result = await d.rollbackStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
  });

  // ─── healthCheck ───
  console.log('\nhealthCheck:');

  await asyncTest('healthCheck() returns SOK status in mock', async () => {
    const d = new HanaSrDriver(validConfig);
    const result = await d.healthCheck({});
    assert.strictEqual(result.healthy, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.replicationStatus, 'SOK');
    assert.strictEqual(result.mode, 'SYNC');
    assert.ok(result.timestamp);
  });

  // ─── Unknown action ───
  console.log('\nEdge Cases:');

  await asyncTest('executeStep throws for unknown action', async () => {
    const d = new HanaSrDriver(validConfig);
    const step = { action: 'unknown_action', config: {} };
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
