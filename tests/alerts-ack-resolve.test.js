'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Alerts ACK vs Resolve (Fase 5)
//  Ejecutar: node tests/alerts-ack-resolve.test.js
//
//  Valida la logica de negocio de alertas:
//  - ACK (Tomar en gestion): idempotente, guarda ackBy/ackAt
//  - Resolve: requiere resolutionNote + resolutionCategory
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');

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

console.log('\n=== Alerts ACK vs Resolve Tests ===\n');

// --- Simular la logica del mock-dashboard ---

// Modelo de alerta con campos nuevos
function createTestAlert(overrides = {}) {
  return {
    id: 1,
    sys: 'OMP',
    lv: 'critical',
    title: 'Test alert',
    msg: 'Test message',
    time: '14:32',
    esc: 'L1',
    ack: false,
    ackBy: null,
    ackAt: null,
    st: 'active',
    rb: 'RB-ASE-001',
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    resolutionCategory: null,
    ...overrides,
  };
}

// Logica de ACK (replica de ackA en mock-dashboard)
function ackAlert(alert, userEmail) {
  if (alert && !alert.ack) {
    alert.ack = true;
    alert.ackBy = userEmail;
    alert.ackAt = new Date().toISOString();
    return true; // cambio aplicado
  }
  return false; // ya estaba en gestion (idempotente)
}

// Validacion de resolve (replica de confirmResolve en mock-dashboard)
const VALID_CATEGORIES = ['false_positive', 'mitigated', 'accepted_risk', 'fixed', 'workaround_applied'];

function resolveAlert(alert, userEmail, note, category) {
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return { error: 'resolutionCategory invalida o faltante' };
  }
  if (!note || !note.trim()) {
    return { error: 'resolutionNote es obligatoria' };
  }
  alert.st = 'resolved';
  alert.resolvedBy = userEmail;
  alert.resolvedAt = new Date().toISOString();
  alert.resolutionNote = note.trim();
  alert.resolutionCategory = category;
  return { success: true };
}

// --- ACK Tests ---
console.log('ACK (Tomar en gestion):');

test('ACK establece ack=true, ackBy y ackAt', () => {
  const alert = createTestAlert();
  const result = ackAlert(alert, 'operador@avvale.com');
  assert.strictEqual(result, true);
  assert.strictEqual(alert.ack, true);
  assert.strictEqual(alert.ackBy, 'operador@avvale.com');
  assert.ok(alert.ackAt);
  assert.ok(new Date(alert.ackAt).getTime() > 0, 'ackAt debe ser ISO date valido');
});

test('ACK es idempotente (no duplica si ya esta en gestion)', () => {
  const alert = createTestAlert({ ack: true, ackBy: 'admin@avvale.com', ackAt: '2026-01-01T00:00:00Z' });
  const result = ackAlert(alert, 'otro@avvale.com');
  assert.strictEqual(result, false); // no cambio
  assert.strictEqual(alert.ackBy, 'admin@avvale.com'); // mantiene el original
  assert.strictEqual(alert.ackAt, '2026-01-01T00:00:00Z');
});

test('ACK no cambia el estado de la alerta (sigue active)', () => {
  const alert = createTestAlert();
  ackAlert(alert, 'operador@avvale.com');
  assert.strictEqual(alert.st, 'active');
});

test('ACK preserva campos existentes', () => {
  const alert = createTestAlert({ rb: 'RB-HANA-001', sys: 'OCP' });
  ackAlert(alert, 'operador@avvale.com');
  assert.strictEqual(alert.rb, 'RB-HANA-001');
  assert.strictEqual(alert.sys, 'OCP');
  assert.strictEqual(alert.resolvedBy, null);
  assert.strictEqual(alert.resolutionNote, null);
});

// --- Resolve Tests ---
console.log('\nResolve:');

test('Resolve exitoso con nota y categoria', () => {
  const alert = createTestAlert();
  const result = resolveAlert(alert, 'admin@avvale.com', 'Reinicio de servicio', 'fixed');
  assert.deepStrictEqual(result, { success: true });
  assert.strictEqual(alert.st, 'resolved');
  assert.strictEqual(alert.resolvedBy, 'admin@avvale.com');
  assert.ok(alert.resolvedAt);
  assert.strictEqual(alert.resolutionNote, 'Reinicio de servicio');
  assert.strictEqual(alert.resolutionCategory, 'fixed');
});

test('Resolve falla sin nota', () => {
  const alert = createTestAlert();
  const result = resolveAlert(alert, 'admin@avvale.com', '', 'fixed');
  assert.ok(result.error);
  assert.strictEqual(alert.st, 'active'); // no cambio
});

test('Resolve falla sin categoria', () => {
  const alert = createTestAlert();
  const result = resolveAlert(alert, 'admin@avvale.com', 'Nota valida', '');
  assert.ok(result.error);
  assert.strictEqual(alert.st, 'active');
});

test('Resolve falla con categoria invalida', () => {
  const alert = createTestAlert();
  const result = resolveAlert(alert, 'admin@avvale.com', 'Nota', 'invalid_category');
  assert.ok(result.error);
  assert.strictEqual(alert.st, 'active');
});

test('Todas las categorias validas son aceptadas', () => {
  for (const cat of VALID_CATEGORIES) {
    const alert = createTestAlert({ id: VALID_CATEGORIES.indexOf(cat) + 100 });
    const result = resolveAlert(alert, 'admin@avvale.com', 'Nota para ' + cat, cat);
    assert.deepStrictEqual(result, { success: true }, `Categoria ${cat} debe ser valida`);
    assert.strictEqual(alert.resolutionCategory, cat);
  }
});

test('Resolve trim la nota', () => {
  const alert = createTestAlert();
  resolveAlert(alert, 'admin@avvale.com', '  Nota con espacios  ', 'mitigated');
  assert.strictEqual(alert.resolutionNote, 'Nota con espacios');
});

// --- Modelo de datos ---
console.log('\nModelo de datos:');

test('alerta nueva tiene todos los campos de auditoria', () => {
  const alert = createTestAlert();
  assert.strictEqual(alert.ack, false);
  assert.strictEqual(alert.ackBy, null);
  assert.strictEqual(alert.ackAt, null);
  assert.strictEqual(alert.resolvedBy, null);
  assert.strictEqual(alert.resolvedAt, null);
  assert.strictEqual(alert.resolutionNote, null);
  assert.strictEqual(alert.resolutionCategory, null);
});

test('flujo completo: ACK luego Resolve', () => {
  const alert = createTestAlert();
  // Paso 1: Tomar en gestion
  ackAlert(alert, 'operador@avvale.com');
  assert.strictEqual(alert.ack, true);
  assert.strictEqual(alert.st, 'active');
  // Paso 2: Resolver
  const result = resolveAlert(alert, 'operador@avvale.com', 'Problema resuelto con reinicio', 'fixed');
  assert.deepStrictEqual(result, { success: true });
  assert.strictEqual(alert.st, 'resolved');
  assert.strictEqual(alert.resolvedBy, 'operador@avvale.com');
  assert.strictEqual(alert.resolutionNote, 'Problema resuelto con reinicio');
});

test('Resolve directo sin ACK previo funciona', () => {
  const alert = createTestAlert();
  assert.strictEqual(alert.ack, false);
  const result = resolveAlert(alert, 'admin@avvale.com', 'Falso positivo', 'false_positive');
  assert.deepStrictEqual(result, { success: true });
  assert.strictEqual(alert.st, 'resolved');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
