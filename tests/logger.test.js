'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Structured Logger
//  Ejecutar: node tests/logger.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const createLogger = require('../lambda/utilidades/logger');

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

// Capture console output for testing
let capturedLogs = [];
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

function startCapture() {
  capturedLogs = [];
  console.log = (msg) => capturedLogs.push({ level: 'log', msg });
  console.error = (msg) => capturedLogs.push({ level: 'error', msg });
  console.warn = (msg) => capturedLogs.push({ level: 'warn', msg });
}

function stopCapture() {
  console.log = origLog;
  console.error = origError;
  console.warn = origWarn;
}

function getLastLog() {
  const last = capturedLogs[capturedLogs.length - 1];
  return last ? JSON.parse(last.msg) : null;
}

console.log('\n=== Logger Tests ===\n');

// ─── Basic Logging ───
console.log('Basic Logging:');

test('creates logger with component name', () => {
  const log = createLogger('test-component');
  assert.ok(log);
  assert.ok(typeof log.info === 'function');
  assert.ok(typeof log.error === 'function');
  assert.ok(typeof log.warn === 'function');
  assert.ok(typeof log.debug === 'function');
});

test('info produces JSON with correct fields', () => {
  const log = createLogger('my-lambda');
  startCapture();
  log.info('Test message', { systemId: 'PRD-01' });
  stopCapture();
  const entry = getLastLog();
  assert.strictEqual(entry.level, 'info');
  assert.strictEqual(entry.component, 'my-lambda');
  assert.strictEqual(entry.message, 'Test message');
  assert.strictEqual(entry.systemId, 'PRD-01');
  assert.ok(entry.timestamp);
});

test('error uses console.error', () => {
  const log = createLogger('error-test');
  startCapture();
  log.error('Fallo critico', { code: 500 });
  stopCapture();
  assert.strictEqual(capturedLogs[0].level, 'error');
  const entry = JSON.parse(capturedLogs[0].msg);
  assert.strictEqual(entry.level, 'error');
  assert.strictEqual(entry.code, 500);
});

test('warn uses console.warn', () => {
  const log = createLogger('warn-test');
  startCapture();
  log.warn('Advertencia');
  stopCapture();
  assert.strictEqual(capturedLogs[0].level, 'warn');
});

// ─── Request ID ───
console.log('\nRequest ID:');

test('setRequestId includes requestId in logs', () => {
  const log = createLogger('req-test');
  log.setRequestId('abc-123');
  startCapture();
  log.info('Con request ID');
  stopCapture();
  const entry = getLastLog();
  assert.strictEqual(entry.requestId, 'abc-123');
});

test('logs without requestId omit the field', () => {
  const log = createLogger('no-req');
  startCapture();
  log.info('Sin request ID');
  stopCapture();
  const entry = getLastLog();
  assert.strictEqual(entry.requestId, undefined);
});

// ─── Metric (CloudWatch Embedded Metric Format) ───
console.log('\nMetric EMF:');

test('metric emits CloudWatch Embedded Metric Format', () => {
  const log = createLogger('metric-test');
  startCapture();
  log.metric('DiscoveryDuration', 1250, 'Milliseconds', { SID: 'PRD' });
  stopCapture();
  const entry = getLastLog();
  assert.ok(entry._aws);
  assert.ok(entry._aws.CloudWatchMetrics);
  assert.strictEqual(entry._aws.CloudWatchMetrics[0].Namespace, 'SAPAlwaysOps/Operations');
  assert.strictEqual(entry._aws.CloudWatchMetrics[0].Metrics[0].Name, 'DiscoveryDuration');
  assert.strictEqual(entry._aws.CloudWatchMetrics[0].Metrics[0].Unit, 'Milliseconds');
  assert.strictEqual(entry.DiscoveryDuration, 1250);
  assert.strictEqual(entry.SID, 'PRD');
});

// ─── Timed ───
console.log('\nTimed:');

test('timed measures duration of async operations', async () => {
  const log = createLogger('timed-test');
  startCapture();
  const result = await log.timed('TestOp', async () => {
    return 42;
  });
  stopCapture();
  assert.strictEqual(result, 42);
  const entry = getLastLog();
  assert.ok(entry.message.includes('TestOp completado'));
  assert.ok(entry.duration);
});

test('timed captures errors with duration', async () => {
  const log = createLogger('timed-err');
  startCapture();
  try {
    await log.timed('FailOp', async () => {
      throw new Error('boom');
    });
  } catch (e) {
    // expected
  }
  stopCapture();
  const entry = getLastLog();
  assert.ok(entry.message.includes('FailOp fallido'));
  assert.strictEqual(entry.error, 'boom');
});

// ─── Log Level Filtering ───
console.log('\nLog Level Filtering:');

test('debug is suppressed at default info level', () => {
  const log = createLogger('level-test');
  startCapture();
  log.debug('This should not appear');
  stopCapture();
  assert.strictEqual(capturedLogs.length, 0);
});

test('info is emitted at default level', () => {
  const log = createLogger('level-test2');
  startCapture();
  log.info('This should appear');
  stopCapture();
  assert.strictEqual(capturedLogs.length, 1);
});

// ─── JSON Validity ───
console.log('\nJSON Validity:');

test('all log levels produce valid JSON', () => {
  const log = createLogger('json-test');
  const levels = ['info', 'warn', 'error'];
  for (const level of levels) {
    startCapture();
    log[level](`Test ${level}`, { key: 'value' });
    stopCapture();
    assert.doesNotThrow(() => JSON.parse(capturedLogs[0].msg), `${level} produced invalid JSON`);
  }
});

test('handles special characters in messages', () => {
  const log = createLogger('special-test');
  startCapture();
  log.info('Mensaje con "comillas" y ñ y {braces}', { path: '/usr/sap/PRD' });
  stopCapture();
  const entry = getLastLog();
  assert.ok(entry.message.includes('comillas'));
  assert.ok(entry.message.includes('ñ'));
});

// ─── Summary ───
console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}\n`);
process.exit(failed > 0 ? 1 : 0);
