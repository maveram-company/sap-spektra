'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — SAP Instance Classifier
//  Ejecutar: node tests/classifier.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');

// Mock del logger para que el classifier no falle al importar
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request === '../utilidades/logger') {
    return request; // bypass resolve
  }
  return originalResolve.call(this, request, parent, ...args);
};
require.cache[require.resolve('../utilidades/logger')] = null;
// Inyectar mock logger en cache
const mockLoggerPath = require.resolve('../lambda/utilidades/logger');
// Simpler approach: just mock before import
delete require.cache;

// Direct mock via module override
const loggerMock = () => ({
  info() {}, warn() {}, error() {}, debug() {},
  setRequestId() {}, metric() {}, timed(n, fn) { return fn(); },
});

// Patch require for classifier
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === '../utilidades/logger') return loggerMock;
  return origRequire.apply(this, arguments);
};

const { classify, classifyAllInstances, CLASSIFICATION_RULES } = require('../lambda/discovery-engine/classifier');

// Restore require
Module.prototype.require = origRequire;

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

console.log('\n=== Classifier Tests ===\n');

// ─── HANA Classification ───
console.log('HANA Classification:');

test('classifies HANA Primary', () => {
  const facts = {
    instanceId: 'i-001',
    hana: { found: true },
    hsrState: { mode: 'primary' },
    processes: ['hdbdaemon', 'hdbnameserver'],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'HANA Primary');
  assert.strictEqual(result.product, 'SAP HANA');
  assert.strictEqual(result.confidence, 'high');
});

test('classifies HANA Secondary (sync)', () => {
  const facts = {
    instanceId: 'i-002',
    hana: { found: true },
    hsrState: { mode: 'sync' },
    processes: ['hdbdaemon'],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'HANA Secondary');
  assert.strictEqual(result.product, 'SAP HANA');
});

test('classifies HANA Secondary (async)', () => {
  const facts = {
    instanceId: 'i-003',
    hana: { found: true },
    hsrState: { mode: 'async' },
    processes: [],
    sids: ['QAS'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'HANA Secondary');
});

test('classifies HANA Standalone', () => {
  const facts = {
    instanceId: 'i-004',
    hana: { found: true },
    processes: ['hdbdaemon'],
    sids: ['DEV'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'HANA Standalone');
  assert.strictEqual(result.product, 'SAP HANA');
});

// ─── ASCS / ERS ───
console.log('\nCentral Services:');

test('classifies ASCS by profile', () => {
  const facts = {
    instanceId: 'i-010',
    profiles: [{ instanceName: 'PRD_ASCS00_sapascs', profileName: 'PRD_ASCS00' }],
    processes: ['msg_server', 'enserver'],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'ASCS');
  assert.strictEqual(result.product, 'SAP NetWeaver');
});

test('classifies ASCS by processes only', () => {
  const facts = {
    instanceId: 'i-011',
    profiles: [],
    processes: ['msg_server', 'enserver'],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'ASCS');
});

test('classifies ERS by profile', () => {
  const facts = {
    instanceId: 'i-012',
    profiles: [{ instanceName: 'PRD_ERS10_sapers', profileName: 'PRD_ERS10' }],
    processes: ['enrepserver'],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'ERS');
});

test('classifies ERS by process only', () => {
  const facts = {
    instanceId: 'i-013',
    profiles: [],
    processes: ['enrepserver'],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'ERS');
});

// ─── Application Servers ───
console.log('\nApplication Servers:');

test('classifies PAS (primary app server)', () => {
  const facts = {
    instanceId: 'i-020',
    processes: ['disp+work', 'icman'],
    profiles: [],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'PAS');
});

test('classifies Web Dispatcher', () => {
  const facts = {
    instanceId: 'i-030',
    processes: ['sapwebdisp'],
    profiles: [],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'Web Dispatcher');
  assert.strictEqual(result.product, 'SAP Web Dispatcher');
});

test('classifies PO/PI Java', () => {
  const facts = {
    instanceId: 'i-040',
    processes: ['jstart', 'j2ee_worker'],
    profiles: [],
    sids: ['PO1'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'Java Application Server');
  assert.strictEqual(result.product, 'SAP PO/PI');
});

test('classifies SAP Router', () => {
  const facts = {
    instanceId: 'i-050',
    processes: ['saprouter'],
    profiles: [],
    sids: [],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'SAP Router');
});

// ─── Edge Cases ───
console.log('\nEdge Cases:');

test('returns Unknown for empty facts', () => {
  const result = classify({ instanceId: 'i-099', processes: [], profiles: [] });
  assert.strictEqual(result.role, 'Unknown');
  assert.strictEqual(result.confidence, 'low');
});

test('returns Unknown for no processes', () => {
  const result = classify({ instanceId: 'i-098' });
  assert.strictEqual(result.ruleId, 'UNKNOWN');
});

test('HANA takes priority over ASCS if both match', () => {
  const facts = {
    instanceId: 'i-097',
    hana: { found: true },
    hsrState: { mode: 'primary' },
    processes: ['hdbdaemon', 'msg_server', 'enserver'],
    profiles: [{ instanceName: 'PRD_ASCS00' }],
    sids: ['PRD'],
  };
  const result = classify(facts);
  assert.strictEqual(result.role, 'HANA Primary');
});

// ─── classifyAllInstances ───
console.log('\nclassifyAllInstances:');

test('groups instances by SID in landscapes', () => {
  const instances = [
    { instanceId: 'i-100', sids: ['PRD'], hana: { found: true }, hsrState: { mode: 'primary' }, processes: [] },
    { instanceId: 'i-101', sids: ['PRD'], hana: { found: true }, hsrState: { mode: 'sync' }, processes: [] },
    { instanceId: 'i-102', sids: ['PRD'], processes: ['disp+work'], profiles: [] },
    { instanceId: 'i-103', sids: ['QAS'], processes: ['disp+work'], profiles: [] },
  ];
  const { instances: results, landscapes } = classifyAllInstances(instances);
  assert.strictEqual(results.length, 4);
  assert.ok(landscapes.PRD);
  assert.ok(landscapes.QAS);
  assert.strictEqual(landscapes.PRD.instances.length, 3);
  assert.strictEqual(landscapes.QAS.instances.length, 1);
});

test('assigns primarySecondary correctly', () => {
  const instances = [
    { instanceId: 'i-200', sids: ['PRD'], hana: { found: true }, hsrState: { mode: 'primary' }, processes: [] },
    { instanceId: 'i-201', sids: ['PRD'], hana: { found: true }, hsrState: { mode: 'sync' }, processes: [] },
  ];
  const { landscapes } = classifyAllInstances(instances);
  const prdNodes = landscapes.PRD.instances;
  const primary = prdNodes.find(n => n.instanceId === 'i-200');
  const secondary = prdNodes.find(n => n.instanceId === 'i-201');
  assert.strictEqual(primary.primarySecondary, 'primary');
  assert.strictEqual(secondary.primarySecondary, 'secondary');
});

// ─── Rules Integrity ───
console.log('\nRules Integrity:');

test('all rules have required fields', () => {
  for (const rule of CLASSIFICATION_RULES) {
    assert.ok(rule.id, `Rule missing id`);
    assert.ok(rule.product, `Rule ${rule.id} missing product`);
    assert.ok(rule.role, `Rule ${rule.id} missing role`);
    assert.ok(typeof rule.match === 'function', `Rule ${rule.id} missing match function`);
  }
});

test('rule IDs are unique', () => {
  const ids = CLASSIFICATION_RULES.map(r => r.id);
  const unique = new Set(ids);
  assert.strictEqual(ids.length, unique.size, `Duplicate rule IDs found`);
});

// ─── Summary ───
console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}\n`);
process.exit(failed > 0 ? 1 : 0);
