'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — HA Integration (mock mode)
//  Ejecutar: node tests/ha-integration.test.js
//
//  Full integration test: register drivers, build plan, execute.
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const { DriverRegistry } = require('../lambda/utilidades/ha-drivers/driver-registry');
const { StepExecutor } = require('../lambda/utilidades/ha-drivers/step-executor');
const { buildFailoverPlan } = require('../lambda/utilidades/ha-drivers/plan-builder');
const { OperationStatus, StepStatus, DriverType } = require('../lambda/utilidades/ha-types');

// Import real drivers
const EipDriver = require('../lambda/utilidades/ha-drivers/network/eip-driver');
const HanaSrDriver = require('../lambda/utilidades/ha-drivers/db/hana-sr-driver');
const SapServicesDriver = require('../lambda/utilidades/ha-drivers/sap/sap-services-driver');

// We need to use the singleton registry because step-executor and plan-builder import it
const { registry } = require('../lambda/utilidades/ha-drivers/driver-registry');

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

console.log('\n=== HA Integration Tests (Mock Mode) ===\n');

async function runAll() {
  // ─── Step 1: Register all mock drivers ───
  console.log('Driver Registration:');

  test('register all mock drivers in registry', () => {
    registry.clear();

    registry.registerDriver(DriverType.NETWORK, 'eip', EipDriver, {
      allocationId: 'eipalloc-abc123',
      sourceInstanceId: 'i-src001',
      targetInstanceId: 'i-tgt002',
      mock: true,
    });

    registry.registerDriver(DriverType.DB, 'hana-sr', HanaSrDriver, {
      sid: 'HDB',
      instanceNumber: '00',
      sourceInstanceId: 'i-src001',
      targetInstanceId: 'i-tgt002',
      mock: true,
    });

    registry.registerDriver(DriverType.SAP, 'sap-services', SapServicesDriver, {
      sid: 'PRD',
      instanceNumber: '00',
      sourceInstanceId: 'i-src001',
      targetInstanceId: 'i-tgt002',
      mock: true,
    });

    assert.strictEqual(registry.size, 3);
    assert.strictEqual(registry.hasDriver(DriverType.NETWORK, 'eip'), true);
    assert.strictEqual(registry.hasDriver(DriverType.DB, 'hana-sr'), true);
    assert.strictEqual(registry.hasDriver(DriverType.SAP, 'sap-services'), true);
  });

  test('driver combination is compatible', () => {
    const result = registry.validateDriverCombination('eip', 'hana-sr', 'sap-services');
    assert.strictEqual(result.compatible, true);
    assert.strictEqual(result.issues.length, 0);
  });

  // ─── Step 2: Build a failover plan ───
  console.log('\nPlan Building:');

  const context = {
    networkStrategy: 'EIP',
    dbStrategy: 'HANA_SR',
    sapStrategy: 'SAP_SERVICES',
    sourceNode: { instanceId: 'i-src001', hostname: 'sap-prd-01' },
    targetNode: { instanceId: 'i-tgt002', hostname: 'sap-prd-02' },
  };

  let plan;

  test('build a failover plan', () => {
    plan = buildFailoverPlan('SAP-PRD-01', context);
    assert.ok(plan);
    assert.strictEqual(plan.operationType, 'FAILOVER');
    assert.ok(plan.steps.length >= 7);
    assert.ok(plan.estimatedDurationMs > 0);
    assert.ok(plan.rollbackPlan.length > 0);
  });

  // ─── Step 3: Execute the plan ───
  console.log('\nPlan Execution:');

  await asyncTest('execute the failover plan with mock step executor', async () => {
    const stepsStarted = [];
    const stepsCompleted = [];

    const executor = new StepExecutor({
      globalTimeoutMs: 120000,
      onStepStart: ({ step }) => stepsStarted.push(step.name),
      onStepComplete: ({ step }) => stepsCompleted.push(step.name),
    });

    const result = await executor.executeStepSequence(plan, context);

    assert.strictEqual(result.status, OperationStatus.COMPLETED);
    assert.ok(stepsStarted.length === plan.steps.length);
    assert.ok(stepsCompleted.length === plan.steps.length);
  });

  // ─── Step 4: Verify all steps completed ───
  console.log('\nStep Verification:');

  await asyncTest('verify all steps completed successfully', async () => {
    const executor = new StepExecutor({ globalTimeoutMs: 120000 });
    const result = await executor.executeStepSequence(plan, context);

    assert.strictEqual(result.summary.completedSteps, plan.steps.length);
    assert.strictEqual(result.summary.failedSteps, 0);
    assert.strictEqual(result.summary.rolledBackSteps, 0);
    assert.strictEqual(result.summary.skippedSteps, 0);
    assert.ok(result.totalDurationMs >= 0);
    assert.strictEqual(result.error, null);
  });

  // ─── Step 5: Verify evidence was collected ───
  console.log('\nEvidence Collection:');

  await asyncTest('verify evidence was collected', async () => {
    const executor = new StepExecutor({ globalTimeoutMs: 120000 });
    const result = await executor.executeStepSequence(plan, context);

    assert.ok(result.evidence.length > 0);
    // Should have at least one evidence entry per completed step
    assert.ok(result.evidence.length >= plan.steps.length);

    // Evidence should be hash-chained
    for (let i = 1; i < result.evidence.length; i++) {
      assert.strictEqual(
        result.evidence[i].previousHash,
        result.evidence[i - 1].hash,
        `Evidence chain broken at index ${i}`
      );
    }

    // Each evidence entry should have required fields
    result.evidence.forEach(ev => {
      assert.ok(ev.id);
      assert.ok(ev.timestamp);
      assert.ok(ev.action);
      assert.ok(ev.hash);
    });
  });

  // ─── Step 6: Verify drivers created their own evidence ───
  console.log('\nDriver-level Evidence:');

  await asyncTest('drivers collect their own evidence via mock execution', async () => {
    // Get driver instances and check they have evidence from execution
    const eipDriver = registry.getDriver(DriverType.NETWORK, 'eip');
    const hanaDriver = registry.getDriver(DriverType.DB, 'hana-sr');
    const sapDriver = registry.getDriver(DriverType.SAP, 'sap-services');

    // Execute the plan once more to populate driver evidence
    eipDriver.reset();
    hanaDriver.reset();
    sapDriver.reset();

    const executor = new StepExecutor({ globalTimeoutMs: 120000 });
    await executor.executeStepSequence(plan, context);

    // EIP driver should have evidence from switchToTarget
    const eipEvidence = eipDriver.getEvidence();
    assert.ok(eipEvidence.length >= 1, `EIP driver should have evidence but has ${eipEvidence.length}`);

    // HANA driver should have evidence from takeover
    const hanaEvidence = hanaDriver.getEvidence();
    assert.ok(hanaEvidence.length >= 1, `HANA driver should have evidence but has ${hanaEvidence.length}`);

    // SAP driver should have evidence from startOnTarget
    const sapEvidence = sapDriver.getEvidence();
    assert.ok(sapEvidence.length >= 1, `SAP driver should have evidence but has ${sapEvidence.length}`);
  });

  // ─── Summary ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAll();
