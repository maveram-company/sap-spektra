'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Route53Driver (mock=true)
//  Ejecutar: node tests/ha-drivers/network/route53-driver.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const Route53Driver = require('../../../lambda/utilidades/ha-drivers/network/route53-driver');

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
  hostedZoneId: 'Z1234ABCDEF',
  recordName: 'sap-prd.example.com',
  recordType: 'A',
  ttl: 60,
  sourceIp: '10.0.1.10',
  targetIp: '10.0.2.20',
  mock: true,
};

console.log('\n=== Route53Driver Tests ===\n');

async function runAll() {
  // ─── Constructor ───
  console.log('Constructor:');

  test('constructor sets driver metadata', () => {
    const d = new Route53Driver(validConfig);
    assert.strictEqual(d.name, 'route53');
    assert.strictEqual(d.type, 'NETWORK');
    assert.strictEqual(d.version, '1.0.0');
    assert.strictEqual(d.mock, true);
  });

  // ─── validateConfig ───
  console.log('\nvalidateConfig:');

  await asyncTest('validateConfig() passes with valid config', async () => {
    const d = new Route53Driver(validConfig);
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  await asyncTest('validateConfig() requires hostedZoneId', async () => {
    const d = new Route53Driver({ recordName: 'x', recordType: 'A', targetIp: '1.2.3.4' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('hostedZoneId')));
  });

  await asyncTest('validateConfig() requires recordName', async () => {
    const d = new Route53Driver({ hostedZoneId: 'Z1', recordType: 'A', targetIp: '1.2.3.4' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('recordName')));
  });

  await asyncTest('validateConfig() requires recordType', async () => {
    const d = new Route53Driver({ hostedZoneId: 'Z1', recordName: 'x', targetIp: '1.2.3.4' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('recordType')));
  });

  await asyncTest('validateConfig() requires targetIp or targetHostname', async () => {
    const d = new Route53Driver({ hostedZoneId: 'Z1', recordName: 'x', recordType: 'A' });
    const result = await d.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('targetIp')));
  });

  // ─── checkPrerequisites ───
  console.log('\ncheckPrerequisites:');

  await asyncTest('checkPrerequisites() returns checks', async () => {
    const d = new Route53Driver(validConfig);
    const checks = await d.checkPrerequisites({});
    assert.ok(checks.length >= 3);
    // All mock checks should pass
    checks.forEach(c => {
      assert.ok(c.status === 'PASS' || c.status === 'WARN');
    });
  });

  // ─── executeStep ───
  console.log('\nexecuteStep:');

  await asyncTest('executeStep() succeeds in mock', async () => {
    const d = new Route53Driver(validConfig);
    const step = {
      action: 'switchToTarget',
      config: {
        targetNode: { ip: '10.0.2.20' },
      },
    };
    const result = await d.executeStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
    assert.ok(result.recordName);
    assert.ok(result.newValue);
  });

  // ─── rollbackStep ───
  console.log('\nrollbackStep:');

  await asyncTest('rollbackStep() reverts in mock', async () => {
    const d = new Route53Driver(validConfig);
    const step = {
      action: 'rollback',
      config: {
        sourceNode: { ip: '10.0.1.10' },
      },
    };
    const result = await d.rollbackStep(step, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mock, true);
  });

  // ─── healthCheck ───
  console.log('\nhealthCheck:');

  await asyncTest('healthCheck() returns healthy in mock', async () => {
    const d = new Route53Driver(validConfig);
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
