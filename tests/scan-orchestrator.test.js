'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Scan Orchestrator (Integration - Mock Mode)
//  Ejecutar: node tests/scan-orchestrator.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const { ScanManager } = require('../setup/lib/scan-orchestrator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  }).catch(e => {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  });
}

async function runTests() {
  console.log('\n=== Scan Orchestrator Tests (Mock Mode) ===\n');

  // ─── Initialization ───
  console.log('Initialization:');

  await test('creates ScanManager with default options', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 2 });
    assert.ok(sm);
  });

  // ─── Single Scan ───
  console.log('\nSingle Scan:');

  await test('startScan returns a scan ID', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 3, phaseDelayMin: 10, phaseDelayMax: 20 });
    const scanId = sm.startScan('i-test001', 'us-east-1', 'Linux');
    assert.ok(scanId);
    assert.strictEqual(typeof scanId, 'string');
  });

  await test('scan starts in queued status', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 3, phaseDelayMin: 10, phaseDelayMax: 20 });
    const scanId = sm.startScan('i-test002', 'us-east-1', 'Linux');
    const allStatuses = sm.getAllScans();
    const scan = allStatuses.find(s => s.scanId === scanId);
    assert.ok(scan);
    assert.ok(['queued', 'running'].includes(scan.status));
  });

  await test('scan completes with success and results', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 3, phaseDelayMin: 5, phaseDelayMax: 10 });
    const scanId = sm.startScan('i-test003', 'us-east-1', 'Linux');

    // Wait for completion
    await new Promise((resolve) => {
      sm.on('scanComplete', (data) => {
        if (data.scanId === scanId) resolve();
      });
      // Timeout fallback
      setTimeout(resolve, 3000);
    });

    const allStatuses = sm.getAllScans();
    const scan = allStatuses.find(s => s.scanId === scanId);
    assert.strictEqual(scan.status, 'success');
    assert.strictEqual(scan.progress, 100);
    assert.ok(scan.results);
    assert.ok(scan.results.sap || scan.results.sid);
  });

  await test('scan results have expected SAP fields', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 3, phaseDelayMin: 5, phaseDelayMax: 10 });
    const scanId = sm.startScan('i-test004', 'us-east-1', 'Linux');

    await new Promise((resolve) => {
      sm.on('scanComplete', (data) => {
        if (data.scanId === scanId) resolve();
      });
      setTimeout(resolve, 3000);
    });

    const statuses = sm.getAllScans();
    const scan = statuses.find(s => s.scanId === scanId);
    const r = scan.results;

    // Check for nested or flat result structure
    const hasSap = (r.sap && r.sap.sid) || r.sid;
    assert.ok(hasSap, 'Results should contain SID (nested or flat)');

    const hasKernel = (r.kernel && typeof r.kernel === 'object') ? r.kernel.version : r.kernel;
    assert.ok(hasKernel, 'Results should contain kernel info');
  });

  // ─── Batch Scan ───
  console.log('\nBatch Scan:');

  await test('batchStart scans multiple instances', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 5, phaseDelayMin: 5, phaseDelayMax: 10 });
    const instances = [
      { instanceId: 'i-batch001', platform: 'Linux' },
      { instanceId: 'i-batch002', platform: 'Linux' },
      { instanceId: 'i-batch003', platform: 'Windows' },
    ];
    const results = sm.startBatchScan(instances, 'us-east-1');
    assert.strictEqual(results.length, 3);
    assert.ok(results.every(r => typeof r.scanId === 'string'));
    assert.ok(results.every(r => typeof r.instanceId === 'string'));
  });

  await test('all batch scans complete successfully', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 5, phaseDelayMin: 5, phaseDelayMax: 10 });
    const instances = [
      { instanceId: 'i-batchA', platform: 'Linux' },
      { instanceId: 'i-batchB', platform: 'Linux' },
    ];
    sm.startBatchScan(instances, 'us-east-1');

    // Wait for all to complete
    await new Promise((resolve) => {
      let completed = 0;
      sm.on('scanComplete', () => {
        completed++;
        if (completed >= 2) resolve();
      });
      setTimeout(resolve, 5000);
    });

    const statuses = sm.getAllScans();
    const allSuccess = statuses.every(s => s.status === 'success');
    assert.ok(allSuccess, 'All batch scans should succeed in mock mode');
  });

  // ─── Concurrency Control ───
  console.log('\nConcurrency Control:');

  await test('respects concurrency limit', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 2, phaseDelayMin: 50, phaseDelayMax: 80 });
    const instances = [
      { instanceId: 'i-conc001', platform: 'Linux' },
      { instanceId: 'i-conc002', platform: 'Linux' },
      { instanceId: 'i-conc003', platform: 'Linux' },
      { instanceId: 'i-conc004', platform: 'Linux' },
    ];
    sm.startBatchScan(instances, 'us-east-1');

    // Check that at most 2 are running at once
    await new Promise(resolve => setTimeout(resolve, 30));
    const statuses = sm.getAllScans();
    const running = statuses.filter(s => s.status === 'running').length;
    assert.ok(running <= 2, `Expected at most 2 running, got ${running}`);
  });

  // ─── Events ───
  console.log('\nEvents:');

  await test('emits scan:phase events', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 3, phaseDelayMin: 5, phaseDelayMax: 10 });
    let phaseEvents = 0;
    sm.on('scan:phase', () => { phaseEvents++; });
    sm.startScan('i-evt001', 'us-east-1', 'Linux');

    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(phaseEvents > 0, 'Should receive scan:phase events');
  });

  await test('emits scan:success event with results', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 3, phaseDelayMin: 5, phaseDelayMax: 10 });
    const scanId = sm.startScan('i-evt002', 'us-east-1', 'Linux');

    const result = await new Promise((resolve) => {
      sm.on('scan:success', (data) => {
        if (data.scanId === scanId) resolve(data);
      });
      setTimeout(() => resolve(null), 3000);
    });

    assert.ok(result, 'Should receive scan:success event');
    assert.strictEqual(result.scanId, scanId);
  });

  // ─── Reset ───
  console.log('\nReset:');

  await test('resetAll clears all scans', async () => {
    const sm = new ScanManager({ mockMode: true, concurrency: 3, phaseDelayMin: 5, phaseDelayMax: 10 });
    sm.startScan('i-reset001', 'us-east-1', 'Linux');
    await new Promise(resolve => setTimeout(resolve, 200));
    sm.reset();
    const statuses = sm.getAllScans();
    assert.strictEqual(statuses.length, 0);
  });

  // ─── Summary ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
