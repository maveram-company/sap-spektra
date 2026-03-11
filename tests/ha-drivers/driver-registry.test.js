'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — DriverRegistry
//  Ejecutar: node tests/ha-drivers/driver-registry.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const { DriverRegistry } = require('../../lambda/utilidades/ha-drivers/driver-registry');
const BaseHaDriver = require('../../lambda/utilidades/ha-drivers/base-driver');
const { DriverType } = require('../../lambda/utilidades/ha-types');

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

// Crear clases concretas de test
class FakeNetworkDriver extends BaseHaDriver {
  constructor(config) {
    super('fake-network', DriverType.NETWORK, '1.0.0');
    this.config = config;
  }
}
class FakeDbDriver extends BaseHaDriver {
  constructor(config) {
    super('fake-db', DriverType.DB, '1.0.0');
    this.config = config;
  }
}
class FakeSapDriver extends BaseHaDriver {
  constructor(config) {
    super('fake-sap', DriverType.SAP, '1.0.0');
    this.config = config;
  }
}

console.log('\n=== DriverRegistry Tests ===\n');

// ─── registerDriver() ───
console.log('registerDriver:');

test('registerDriver() stores a driver', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'test-net', FakeNetworkDriver, {});
  assert.strictEqual(reg.size, 1);
});

test('registerDriver() rejects invalid driver type', () => {
  const reg = new DriverRegistry();
  let threw = false;
  try {
    reg.registerDriver('INVALID_TYPE', 'test', FakeNetworkDriver, {});
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('invalido'));
  }
  assert.strictEqual(threw, true);
});

test('registerDriver() allows replacing existing driver', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'eip', FakeNetworkDriver, {});
  reg.registerDriver(DriverType.NETWORK, 'eip', FakeNetworkDriver, { v: 2 });
  assert.strictEqual(reg.size, 1);
});

// ─── getDriver() ───
console.log('\ngetDriver:');

test('getDriver() returns instance', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'net1', FakeNetworkDriver, {});
  const driver = reg.getDriver(DriverType.NETWORK, 'net1');
  assert.ok(driver instanceof FakeNetworkDriver);
  assert.strictEqual(driver.name, 'fake-network');
});

test('getDriver() returns same instance on second call (lazy init)', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.DB, 'db1', FakeDbDriver, {});
  const d1 = reg.getDriver(DriverType.DB, 'db1');
  const d2 = reg.getDriver(DriverType.DB, 'db1');
  assert.strictEqual(d1, d2); // same reference
});

test('getDriver() throws for unregistered driver', () => {
  const reg = new DriverRegistry();
  let threw = false;
  try {
    reg.getDriver(DriverType.NETWORK, 'nonexistent');
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('no encontrado'));
  }
  assert.strictEqual(threw, true);
});

// ─── listDrivers() ───
console.log('\nlistDrivers:');

test('listDrivers() returns all by type', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'net1', FakeNetworkDriver, {});
  reg.registerDriver(DriverType.NETWORK, 'net2', FakeNetworkDriver, {});
  reg.registerDriver(DriverType.DB, 'db1', FakeDbDriver, {});
  const netDrivers = reg.listDrivers(DriverType.NETWORK);
  assert.strictEqual(netDrivers.length, 2);
  netDrivers.forEach(d => assert.strictEqual(d.type, DriverType.NETWORK));
});

test('listDrivers() returns all when no type filter', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'net1', FakeNetworkDriver, {});
  reg.registerDriver(DriverType.DB, 'db1', FakeDbDriver, {});
  reg.registerDriver(DriverType.SAP, 'sap1', FakeSapDriver, {});
  const all = reg.listDrivers();
  assert.strictEqual(all.length, 3);
});

// ─── validateDriverCombination() ───
console.log('\nvalidateDriverCombination:');

test('validateDriverCombination() validates all three required types', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'eip', FakeNetworkDriver, {});
  reg.registerDriver(DriverType.DB, 'hana-sr', FakeDbDriver, {});
  reg.registerDriver(DriverType.SAP, 'sap-services', FakeSapDriver, {});
  const result = reg.validateDriverCombination('eip', 'hana-sr', 'sap-services');
  assert.strictEqual(result.compatible, true);
  assert.strictEqual(result.issues.length, 0);
});

test('validateDriverCombination() fails when drivers missing', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'eip', FakeNetworkDriver, {});
  const result = reg.validateDriverCombination('eip', 'hana-sr', 'sap-services');
  assert.strictEqual(result.compatible, false);
  assert.ok(result.issues.length >= 2);
});

test('validateDriverCombination() fails when name not specified', () => {
  const reg = new DriverRegistry();
  const result = reg.validateDriverCombination(null, null, null);
  assert.strictEqual(result.compatible, false);
  assert.strictEqual(result.issues.length, 3);
});

// ─── hasDriver() ───
console.log('\nhasDriver:');

test('hasDriver() returns true for registered driver', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'eip', FakeNetworkDriver, {});
  assert.strictEqual(reg.hasDriver(DriverType.NETWORK, 'eip'), true);
});

test('hasDriver() returns false for unregistered driver', () => {
  const reg = new DriverRegistry();
  assert.strictEqual(reg.hasDriver(DriverType.NETWORK, 'eip'), false);
});

// ─── clear() and unregisterDriver() ───
console.log('\nclear / unregisterDriver:');

test('clear() removes all drivers', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'n', FakeNetworkDriver, {});
  reg.registerDriver(DriverType.DB, 'd', FakeDbDriver, {});
  assert.strictEqual(reg.size, 2);
  reg.clear();
  assert.strictEqual(reg.size, 0);
});

test('unregisterDriver() removes specific driver', () => {
  const reg = new DriverRegistry();
  reg.registerDriver(DriverType.NETWORK, 'net', FakeNetworkDriver, {});
  assert.strictEqual(reg.size, 1);
  const removed = reg.unregisterDriver(DriverType.NETWORK, 'net');
  assert.strictEqual(removed, true);
  assert.strictEqual(reg.size, 0);
});

// ─── Summary ───
console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}\n`);
process.exit(failed > 0 ? 1 : 0);
