'use strict';

// ═══════════════════════════════════════════════════════════════
//  Test Runner — Avvale SAP AlwaysOps v1.5
//  Ejecutar: node tests/run-all.js
// ═══════════════════════════════════════════════════════════════

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  // ── v1.4 Original Tests ──
  'circuit-breaker.test.js',
  'logger.test.js',
  'classifier.test.js',
  'scan-orchestrator.test.js',
  'auth-middleware.test.js',
  'input-validator.test.js',
  'execution-lock.test.js',
  'execution-model.test.js',
  'capabilities-matrix.test.js',
  'policy-engine.test.js',
  'evidence-pack.test.js',
  'dry-run-simulator.test.js',
  'alerts-ack-resolve.test.js',
  // ── v1.5 HA Drivers ──
  'ha-drivers/base-driver.test.js',
  'ha-drivers/driver-registry.test.js',
  'ha-drivers/plan-builder.test.js',
  'ha-drivers/step-executor.test.js',
  // ── v1.5 Network Drivers ──
  'ha-drivers/network/eip-driver.test.js',
  'ha-drivers/network/route53-driver.test.js',
  'ha-drivers/network/pacemaker-vip-driver.test.js',
  // ── v1.5 DB Drivers ──
  'ha-drivers/db/hana-sr-driver.test.js',
  'ha-drivers/db/declarative-db-driver.test.js',
  // ── v1.5 SAP Driver ──
  'ha-drivers/sap/sap-services-driver.test.js',
  // ── v1.5 HA Prerequisites + Integration ──
  'ha-prerequisites.test.js',
  'version.test.js',
  'ha-integration.test.js',
];

const root = path.dirname(__dirname);
let totalPassed = 0;
let totalFailed = 0;

console.log('╔══════════════════════════════════════════════╗');
console.log('║  Avvale SAP AlwaysOps v1.5 — Test Suite     ║');
console.log('╚══════════════════════════════════════════════╝\n');

for (const testFile of tests) {
  const testPath = path.join(__dirname, testFile);
  try {
    const output = execSync(`node "${testPath}"`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MOCK: 'true' },
    });
    console.log(output);
    // Parse results
    const match = output.match(/Results: (\d+) passed, (\d+) failed/);
    if (match) {
      totalPassed += parseInt(match[1]);
      totalFailed += parseInt(match[2]);
    }
  } catch (e) {
    console.log(e.stdout || '');
    console.log(e.stderr || '');
    const match = (e.stdout || '').match(/Results: (\d+) passed, (\d+) failed/);
    if (match) {
      totalPassed += parseInt(match[1]);
      totalFailed += parseInt(match[2]);
    } else {
      totalFailed++;
    }
  }
}

console.log('╔══════════════════════════════════════════════╗');
console.log(`║  TOTAL: ${totalPassed} passed, ${totalFailed} failed${' '.repeat(Math.max(0, 25 - String(totalPassed).length - String(totalFailed).length))}║`);
console.log('╚══════════════════════════════════════════════╝');

process.exit(totalFailed > 0 ? 1 : 0);
