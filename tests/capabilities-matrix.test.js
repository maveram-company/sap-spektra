'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Capabilities Matrix (Fase 3C)
//  Ejecutar: node tests/capabilities-matrix.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const { buildCapabilitiesFromDiscovery, canExecuteRunbook } = require('../lambda/utilidades/capabilities-matrix');

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

console.log('\n=== Capabilities Matrix Tests ===\n');

// --- buildCapabilitiesFromDiscovery ---
console.log('buildCapabilitiesFromDiscovery:');

test('retorna defaults cuando discoveryResult es null', () => {
  const caps = buildCapabilitiesFromDiscovery(null);
  assert.strictEqual(caps.dbType, 'unknown');
  assert.strictEqual(caps.osType, 'unknown');
  assert.strictEqual(caps.product, 'unknown');
  assert.strictEqual(caps.haEnabled, false);
  assert.strictEqual(caps.canRunSSM.enabled, false);
});

test('detecta HANA cuando hana.found=true', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
    hana: { found: true, version: '2.0' },
  });
  assert.strictEqual(caps.dbType, 'HANA');
  assert.strictEqual(caps.canCollectDBMetrics.enabled, true);
  assert.strictEqual(caps.canCollectDBMetrics.reasonCode, 'HANA_DETECTED');
});

test('detecta ASE desde profiles', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
    profiles: [{ components: 'ASE 16.0', instanceName: 'DVEBMGS00' }],
  });
  assert.strictEqual(caps.dbType, 'ASE');
  assert.strictEqual(caps.canCollectDBMetrics.enabled, true);
});

test('detecta MaxDB desde profiles', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
    profiles: [{ components: 'MaxDB 7.9', instanceName: 'DVEBMGS00' }],
  });
  assert.strictEqual(caps.dbType, 'MAXDB');
});

test('detecta SSM connectivity cuando hay SIDs', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
  });
  assert.strictEqual(caps.canRunSSM.enabled, true);
  assert.strictEqual(caps.canRunSSM.reasonCode, 'SSM_CONNECTED');
});

test('detecta HA cluster', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
    haCluster: { type: 'Pacemaker' },
  });
  assert.strictEqual(caps.haEnabled, true);
  assert.strictEqual(caps.canMonitorHA.enabled, true);
});

test('detecta HSR', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
    hsrState: { mode: 'sync' },
  });
  assert.strictEqual(caps.haEnabled, true);
  assert.strictEqual(caps.canMonitorHA.enabled, true);
  assert.strictEqual(caps.canMonitorHA.reasonCode, 'HSR_DETECTED');
});

test('runbooks disponibles cuando SSM + DB detectados', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
    hana: { found: true },
  });
  assert.strictEqual(caps.canExecuteRunbooks.enabled, true);
  assert.strictEqual(caps.canExecuteRunbooks.reasonCode, 'FULLY_CAPABLE');
});

test('runbooks parciales cuando SSM ok pero sin DB', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
  });
  assert.strictEqual(caps.canExecuteRunbooks.enabled, true);
  assert.strictEqual(caps.canExecuteRunbooks.reasonCode, 'PARTIAL_NO_DB');
});

test('detecta producto desde profiles ABAP', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'sap-omp-01',
    profiles: [{ instanceName: 'DVEBMGS00' }],
  });
  assert.strictEqual(caps.product, 'SAP ABAP');
});

test('detecta producto desde profiles Java', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['PO1'],
    hostname: 'sap-po-01',
    profiles: [{ instanceName: 'J01' }],
  });
  assert.strictEqual(caps.product, 'SAP Java');
});

test('usa product directamente si viene en discovery', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['S4H'],
    hostname: 'sap-s4-01',
    product: 'S/4HANA',
  });
  assert.strictEqual(caps.product, 'S/4HANA');
});

// --- canExecuteRunbook ---
console.log('\ncanExecuteRunbook:');

test('permite runbook cuando todas las capabilities estan', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'h1',
    hana: { found: true },
  });
  const result = canExecuteRunbook(caps, 'RB-HANA-001');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.missing.length, 0);
});

test('bloquea runbook de BD si no hay DB metrics', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'h1',
    // sin hana ni profiles con DB
  });
  const result = canExecuteRunbook(caps, 'RB-ASE-001');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.missing.includes('DB metrics collection'));
  assert.ok(result.howToFix.length > 0);
});

test('bloquea runbook HA si no hay HA monitoring', () => {
  const caps = buildCapabilitiesFromDiscovery({
    sids: ['OMP'],
    hostname: 'h1',
    hana: { found: true },
    // sin haCluster ni hsrState
  });
  const result = canExecuteRunbook(caps, 'RB-HA-001');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.missing.includes('HA monitoring'));
});

test('bloquea si no hay SSM connectivity', () => {
  const caps = buildCapabilitiesFromDiscovery(null);
  const result = canExecuteRunbook(caps, 'RB-ASE-001');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.missing.includes('SSM connectivity'));
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
