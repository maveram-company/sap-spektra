'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Execution Model (Fase 3A: modelo unificado)
//  Ejecutar: node tests/execution-model.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const {
  EXECUTION_TYPES,
  EXECUTION_STATES,
  EXECUTION_TRIGGERS,
  generateExecutionId,
  createExecution,
  completeExecution,
  failExecution,
  skipExecution,
} = require('../lambda/utilidades/execution-model');

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

console.log('\n=== Execution Model Tests ===\n');

// --- Constantes ---
console.log('Constantes:');

test('EXECUTION_TYPES tiene todos los tipos requeridos', () => {
  assert.ok(EXECUTION_TYPES.RUNBOOK);
  assert.ok(EXECUTION_TYPES.SCHEDULED);
  assert.ok(EXECUTION_TYPES.SIMULATION);
  assert.ok(EXECUTION_TYPES.SCAN);
  assert.ok(EXECUTION_TYPES.CHAIN);
});

test('EXECUTION_STATES tiene todos los estados requeridos', () => {
  assert.ok(EXECUTION_STATES.PENDING);
  assert.ok(EXECUTION_STATES.EXECUTING);
  assert.ok(EXECUTION_STATES.SUCCESS);
  assert.ok(EXECUTION_STATES.FAILED);
  assert.ok(EXECUTION_STATES.SKIPPED);
  assert.ok(EXECUTION_STATES.AWAITING_APPROVAL);
});

test('EXECUTION_TRIGGERS tiene todos los triggers', () => {
  assert.ok(EXECUTION_TRIGGERS.BREACH);
  assert.ok(EXECUTION_TRIGGERS.SCHEDULE);
  assert.ok(EXECUTION_TRIGGERS.APPROVAL);
  assert.ok(EXECUTION_TRIGGERS.MANUAL);
  assert.ok(EXECUTION_TRIGGERS.CHAIN);
});

test('constantes son inmutables (Object.freeze)', () => {
  assert.throws(() => { EXECUTION_TYPES.NEW = 'X'; }, /Cannot add property/);
  assert.throws(() => { EXECUTION_STATES.NEW = 'X'; }, /Cannot add property/);
  assert.throws(() => { EXECUTION_TRIGGERS.NEW = 'X'; }, /Cannot add property/);
});

// --- generateExecutionId ---
console.log('\ngenerateExecutionId:');

test('genera ID determinista para mismos inputs', () => {
  const id1 = generateExecutionId('SYS1', 'RB-ASE-001', '2024-01-01T00:00:00Z');
  const id2 = generateExecutionId('SYS1', 'RB-ASE-001', '2024-01-01T00:00:00Z');
  assert.strictEqual(id1, id2);
});

test('genera ID diferente para inputs distintos', () => {
  const id1 = generateExecutionId('SYS1', 'RB-ASE-001', '2024-01-01T00:00:00Z');
  const id2 = generateExecutionId('SYS2', 'RB-ASE-001', '2024-01-01T00:00:00Z');
  assert.notStrictEqual(id1, id2);
});

test('ID tiene longitud 16 caracteres hex', () => {
  const id = generateExecutionId('SYS1', 'RB-ASE-001', '2024-01-01T00:00:00Z');
  assert.strictEqual(id.length, 16);
  assert.ok(/^[0-9a-f]+$/.test(id), 'ID debe ser hexadecimal');
});

// --- createExecution ---
console.log('\ncreateExecution:');

test('crea ejecucion con campos requeridos', () => {
  const exec = createExecution({
    type: EXECUTION_TYPES.RUNBOOK,
    systemId: 'SYS1',
    sid: 'OMP',
    runbookId: 'RB-ASE-001',
    triggeredBy: EXECUTION_TRIGGERS.BREACH,
  });
  assert.ok(exec.executionId);
  assert.strictEqual(exec.type, 'RUNBOOK');
  assert.strictEqual(exec.systemId, 'SYS1');
  assert.strictEqual(exec.sid, 'OMP');
  assert.strictEqual(exec.runbookId, 'RB-ASE-001');
  assert.strictEqual(exec.status, 'PENDING');
  assert.strictEqual(exec.dryRun, false);
  assert.ok(exec.startedAt);
  assert.strictEqual(exec.completedAt, null);
  assert.strictEqual(exec.error, null);
});

test('crea ejecucion con dryRun=true', () => {
  const exec = createExecution({
    type: EXECUTION_TYPES.SIMULATION,
    systemId: 'SYS1',
    sid: 'OMP',
    dryRun: true,
  });
  assert.strictEqual(exec.dryRun, true);
  assert.strictEqual(exec.type, 'SIMULATION');
});

test('usa defaults para campos opcionales', () => {
  const exec = createExecution({
    systemId: 'SYS1',
    sid: 'OMP',
  });
  assert.strictEqual(exec.type, 'RUNBOOK');
  assert.strictEqual(exec.triggeredBy, 'breach');
  assert.strictEqual(exec.requestedBy, 'system');
  assert.strictEqual(exec.runbookId, null);
  assert.deepStrictEqual(exec.artifacts, []);
});

// --- completeExecution ---
console.log('\ncompleteExecution:');

test('marca ejecucion como SUCCESS', () => {
  const exec = createExecution({ systemId: 'S1', sid: 'O', type: 'RUNBOOK', triggeredBy: 'breach' });
  const completed = completeExecution(exec, { output: 'OK' });
  assert.strictEqual(completed.status, 'SUCCESS');
  assert.ok(completed.completedAt);
  assert.strictEqual(completed.output, 'OK');
});

test('preserva campos originales', () => {
  const exec = createExecution({ systemId: 'S1', sid: 'O', type: 'RUNBOOK', triggeredBy: 'breach' });
  const completed = completeExecution(exec);
  assert.strictEqual(completed.systemId, 'S1');
  assert.strictEqual(completed.sid, 'O');
  assert.strictEqual(completed.executionId, exec.executionId);
});

// --- failExecution ---
console.log('\nfailExecution:');

test('marca ejecucion como FAILED con error string', () => {
  const exec = createExecution({ systemId: 'S1', sid: 'O', type: 'RUNBOOK', triggeredBy: 'breach' });
  const failed = failExecution(exec, 'Algo salio mal');
  assert.strictEqual(failed.status, 'FAILED');
  assert.strictEqual(failed.error.message, 'Algo salio mal');
  assert.ok(failed.completedAt);
});

test('marca ejecucion como FAILED con Error object', () => {
  const exec = createExecution({ systemId: 'S1', sid: 'O', type: 'RUNBOOK', triggeredBy: 'breach' });
  const err = new Error('DB connection lost');
  err.code = 'ECONNRESET';
  const failed = failExecution(exec, err);
  assert.strictEqual(failed.error.message, 'DB connection lost');
  assert.strictEqual(failed.error.code, 'ECONNRESET');
  assert.ok(failed.error.stack);
});

// --- skipExecution ---
console.log('\nskipExecution:');

test('marca ejecucion como SKIPPED con razon', () => {
  const exec = createExecution({ systemId: 'S1', sid: 'O', type: 'RUNBOOK', triggeredBy: 'breach' });
  const skipped = skipExecution(exec, 'Ya fue ejecutado');
  assert.strictEqual(skipped.status, 'SKIPPED');
  assert.strictEqual(skipped.error.message, 'Ya fue ejecutado');
  assert.strictEqual(skipped.error.code, 'SKIPPED');
  assert.ok(skipped.completedAt);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
