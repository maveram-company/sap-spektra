'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Dry-Run Simulator (Fase 4A)
//  Ejecutar: node tests/dry-run-simulator.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');

// Mockear dependencias AWS antes de importar
const Module = require('module');
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, parent, ...args) {
  if (request === '@aws-sdk/client-ssm') return require.resolve('./mocks/ssm-mock');
  if (request === '@aws-sdk/client-dynamodb') return require.resolve('./mocks/dynamodb-mock');
  if (request === '@aws-sdk/lib-dynamodb') return require.resolve('./mocks/dynamodb-doc-mock');
  return originalResolve.call(this, request, parent, ...args);
};

const { simulateExecution, estimateCost } = require('../lambda/utilidades/dry-run-simulator');

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
  console.log('\n=== Dry-Run Simulator Tests ===\n');

  // --- estimateCost ---
  console.log('estimateCost:');

  test('retorna costo para RB-ASE-002 (EBS expansion)', () => {
    const cost = estimateCost('RB-ASE-002', {});
    assert.strictEqual(cost.type, 'EBS_EXPANSION');
    assert.strictEqual(cost.estimatedUSD, 8.0);
  });

  test('retorna costo para RB-HANA-002 (EBS expansion)', () => {
    const cost = estimateCost('RB-HANA-002', {});
    assert.strictEqual(cost.type, 'EBS_EXPANSION');
    assert.strictEqual(cost.estimatedUSD, 12.5);
  });

  test('retorna costo 0 para runbook sin costo extra', () => {
    const cost = estimateCost('RB-ASE-001', {});
    assert.strictEqual(cost.type, 'COMPUTE_ONLY');
    assert.strictEqual(cost.estimatedUSD, 0.0);
  });

  test('runbook desconocido usa costo default', () => {
    const cost = estimateCost('RB-CUSTOM-999', {});
    assert.strictEqual(cost.type, 'COMPUTE_ONLY');
    assert.strictEqual(cost.estimatedUSD, 0.0);
  });

  // --- simulateExecution ---
  console.log('\nsimulateExecution:');

  await asyncTest('simulacion retorna resultado con steps', async () => {
    const result = await simulateExecution({
      runbookId: 'RB-ASE-001',
      systemId: 'SYS1',
      sid: 'OMP',
      commands: ['SELECT 1', 'sp_who'],
      context: { dryRun: true },
    });
    assert.ok(result.execution);
    assert.ok(result.steps);
    assert.ok(result.summary);
    assert.ok(result.steps.length >= 3); // POLICY_CHECK, COMMAND_LIST, COST_ESTIMATE
  });

  await asyncTest('simulacion tiene paso POLICY_CHECK', async () => {
    const result = await simulateExecution({
      runbookId: 'RB-ASE-001',
      systemId: 'SYS1',
      sid: 'OMP',
      commands: [],
      context: { dryRun: true },
    });
    const policyStep = result.steps.find(s => s.step === 'POLICY_CHECK');
    assert.ok(policyStep, 'Debe tener paso POLICY_CHECK');
    assert.strictEqual(policyStep.result, 'PASS'); // dryRun siempre permite
  });

  await asyncTest('simulacion tiene paso COMMAND_LIST con conteo', async () => {
    const result = await simulateExecution({
      runbookId: 'RB-ASE-001',
      systemId: 'SYS1',
      sid: 'OMP',
      commands: ['cmd1', 'cmd2', 'cmd3'],
      context: {},
    });
    const cmdStep = result.steps.find(s => s.step === 'COMMAND_LIST');
    assert.ok(cmdStep);
    assert.strictEqual(cmdStep.details.commandCount, 3);
    assert.strictEqual(cmdStep.result, 'SIMULATED');
  });

  await asyncTest('simulacion tiene paso COST_ESTIMATE', async () => {
    const result = await simulateExecution({
      runbookId: 'RB-ASE-002',
      systemId: 'SYS1',
      sid: 'OMP',
      commands: [],
      context: {},
    });
    const costStep = result.steps.find(s => s.step === 'COST_ESTIMATE');
    assert.ok(costStep);
    assert.strictEqual(costStep.details.type, 'EBS_EXPANSION');
  });

  await asyncTest('simulacion NUNCA ejecuta comandos reales (solo lista)', async () => {
    const result = await simulateExecution({
      runbookId: 'RB-ASE-001',
      systemId: 'SYS1',
      sid: 'OMP',
      commands: ['DROP DATABASE'],
      context: {},
    });
    const cmdStep = result.steps.find(s => s.step === 'COMMAND_LIST');
    assert.strictEqual(cmdStep.result, 'SIMULATED');
    assert.ok(cmdStep.details.commands[0].wouldExecuteVia, 'SSM SendCommand');
    // Verificar que la ejecucion misma es DRY-RUN
    assert.ok(result.summary.mode.includes('DRY-RUN'));
  });

  await asyncTest('simulacion con capabilities evalua CAPABILITY_CHECK', async () => {
    const caps = { canRunSSM: { enabled: true }, canCollectDBMetrics: { enabled: true } };
    const result = await simulateExecution({
      runbookId: 'RB-ASE-001',
      systemId: 'SYS1',
      sid: 'OMP',
      commands: [],
      capabilities: caps,
      context: {},
    });
    const capStep = result.steps.find(s => s.step === 'CAPABILITY_CHECK');
    assert.ok(capStep, 'Debe tener paso CAPABILITY_CHECK');
  });

  await asyncTest('summary indica si puede ejecutar', async () => {
    const result = await simulateExecution({
      runbookId: 'RB-ASE-001',
      systemId: 'SYS1',
      sid: 'OMP',
      commands: ['a', 'b'],
      context: { dryRun: true },
    });
    assert.strictEqual(typeof result.summary.canExecute, 'boolean');
    assert.strictEqual(result.summary.commandCount, 2);
  });

  await asyncTest('execution se marca como completada', async () => {
    const result = await simulateExecution({
      runbookId: 'RB-ASE-001',
      systemId: 'SYS1',
      sid: 'OMP',
      commands: [],
      context: {},
    });
    assert.strictEqual(result.execution.status, 'SUCCESS');
    assert.ok(result.execution.output.includes('DRY-RUN'));
  });

  // Restaurar resolver
  Module._resolveFilename = originalResolve;

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
