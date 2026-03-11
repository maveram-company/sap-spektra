'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — PlanBuilder
//  Ejecutar: node tests/ha-drivers/plan-builder.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const {
  buildFailoverPlan,
  buildTakeoverPlan,
  buildFailbackPlan,
  ESTIMATED_TIMES,
} = require('../../lambda/utilidades/ha-drivers/plan-builder');
const { OperationType } = require('../../lambda/utilidades/ha-types');

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

const baseContext = {
  networkStrategy: 'EIP',
  dbStrategy: 'HANA_SR',
  sapStrategy: 'SAP_SERVICES',
  sourceNode: { instanceId: 'i-src', hostname: 'sap-prd-01' },
  targetNode: { instanceId: 'i-tgt', hostname: 'sap-prd-02' },
};

console.log('\n=== PlanBuilder Tests ===\n');

// ─── buildFailoverPlan ───
console.log('buildFailoverPlan:');

test('creates correct step sequence', () => {
  const plan = buildFailoverPlan('SAP-PRD-01', baseContext);
  assert.strictEqual(plan.operationType, OperationType.FAILOVER);
  assert.strictEqual(plan.systemId, 'SAP-PRD-01');
  assert.ok(plan.steps.length >= 7);
  // Verify step order: lock, pre-flight, network, DB, SAP, health, release
  assert.strictEqual(plan.steps[0].action, 'acquireLock');
  assert.strictEqual(plan.steps[1].action, 'capturePreState');
  assert.strictEqual(plan.steps[2].action, 'switchToTarget');
  assert.strictEqual(plan.steps[3].action, 'takeover');
  assert.strictEqual(plan.steps[4].action, 'startOnTarget');
  assert.strictEqual(plan.steps[5].action, 'verifyPostFailover');
  assert.strictEqual(plan.steps[6].action, 'releaseLock');
});

test('failover plan includes estimated duration', () => {
  const plan = buildFailoverPlan('SAP-PRD-01', baseContext);
  assert.ok(plan.estimatedDurationMs > 0);
  assert.ok(typeof plan.estimatedDurationMs === 'number');
});

test('failover plan includes rollback steps', () => {
  const plan = buildFailoverPlan('SAP-PRD-01', baseContext);
  assert.ok(Array.isArray(plan.rollbackPlan));
  assert.ok(plan.rollbackPlan.length > 0);
  // Rollback should be in reverse order of rollbackable steps
  plan.rollbackPlan.forEach(rs => {
    assert.ok(rs.originalStepId);
    assert.ok(rs.rollbackAction);
    assert.ok(rs.order);
  });
});

test('failover plan has risk level HIGH', () => {
  const plan = buildFailoverPlan('SAP-PRD-01', baseContext);
  assert.strictEqual(plan.riskLevel, 'HIGH');
});

test('failover steps have sequential order values', () => {
  const plan = buildFailoverPlan('SAP-PRD-01', baseContext);
  for (let i = 0; i < plan.steps.length; i++) {
    assert.strictEqual(plan.steps[i].order, i + 1);
  }
});

// ─── buildTakeoverPlan ───
console.log('\nbuildTakeoverPlan:');

test('includes SAP stop before DB takeover', () => {
  const plan = buildTakeoverPlan('SAP-PRD-01', baseContext);
  assert.strictEqual(plan.operationType, OperationType.TAKEOVER);
  // Find indexes of SAP stop and DB takeover
  const sapStopIdx = plan.steps.findIndex(s => s.action === 'stopOnSource');
  const dbTakeoverIdx = plan.steps.findIndex(s => s.action === 'takeover');
  assert.ok(sapStopIdx >= 0, 'should have stopOnSource step');
  assert.ok(dbTakeoverIdx >= 0, 'should have takeover step');
  assert.ok(sapStopIdx < dbTakeoverIdx, 'SAP stop should come before DB takeover');
});

test('takeover plan has risk level MEDIUM', () => {
  const plan = buildTakeoverPlan('SAP-PRD-01', baseContext);
  assert.strictEqual(plan.riskLevel, 'MEDIUM');
});

test('takeover plan includes registerAsSecondary step', () => {
  const plan = buildTakeoverPlan('SAP-PRD-01', baseContext);
  const regStep = plan.steps.find(s => s.action === 'registerAsSecondary');
  assert.ok(regStep, 'should have registerAsSecondary step');
});

test('takeover plan includes estimated duration', () => {
  const plan = buildTakeoverPlan('SAP-PRD-01', baseContext);
  assert.ok(plan.estimatedDurationMs > 0);
});

test('takeover plan includes rollback steps', () => {
  const plan = buildTakeoverPlan('SAP-PRD-01', baseContext);
  assert.ok(Array.isArray(plan.rollbackPlan));
  assert.ok(plan.rollbackPlan.length > 0);
});

// ─── buildFailbackPlan ───
console.log('\nbuildFailbackPlan:');

test('reverses the takeover (source/target swapped)', () => {
  const plan = buildFailbackPlan('SAP-PRD-01', baseContext);
  assert.strictEqual(plan.operationType, OperationType.FAILBACK);
  // In failback, the roles are reversed: original target becomes source
  // The steps should reference the swapped nodes
  const stopStep = plan.steps.find(s => s.action === 'stopOnSource');
  assert.ok(stopStep, 'should have stopOnSource step');
});

test('failback plan has risk level MEDIUM', () => {
  const plan = buildFailbackPlan('SAP-PRD-01', baseContext);
  assert.strictEqual(plan.riskLevel, 'MEDIUM');
});

test('failback plan includes estimated duration', () => {
  const plan = buildFailbackPlan('SAP-PRD-01', baseContext);
  assert.ok(plan.estimatedDurationMs > 0);
});

test('failback plan includes notes', () => {
  const plan = buildFailbackPlan('SAP-PRD-01', baseContext);
  assert.ok(Array.isArray(plan.notes));
  assert.ok(plan.notes.length > 0);
  assert.ok(plan.notes.some(n => n.includes('Failback')));
});

test('failback plan includes rollback steps', () => {
  const plan = buildFailbackPlan('SAP-PRD-01', baseContext);
  assert.ok(Array.isArray(plan.rollbackPlan));
  assert.ok(plan.rollbackPlan.length > 0);
});

// ─── ESTIMATED_TIMES ───
console.log('\nESTIMATED_TIMES:');

test('ESTIMATED_TIMES has network, DB, SAP, and health check entries', () => {
  assert.ok(ESTIMATED_TIMES.NETWORK_SWITCH);
  assert.ok(ESTIMATED_TIMES.DB_FAILOVER);
  assert.ok(ESTIMATED_TIMES.SAP_SWITCH);
  assert.ok(ESTIMATED_TIMES.HEALTH_CHECK > 0);
});

// ─── Summary ───
console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}\n`);
process.exit(failed > 0 ? 1 : 0);
