'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — PacemakerVipDriver (mock=true)
//  Ejecutar: node tests/ha-drivers/network/pacemaker-vip-driver.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const PacemakerVipDriver = require('../../../lambda/utilidades/ha-drivers/network/pacemaker-vip-driver');

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
  vipResourceName: 'rsc_ip_PRD_HDB00',
  vipAddress: '10.0.0.100',
  sourceInstanceId: 'i-src001',
  targetInstanceId: 'i-tgt002',
  targetHostname: 'sap-prd-02',
  sourceHostname: 'sap-prd-01',
  mock: true,
};

console.log('\n=== PacemakerVipDriver Tests ===\n');

async function runAll() {
  // ─── Constructor ───
  console.log('Constructor:');

  test('constructor sets driver metadata', () => {
    const d = new PacemakerVipDriver(validConfig);
    assert.strictEqual(d.name, 'pacemaker_vip');
    assert.strictEqual(d.type, 'NETWORK');
    assert.strictEqual(d.version, '1.0.0');
    assert.strictEqual(d.mock, true);
  });

  // ─── validateConfig ───
  console.log('\nvalidateConfig:');

  await asyncTest('validateConfig() passes with valid config', async () => {
    const d = new PacemakerVipDriver(validConfig);
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  await asyncTest('validateConfig() requires vipResourceName', async () => {
    const d = new PacemakerVipDriver({ sourceInstanceId: 'i-x', targetInstanceId: 'i-y' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('vipResourceName')));
  });

  await asyncTest('validateConfig() requires sourceInstanceId', async () => {
    const d = new PacemakerVipDriver({ vipResourceName: 'rsc_ip', targetInstanceId: 'i-y' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('sourceInstanceId')));
  });

  await asyncTest('validateConfig() requires targetInstanceId', async () => {
    const d = new PacemakerVipDriver({ vipResourceName: 'rsc_ip', sourceInstanceId: 'i-x' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('targetInstanceId')));
  });

  // ─── checkPrerequisites ───
  console.log('\ncheckPrerequisites:');

  await asyncTest('checkPrerequisites() returns cluster checks', async () => {
    const d = new PacemakerVipDriver(validConfig);
    const checks = await d.checkPrerequisites({});
    assert.strictEqual(checks.length, 4);
    // In mock mode all should pass
    checks.forEach(c => {
      assert.strictEqual(c.status, 'PASS');
    });
    // Verify check names
    const names = checks.map(c => c.name);
    assert.ok(names.includes('cluster_active'));
    assert.ok(names.includes('vip_resource_configured'));
    assert.ok(names.includes('ssm_access'));
    assert.ok(names.includes('target_in_cluster'));
  });

  // ─── executeStep ───
  console.log('\nexecuteStep:');

  await asyncTest('executeStep() succeeds in mock', async () => {
    const d = new PacemakerVipDriver(validConfig);
    const step = {
      action: 'switchToTarget',
      config: {
        targetNode: { instanceId: 'i-tgt002', hostname: 'sap-prd-02' },
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.ok(result.vipResource);
    assert.ok(result.movedTo);
  });

  // ─── rollbackStep ───
  console.log('\nrollbackStep:');

  await asyncTest('rollbackStep() succeeds in mock', async () => {
    const d = new PacemakerVipDriver(validConfig);
    const step = {
      action: 'rollback',
      config: {
        sourceNode: { instanceId: 'i-src001', hostname: 'sap-prd-01' },
      },
    };
    const result = await d.rollbackStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
  });

  // ─── healthCheck ───
  console.log('\nhealthCheck:');

  await asyncTest('healthCheck() verifies cluster status in mock', async () => {
    const d = new PacemakerVipDriver(validConfig);
    const result = await d.healthCheck({});
    assert.strictEqual(result.healthy, true);
    assert.strictEqual(result.mock, true);
    assert.ok(result.timestamp);
  });

  // ─── Summary ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAll();
