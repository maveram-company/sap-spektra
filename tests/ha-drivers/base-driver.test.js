'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — BaseHaDriver
//  Ejecutar: node tests/ha-drivers/base-driver.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const BaseHaDriver = require('../../lambda/utilidades/ha-drivers/base-driver');

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

// Subclase concreta para testing (BaseHaDriver es abstracto)
class TestDriver extends BaseHaDriver {
  constructor() {
    super('test-driver', 'NETWORK', '2.0.0');
  }
}

console.log('\n=== BaseHaDriver Tests ===\n');

// ─── Constructor ───
console.log('Constructor:');

test('cannot be instantiated directly', () => {
  let threw = false;
  try {
    new BaseHaDriver('x', 'NETWORK', '1.0.0');
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('abstracto'));
  }
  assert.strictEqual(threw, true);
});

test('constructor sets name, type, version', () => {
  const d = new TestDriver();
  assert.strictEqual(d.name, 'test-driver');
  assert.strictEqual(d.type, 'NETWORK');
  assert.strictEqual(d.version, '2.0.0');
});

test('constructor initializes empty evidence and logs', () => {
  const d = new TestDriver();
  assert.deepStrictEqual(d._evidence, []);
  assert.deepStrictEqual(d._logs, []);
});

// ─── Abstract Methods ───
console.log('\nAbstract Methods:');

asyncTest('validateConfig() throws if not overridden', async () => {
  const d = new TestDriver();
  let threw = false;
  try {
    await d.validateConfig({});
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('validateConfig'));
  }
  assert.strictEqual(threw, true);
}).then(() => {});

asyncTest('checkPrerequisites() throws if not overridden', async () => {
  const d = new TestDriver();
  let threw = false;
  try {
    await d.checkPrerequisites({});
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('checkPrerequisites'));
  }
  assert.strictEqual(threw, true);
}).then(() => {});

asyncTest('executeStep() throws if not overridden', async () => {
  const d = new TestDriver();
  let threw = false;
  try {
    await d.executeStep({}, {});
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('executeStep'));
  }
  assert.strictEqual(threw, true);
}).then(() => {});

asyncTest('rollbackStep() throws if not overridden', async () => {
  const d = new TestDriver();
  let threw = false;
  try {
    await d.rollbackStep({}, {});
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('rollbackStep'));
  }
  assert.strictEqual(threw, true);
}).then(() => {});

asyncTest('healthCheck() throws if not overridden', async () => {
  const d = new TestDriver();
  let threw = false;
  try {
    await d.healthCheck({});
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('healthCheck'));
  }
  assert.strictEqual(threw, true);
}).then(() => {});

// ─── log() ───
console.log('\nlog():');

test('creates structured log entries', () => {
  const d = new TestDriver();
  const entry = d.log('info', 'test message', { extra: 'data' });
  assert.strictEqual(entry.driver, 'test-driver');
  assert.strictEqual(entry.type, 'NETWORK');
  assert.strictEqual(entry.level, 'info');
  assert.strictEqual(entry.message, 'test message');
  assert.strictEqual(entry.extra, 'data');
  assert.ok(entry.timestamp);
});

test('stores entries in _logs array', () => {
  const d = new TestDriver();
  d.log('info', 'msg1');
  d.log('warn', 'msg2');
  assert.strictEqual(d._logs.length, 2);
  assert.strictEqual(d._logs[0].level, 'info');
  assert.strictEqual(d._logs[1].level, 'warn');
});

test('getLogs() returns copy of logs', () => {
  const d = new TestDriver();
  d.log('info', 'msg');
  const logs = d.getLogs();
  assert.strictEqual(logs.length, 1);
  logs.push({ fake: true });
  assert.strictEqual(d._logs.length, 1); // original unchanged
});

// ─── createEvidenceEntry() ───
console.log('\ncreateEvidenceEntry():');

test('creates hash-chained evidence', () => {
  const d = new TestDriver();
  const entry1 = d.createEvidenceEntry('action1', { val: 1 });
  assert.ok(entry1.id);
  assert.ok(entry1.timestamp);
  assert.strictEqual(entry1.driver, 'test-driver');
  assert.strictEqual(entry1.driverType, 'NETWORK');
  assert.strictEqual(entry1.action, 'action1');
  assert.ok(entry1.hash);
  assert.strictEqual(entry1.previousHash, null); // first entry

  const entry2 = d.createEvidenceEntry('action2', { val: 2 });
  assert.strictEqual(entry2.previousHash, entry1.hash); // chain
});

test('getEvidence() returns copy of evidence', () => {
  const d = new TestDriver();
  d.createEvidenceEntry('test', {});
  const ev = d.getEvidence();
  assert.strictEqual(ev.length, 1);
  ev.push({ fake: true });
  assert.strictEqual(d._evidence.length, 1); // original unchanged
});

test('reset() clears evidence and logs', () => {
  const d = new TestDriver();
  d.log('info', 'msg');
  d.createEvidenceEntry('test', {});
  assert.strictEqual(d._logs.length, 1);
  assert.strictEqual(d._evidence.length, 1);
  d.reset();
  assert.strictEqual(d._logs.length, 0);
  assert.strictEqual(d._evidence.length, 0);
});

// ─── withTimeout() ───
console.log('\nwithTimeout():');

// Use a main async runner for async tests
async function runAsyncTests() {
  await asyncTest('withTimeout() resolves when promise completes in time', async () => {
    const d = new TestDriver();
    const result = await d.withTimeout(Promise.resolve('ok'), 5000, 'test-op');
    assert.strictEqual(result, 'ok');
  });

  await asyncTest('withTimeout() rejects when promise exceeds timeout', async () => {
    const d = new TestDriver();
    const slow = new Promise(resolve => setTimeout(resolve, 5000));
    let threw = false;
    try {
      await d.withTimeout(slow, 10, 'slow-op');
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('Timeout'));
      assert.ok(e.message.includes('slow-op'));
    }
    assert.strictEqual(threw, true);
  });

  // ─── withRetry() ───
  console.log('\nwithRetry():');

  await asyncTest('withRetry() succeeds on first attempt', async () => {
    const d = new TestDriver();
    let calls = 0;
    const result = await d.withRetry(() => {
      calls++;
      return 'success';
    }, 3, 10, 'retry-test');
    assert.strictEqual(result, 'success');
    assert.strictEqual(calls, 1);
  });

  await asyncTest('withRetry() retries on failure then succeeds', async () => {
    const d = new TestDriver();
    let calls = 0;
    const result = await d.withRetry(() => {
      calls++;
      if (calls < 3) throw new Error('fail');
      return 'ok';
    }, 3, 10, 'retry-test');
    assert.strictEqual(result, 'ok');
    assert.strictEqual(calls, 3);
  });

  await asyncTest('withRetry() throws after max retries exhausted', async () => {
    const d = new TestDriver();
    let calls = 0;
    let threw = false;
    try {
      await d.withRetry(() => {
        calls++;
        throw new Error('always-fail');
      }, 2, 10, 'retry-fail');
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('retry-fail'));
      assert.ok(e.message.includes('2 intentos'));
    }
    assert.strictEqual(threw, true);
    assert.strictEqual(calls, 2);
  });

  // ─── getInfo() ───
  console.log('\ngetInfo():');

  test('getInfo() returns driver metadata', () => {
    const d = new TestDriver();
    d.createEvidenceEntry('x', {});
    d.log('info', 'y');
    const info = d.getInfo();
    assert.strictEqual(info.name, 'test-driver');
    assert.strictEqual(info.type, 'NETWORK');
    assert.strictEqual(info.version, '2.0.0');
    assert.strictEqual(info.evidenceCount, 1);
    assert.strictEqual(info.logCount, 1);
  });

  // ─── Summary ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAsyncTests();
