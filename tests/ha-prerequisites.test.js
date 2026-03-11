'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — HA Prerequisites
//  Ejecutar: node tests/ha-prerequisites.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const {
  runAllPrerequisites,
  runSinglePrerequisite,
  CHECKS_REGISTRY,
} = require('../lambda/utilidades/ha-prerequisites');

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

const mockContext = {
  networkStrategy: 'EIP',
  dbStrategy: 'HANA_SR',
  sapStrategy: 'SAP_SERVICES',
  sourceNode: { instanceId: 'i-src001', hostname: 'sap-prd-01' },
  targetNode: { instanceId: 'i-tgt002', hostname: 'sap-prd-02' },
  sid: 'PRD',
  instanceNumber: '00',
};

console.log('\n=== HA Prerequisites Tests ===\n');

async function runAll() {
  // ─── CHECKS_REGISTRY ───
  console.log('CHECKS_REGISTRY:');

  test('CHECKS_REGISTRY has 9 entries', () => {
    const checkNames = Object.keys(CHECKS_REGISTRY);
    assert.strictEqual(checkNames.length, 9);
  });

  test('each check has required properties', () => {
    for (const [name, check] of Object.entries(CHECKS_REGISTRY)) {
      assert.ok(check.displayName, `${name} missing displayName`);
      assert.ok(check.description, `${name} missing description`);
      assert.ok(typeof check.required === 'boolean', `${name} missing required`);
      assert.ok(check.remediation !== undefined, `${name} missing remediation`);
      assert.ok(typeof check.fn === 'function', `${name} missing fn`);
    }
  });

  test('CHECKS_REGISTRY contains expected check names', () => {
    const names = Object.keys(CHECKS_REGISTRY);
    assert.ok(names.includes('checkReplicationHealth'));
    assert.ok(names.includes('checkClusterHealth'));
    assert.ok(names.includes('checkNetworkConnectivity'));
    assert.ok(names.includes('checkDiskSpace'));
    assert.ok(names.includes('checkSapStatus'));
    assert.ok(names.includes('checkBackupRecent'));
    assert.ok(names.includes('checkMaintenanceWindow'));
    assert.ok(names.includes('checkNoActiveOperations'));
    assert.ok(names.includes('checkDriversAvailable'));
  });

  // ─── runAllPrerequisites ───
  console.log('\nrunAllPrerequisites:');

  await asyncTest('runAllPrerequisites() returns 9 checks in mock mode', async () => {
    const result = await runAllPrerequisites('SAP-PRD-01', mockContext);
    assert.ok(result.checks);
    assert.strictEqual(result.checks.length, 9);
    assert.strictEqual(result.systemId, 'SAP-PRD-01');
    assert.ok(result.timestamp);
  });

  await asyncTest('all mock checks pass', async () => {
    const result = await runAllPrerequisites('SAP-PRD-01', mockContext);
    result.checks.forEach(c => {
      // In mock mode all checks should be PASS
      assert.strictEqual(c.status, 'PASS', `Check ${c.name} expected PASS but got ${c.status}`);
    });
  });

  await asyncTest('requiredPassed is true when all required pass', async () => {
    const result = await runAllPrerequisites('SAP-PRD-01', mockContext);
    assert.strictEqual(result.requiredPassed, true);
    assert.strictEqual(result.allPassed, true);
  });

  // ─── runSinglePrerequisite ───
  console.log('\nrunSinglePrerequisite:');

  await asyncTest('runSinglePrerequisite() runs a specific check', async () => {
    const result = await runSinglePrerequisite('checkReplicationHealth', 'SAP-PRD-01', mockContext);
    assert.ok(result);
    assert.strictEqual(result.name, 'checkReplicationHealth');
    assert.strictEqual(result.status, 'PASS');
    assert.ok(result.details);
  });

  await asyncTest('runSinglePrerequisite() throws for unknown check', async () => {
    let threw = false;
    try {
      await runSinglePrerequisite('nonExistentCheck', 'SAP-PRD-01', mockContext);
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('desconocido') || e.message.includes('Check'));
    }
    assert.strictEqual(threw, true);
  });

  await asyncTest('runSinglePrerequisite() checkDiskSpace passes in mock', async () => {
    const result = await runSinglePrerequisite('checkDiskSpace', 'SAP-PRD-01', mockContext);
    assert.strictEqual(result.status, 'PASS');
  });

  await asyncTest('runSinglePrerequisite() checkBackupRecent passes in mock', async () => {
    const result = await runSinglePrerequisite('checkBackupRecent', 'SAP-PRD-01', mockContext);
    assert.strictEqual(result.status, 'PASS');
  });

  // ─── Summary ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAll();
