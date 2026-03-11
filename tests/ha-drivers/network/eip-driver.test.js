'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — EipDriver (mock=true)
//  Ejecutar: node tests/ha-drivers/network/eip-driver.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const EipDriver = require('../../../lambda/utilidades/ha-drivers/network/eip-driver');

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
  allocationId: 'eipalloc-abc123',
  sourceInstanceId: 'i-src001',
  targetInstanceId: 'i-tgt002',
  mock: true,
};

console.log('\n=== EipDriver Tests ===\n');

async function runAll() {
  // ─── Constructor ───
  console.log('Constructor:');

  test('constructor sets driver metadata', () => {
    const d = new EipDriver(validConfig);
    assert.strictEqual(d.name, 'eip');
    assert.strictEqual(d.type, 'NETWORK');
    assert.strictEqual(d.version, '1.0.0');
    assert.strictEqual(d.mock, true);
  });

  // ─── validateConfig ───
  console.log('\nvalidateConfig:');

  await asyncTest('validateConfig() passes with valid config', async () => {
    const d = new EipDriver(validConfig);
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  await asyncTest('validateConfig() requires allocationId', async () => {
    const d = new EipDriver({ sourceInstanceId: 'i-x', targetInstanceId: 'i-y' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('allocationId')));
  });

  await asyncTest('validateConfig() requires sourceInstanceId', async () => {
    const d = new EipDriver({ allocationId: 'eipalloc-x', targetInstanceId: 'i-y' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('sourceInstanceId')));
  });

  await asyncTest('validateConfig() requires targetInstanceId', async () => {
    const d = new EipDriver({ allocationId: 'eipalloc-x', sourceInstanceId: 'i-x' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('targetInstanceId')));
  });

  await asyncTest('validateConfig() validates allocationId prefix', async () => {
    const d = new EipDriver({
      allocationId: 'bad-prefix',
      sourceInstanceId: 'i-x',
      targetInstanceId: 'i-y',
    });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('eipalloc-')));
  });

  // ─── checkPrerequisites ───
  console.log('\ncheckPrerequisites:');

  await asyncTest('checkPrerequisites() returns 4 checks', async () => {
    const d = new EipDriver(validConfig);
    const checks = await d.checkPrerequisites({});
    assert.strictEqual(checks.length, 4);
    // All mock checks should pass
    checks.forEach(c => {
      assert.strictEqual(c.status, 'PASS');
    });
  });

  // ─── executeStep ───
  console.log('\nexecuteStep:');

  await asyncTest('executeStep(switchToTarget) succeeds in mock', async () => {
    const d = new EipDriver(validConfig);
    const step = {
      action: 'switchToTarget',
      config: {
        targetNode: { instanceId: 'i-tgt002' },
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.ok(result.allocationId);
    assert.ok(result.targetInstanceId);
    assert.ok(result.publicIp);
  });

  // ─── rollbackStep ───
  console.log('\nrollbackStep:');

  await asyncTest('rollbackStep() succeeds in mock', async () => {
    const d = new EipDriver(validConfig);
    const step = {
      action: 'rollback',
      config: {
        sourceNode: { instanceId: 'i-src001' },
      },
    };
    const result = await d.rollbackStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
  });

  // ─── healthCheck ───
  console.log('\nhealthCheck:');

  await asyncTest('healthCheck() returns healthy in mock', async () => {
    const d = new EipDriver(validConfig);
    const result = await d.healthCheck({});
    assert.strictEqual(result.healthy, true);
    assert.strictEqual(result.mock, true);
    assert.ok(result.timestamp);
  });

  // ─── Evidence ───
  console.log('\nEvidence:');

  await asyncTest('executeStep creates evidence entries', async () => {
    const d = new EipDriver(validConfig);
    const step = { action: 'switchToTarget', config: { targetNode: { instanceId: 'i-tgt' } } };
    await d.executeStep(step, {});
    const evidence = d.getEvidence();
    assert.ok(evidence.length >= 1);
    assert.ok(evidence[0].hash);
  });

  // ─── Summary ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAll();
