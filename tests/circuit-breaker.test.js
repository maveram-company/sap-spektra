'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Circuit Breaker
//  Ejecutar: node tests/circuit-breaker.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const { createCircuitBreaker, getAllCircuitStates } = require('../lambda/utilidades/circuit-breaker');

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

console.log('\n=== Circuit Breaker Tests ===\n');

// ─── Basic Behavior ───
console.log('Basic Behavior:');

test('starts in CLOSED state', () => {
  const cb = createCircuitBreaker('test-closed-' + Date.now());
  assert.strictEqual(cb.getState().state, 'CLOSED');
  assert.strictEqual(cb.canExecute(), true);
});

test('stays CLOSED after success', () => {
  const cb = createCircuitBreaker('test-success-' + Date.now());
  cb.recordSuccess();
  assert.strictEqual(cb.getState().state, 'CLOSED');
  assert.strictEqual(cb.getState().failures, 0);
});

test('stays CLOSED after failures below threshold', () => {
  const cb = createCircuitBreaker('test-below-' + Date.now(), { failureThreshold: 5 });
  for (let i = 0; i < 4; i++) cb.recordFailure();
  assert.strictEqual(cb.getState().state, 'CLOSED');
  assert.strictEqual(cb.canExecute(), true);
  assert.strictEqual(cb.getState().failures, 4);
});

// ─── Open State ───
console.log('\nOpen State:');

test('opens after threshold failures', () => {
  const cb = createCircuitBreaker('test-open-' + Date.now(), { failureThreshold: 3 });
  cb.recordFailure();
  cb.recordFailure();
  cb.recordFailure();
  assert.strictEqual(cb.getState().state, 'OPEN');
  assert.strictEqual(cb.canExecute(), false);
});

test('opens after exactly 5 failures (default threshold)', () => {
  const cb = createCircuitBreaker('test-def-' + Date.now());
  for (let i = 0; i < 5; i++) cb.recordFailure();
  assert.strictEqual(cb.getState().state, 'OPEN');
});

test('blocks execution when OPEN', () => {
  const cb = createCircuitBreaker('test-block-' + Date.now(), { failureThreshold: 2 });
  cb.recordFailure();
  cb.recordFailure();
  assert.strictEqual(cb.canExecute(), false);
  assert.strictEqual(cb.canExecute(), false); // repeatedly false
});

// ─── Half-Open State ───
console.log('\nHalf-Open State:');

test('transitions to HALF_OPEN after timeout', () => {
  const cb = createCircuitBreaker('test-halfopen-' + Date.now(), {
    failureThreshold: 2,
    resetTimeoutMs: 1, // 1ms timeout for testing
  });
  cb.recordFailure();
  cb.recordFailure();
  assert.strictEqual(cb.getState().state, 'OPEN');

  // Wait for timeout
  const start = Date.now();
  while (Date.now() - start < 5) {} // busy-wait 5ms

  assert.strictEqual(cb.canExecute(), true); // triggers HALF_OPEN transition
  assert.strictEqual(cb.getState().state, 'HALF_OPEN');
});

test('HALF_OPEN -> CLOSED on success', () => {
  const cb = createCircuitBreaker('test-ho-success-' + Date.now(), {
    failureThreshold: 2,
    resetTimeoutMs: 1,
  });
  cb.recordFailure();
  cb.recordFailure();
  const start = Date.now();
  while (Date.now() - start < 5) {}
  cb.canExecute(); // trigger HALF_OPEN
  cb.recordSuccess();
  assert.strictEqual(cb.getState().state, 'CLOSED');
  assert.strictEqual(cb.getState().failures, 0);
});

test('HALF_OPEN -> OPEN on failure', () => {
  const cb = createCircuitBreaker('test-ho-fail-' + Date.now(), {
    failureThreshold: 2,
    resetTimeoutMs: 1,
  });
  cb.recordFailure();
  cb.recordFailure();
  const start = Date.now();
  while (Date.now() - start < 5) {}
  cb.canExecute(); // trigger HALF_OPEN
  cb.recordFailure();
  assert.strictEqual(cb.getState().state, 'OPEN');
});

// ─── Reset ───
console.log('\nReset:');

test('manual reset returns to CLOSED', () => {
  const cb = createCircuitBreaker('test-reset-' + Date.now(), { failureThreshold: 2 });
  cb.recordFailure();
  cb.recordFailure();
  assert.strictEqual(cb.getState().state, 'OPEN');
  cb.reset();
  assert.strictEqual(cb.getState().state, 'CLOSED');
  assert.strictEqual(cb.getState().failures, 0);
  assert.strictEqual(cb.canExecute(), true);
});

// ─── getAllCircuitStates ───
console.log('\ngetAllCircuitStates:');

test('returns all registered circuits', () => {
  const states = getAllCircuitStates();
  assert.ok(Array.isArray(states));
  assert.ok(states.length > 0);
  const names = states.map(s => s.name);
  assert.ok(names.some(n => n.startsWith('test-')));
});

// ─── Custom Config ───
console.log('\nCustom Config:');

test('respects custom failureThreshold', () => {
  const cb = createCircuitBreaker('test-custom-' + Date.now(), { failureThreshold: 1 });
  cb.recordFailure();
  assert.strictEqual(cb.getState().state, 'OPEN');
});

test('separate circuits are independent', () => {
  const cb1 = createCircuitBreaker('test-indep-a-' + Date.now(), { failureThreshold: 2 });
  const cb2 = createCircuitBreaker('test-indep-b-' + Date.now(), { failureThreshold: 2 });
  cb1.recordFailure();
  cb1.recordFailure();
  assert.strictEqual(cb1.getState().state, 'OPEN');
  assert.strictEqual(cb2.getState().state, 'CLOSED');
});

// ─── Summary ───
console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}\n`);
process.exit(failed > 0 ? 1 : 0);
