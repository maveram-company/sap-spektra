'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — SapServicesDriver (mock=true)
//  Ejecutar: node tests/ha-drivers/sap/sap-services-driver.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const SapServicesDriver = require('../../../lambda/utilidades/ha-drivers/sap/sap-services-driver');

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
  sid: 'PRD',
  instanceNumber: '00',
  sourceInstanceId: 'i-src001',
  targetInstanceId: 'i-tgt002',
  mock: true,
};

console.log('\n=== SapServicesDriver Tests ===\n');

async function runAll() {
  // ─── Constructor ───
  console.log('Constructor:');

  test('constructor sets driver metadata', () => {
    const d = new SapServicesDriver(validConfig);
    assert.strictEqual(d.name, 'sap-services');
    assert.strictEqual(d.type, 'SAP');
    assert.strictEqual(d.version, '1.0.0');
    assert.strictEqual(d.mock, true);
  });

  // ─── validateConfig ───
  console.log('\nvalidateConfig:');

  await asyncTest('validateConfig() passes with valid config', async () => {
    const d = new SapServicesDriver(validConfig);
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  await asyncTest('validateConfig() requires sid', async () => {
    const d = new SapServicesDriver({ instanceNumber: '00', sourceInstanceId: 'i-x' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('sid')));
  });

  await asyncTest('validateConfig() requires instanceNumber', async () => {
    const d = new SapServicesDriver({ sid: 'PRD', sourceInstanceId: 'i-x' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('instanceNumber')));
  });

  await asyncTest('validateConfig() requires at least one instanceId', async () => {
    const d = new SapServicesDriver({ sid: 'PRD', instanceNumber: '00' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('sourceInstanceId') || e.includes('targetInstanceId')));
  });

  // ─── executeStep(stopOnSource) ───
  console.log('\nexecuteStep(stopOnSource):');

  await asyncTest('executeStep stopOnSource succeeds in mock', async () => {
    const d = new SapServicesDriver(validConfig);
    const step = {
      action: 'stopOnSource',
      config: {
        sourceNode: { instanceId: 'i-src001' },
        graceful: true,
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.action, 'stop');
    assert.strictEqual(result.node, 'source');
    assert.strictEqual(result.sid, 'PRD');
  });

  // ─── executeStep(startOnTarget) ───
  console.log('\nexecuteStep(startOnTarget):');

  await asyncTest('executeStep startOnTarget succeeds in mock', async () => {
    const d = new SapServicesDriver(validConfig);
    const step = {
      action: 'startOnTarget',
      config: {
        targetNode: { instanceId: 'i-tgt002' },
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.action, 'start');
    assert.strictEqual(result.node, 'target');
    assert.strictEqual(result.sid, 'PRD');
  });

  // ─── rollbackStep ───
  console.log('\nrollbackStep:');

  await asyncTest('rollbackStep() inverts stopOnSource (starts on source)', async () => {
    const d = new SapServicesDriver(validConfig);
    const step = { action: 'stopOnSource', config: {} };
    const result = await d.rollbackStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
  });

  await asyncTest('rollbackStep() inverts startOnTarget (stops on target)', async () => {
    const d = new SapServicesDriver(validConfig);
    const step = { action: 'startOnTarget', config: {} };
    const result = await d.rollbackStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
  });

  // ─── healthCheck ───
  console.log('\nhealthCheck:');

  await asyncTest('healthCheck() returns process list in mock', async () => {
    const d = new SapServicesDriver(validConfig);
    const result = await d.healthCheck({});
    assert.strictEqual(result.healthy, true);
    assert.strictEqual(result.mock, true);
    assert.strictEqual(result.sid, 'PRD');
    assert.ok(Array.isArray(result.processes));
    assert.ok(result.processes.length > 0);
    assert.ok(result.processes.includes('disp+work'));
    assert.ok(result.timestamp);
  });

  // ─── checkPrerequisites ───
  console.log('\ncheckPrerequisites:');

  await asyncTest('checkPrerequisites() returns 3 checks in mock', async () => {
    const d = new SapServicesDriver(validConfig);
    const checks = await d.checkPrerequisites({});
    assert.strictEqual(checks.length, 3);
    checks.forEach(c => {
      assert.strictEqual(c.status, 'PASS');
    });
  });

  // ─── Unknown action ───
  console.log('\nEdge Cases:');

  await asyncTest('executeStep throws for unknown action', async () => {
    const d = new SapServicesDriver(validConfig);
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
