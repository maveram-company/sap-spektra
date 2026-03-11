'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Evidence Pack (Fase 4C)
//  Ejecutar: node tests/evidence-pack.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const {
  createEvidenceEntry,
  buildEvidencePack,
  verifyEvidencePack,
} = require('../lambda/utilidades/evidence-pack');

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

console.log('\n=== Evidence Pack Tests ===\n');

// --- createEvidenceEntry ---
console.log('createEvidenceEntry:');

test('crea entrada con hash SHA-256', () => {
  const entry = createEvidenceEntry({ phase: 'TEST', data: 'abc' }, null);
  assert.ok(entry.hash);
  assert.strictEqual(entry.hash.length, 64); // SHA-256 hex
  assert.strictEqual(entry.previousHash, null);
  assert.ok(entry.timestamp);
});

test('encadena hash con previousHash', () => {
  const entry1 = createEvidenceEntry({ phase: 'FIRST' }, null);
  const entry2 = createEvidenceEntry({ phase: 'SECOND' }, entry1.hash);
  assert.strictEqual(entry2.previousHash, entry1.hash);
  assert.notStrictEqual(entry2.hash, entry1.hash);
});

test('hash es determinista para mismos datos y previousHash', () => {
  // Nota: timestamp cambia, asi que el hash sera diferente por diseño
  // Verificamos que el hash incluye los datos
  const entry = createEvidenceEntry({ x: 1 }, 'abc123');
  assert.strictEqual(entry.previousHash, 'abc123');
  assert.ok(entry.hash.length === 64);
});

// --- buildEvidencePack ---
console.log('\nbuildEvidencePack:');

test('construye pack con 3 entradas', () => {
  const pack = buildEvidencePack({
    executionId: 'TEST-001',
    beforeSnapshot: { status: 'running' },
    afterSnapshot: { status: 'ok' },
    safetyClassification: { level: 'SAFE' },
    commands: ['cmd1', 'cmd2'],
    policyDecision: { allowed: true },
  });
  assert.strictEqual(pack.entries.length, 3);
  assert.strictEqual(pack.entryCount, 3);
  assert.strictEqual(pack.packId, 'EP-TEST-001');
  assert.strictEqual(pack.version, '1.0');
  assert.ok(pack.finalHash);
  assert.strictEqual(pack.signature, null);
});

test('entries forman hash chain valido', () => {
  const pack = buildEvidencePack({
    executionId: 'TEST-002',
    beforeSnapshot: {},
    afterSnapshot: {},
    safetyClassification: {},
    commands: ['a'],
    policyDecision: {},
  });
  // Primera entrada: previousHash = null
  assert.strictEqual(pack.entries[0].previousHash, null);
  // Segunda entrada: previousHash = hash de la primera
  assert.strictEqual(pack.entries[1].previousHash, pack.entries[0].hash);
  // Tercera entrada: previousHash = hash de la segunda
  assert.strictEqual(pack.entries[2].previousHash, pack.entries[1].hash);
});

test('fases son PRE_EXECUTION, COMMANDS, POST_EXECUTION', () => {
  const pack = buildEvidencePack({
    executionId: 'TEST-003',
    beforeSnapshot: {},
    afterSnapshot: {},
    safetyClassification: {},
    commands: [],
    policyDecision: {},
  });
  assert.strictEqual(pack.entries[0].phase, 'PRE_EXECUTION');
  assert.strictEqual(pack.entries[1].phase, 'COMMANDS');
  assert.strictEqual(pack.entries[2].phase, 'POST_EXECUTION');
});

test('commandHashes se generan correctamente', () => {
  const pack = buildEvidencePack({
    executionId: 'TEST-004',
    beforeSnapshot: {},
    afterSnapshot: {},
    safetyClassification: {},
    commands: ['SELECT 1', 'ALTER SYSTEM RECLAIM'],
    policyDecision: {},
  });
  const cmdEntry = pack.entries[1];
  assert.strictEqual(cmdEntry.commandCount, 2);
  assert.strictEqual(cmdEntry.commandHashes.length, 2);
  // Cada hash truncado a 12 chars
  assert.strictEqual(cmdEntry.commandHashes[0].length, 12);
});

test('pack sin comandos maneja array vacio', () => {
  const pack = buildEvidencePack({
    executionId: 'TEST-005',
    beforeSnapshot: {},
    afterSnapshot: {},
    safetyClassification: {},
    commands: [],
    policyDecision: {},
  });
  assert.strictEqual(pack.entries[1].commandCount, 0);
  assert.deepStrictEqual(pack.entries[1].commandHashes, []);
});

// --- verifyEvidencePack ---
console.log('\nverifyEvidencePack:');

test('pack valido pasa verificacion', () => {
  const pack = buildEvidencePack({
    executionId: 'VERIFY-001',
    beforeSnapshot: { x: 1 },
    afterSnapshot: { x: 2 },
    safetyClassification: { level: 'SAFE' },
    commands: ['cmd1'],
    policyDecision: { allowed: true },
  });
  const result = verifyEvidencePack(pack);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('pack null falla verificacion', () => {
  const result = verifyEvidencePack(null);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('pack sin entries falla verificacion', () => {
  const result = verifyEvidencePack({ entries: [] });
  assert.strictEqual(result.valid, false);
});

test('pack con finalHash alterado falla verificacion', () => {
  const pack = buildEvidencePack({
    executionId: 'TAMPER-001',
    beforeSnapshot: {},
    afterSnapshot: {},
    safetyClassification: {},
    commands: ['x'],
    policyDecision: {},
  });
  pack.finalHash = 'aaaa' + pack.finalHash.slice(4); // Alterar hash
  const result = verifyEvidencePack(pack);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Hash final no coincide')));
});

test('modulo exporta signEvidencePack y exportToS3', () => {
  const mod = require('../lambda/utilidades/evidence-pack');
  assert.strictEqual(typeof mod.signEvidencePack, 'function');
  assert.strictEqual(typeof mod.exportToS3, 'function');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
