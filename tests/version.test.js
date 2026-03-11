'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — version.json
//  Ejecutar: node tests/version.test.js
// ═══════════════════════════════════════════════════════════════

process.env.MOCK = 'true';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

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

console.log('\n=== version.json Tests ===\n');

// ─── File Existence ───
console.log('File Existence:');

const versionPath = path.resolve(__dirname, '..', 'version.json');

test('version.json file exists', () => {
  assert.ok(fs.existsSync(versionPath), `File not found: ${versionPath}`);
});

test('version.json is valid JSON', () => {
  const raw = fs.readFileSync(versionPath, 'utf8');
  const data = JSON.parse(raw); // Will throw if invalid
  assert.ok(typeof data === 'object');
});

// ─── Required Fields ───
console.log('\nRequired Fields:');

const version = require(versionPath);

test('contains product field', () => {
  assert.ok(version.product, 'Missing product field');
  assert.strictEqual(typeof version.product, 'string');
});

test('contains version field', () => {
  assert.ok(version.version, 'Missing version field');
  assert.strictEqual(typeof version.version, 'string');
});

test('contains codename field', () => {
  assert.ok(version.codename, 'Missing codename field');
  assert.strictEqual(typeof version.codename, 'string');
});

test('contains buildDate field', () => {
  assert.ok(version.buildDate, 'Missing buildDate field');
  assert.strictEqual(typeof version.buildDate, 'string');
});

// ─── Version Format ───
console.log('\nVersion Format:');

test('version matches semver pattern (X.Y.Z)', () => {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  assert.ok(
    semverRegex.test(version.version),
    `Version "${version.version}" does not match semver pattern X.Y.Z`
  );
});

test('product is SAP-Spektra', () => {
  assert.strictEqual(version.product, 'SAP-Spektra');
});

test('version is 1.5.0', () => {
  assert.strictEqual(version.version, '1.5.0');
});

test('buildDate is valid ISO format', () => {
  const date = new Date(version.buildDate);
  assert.ok(!isNaN(date.getTime()), `buildDate "${version.buildDate}" is not a valid date`);
});

// ─── Optional Fields ───
console.log('\nOptional Fields:');

test('contains description field', () => {
  assert.ok(version.description);
  assert.strictEqual(typeof version.description, 'string');
});

test('contains minCfnVersion field', () => {
  assert.ok(version.minCfnVersion);
  assert.strictEqual(typeof version.minCfnVersion, 'string');
});

// ─── Summary ───
console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}\n`);
process.exit(failed > 0 ? 1 : 0);
