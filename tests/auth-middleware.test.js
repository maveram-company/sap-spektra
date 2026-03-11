'use strict';

// ═══════════════════════════════════════════════════════════════
//  Tests — Auth Middleware (Fase 1C: deny-by-default + claims)
//  Ejecutar: node tests/auth-middleware.test.js
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');

// Mock de dependencias AWS y logger (no disponibles fuera de Lambda)
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request === 'aws-sdk') {
    return require.resolve('./mocks/aws-sdk-mock');
  }
  if (request.includes('utilidades/logger')) {
    return require.resolve('./mocks/logger-mock');
  }
  return originalResolve.call(this, request, parent, ...args);
};

const { requireAuth, requireRole, getUser, getUserFromClaims, ROLES } = require('../lambda/utilidades/auth-middleware');

// Restaurar el resolver original
Module._resolveFilename = originalResolve;

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

// Helper: crear un JWT falso (solo para tests, API Gateway lo validaria en prod)
function crearJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

console.log('\n=== Auth Middleware Tests ===\n');

// ─── Deny-by-default ───
console.log('Deny-by-default:');

test('rechaza evento sin token ni claims (deny-by-default)', () => {
  const event = { headers: {} };
  const result = requireAuth(event);
  assert.notStrictEqual(result, null, 'Debe retornar error, no null');
  assert.strictEqual(result.statusCode, 401);
});

test('rechaza evento sin headers', () => {
  const event = {};
  const result = requireAuth(event);
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.statusCode, 401);
});

test('rechaza evento con Authorization vacio', () => {
  const event = { headers: { Authorization: '' } };
  const result = requireAuth(event);
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.statusCode, 401);
});

test('rechaza token JWT malformado', () => {
  const event = { headers: { Authorization: 'Bearer not-a-jwt' } };
  const result = requireAuth(event);
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.statusCode, 401);
});

// ─── Token expirado ───
console.log('\nExpiracion:');

test('rechaza token JWT expirado', () => {
  const token = crearJWT({
    sub: 'user-123',
    email: 'test@example.com',
    'cognito:groups': ['admins'],
    exp: Math.floor(Date.now() / 1000) - 3600, // Expirado hace 1 hora
  });
  const event = { headers: { Authorization: `Bearer ${token}` } };
  const result = requireAuth(event);
  assert.notStrictEqual(result, null, 'Debe rechazar token expirado');
  assert.strictEqual(result.statusCode, 401);
  const body = JSON.parse(result.body);
  assert.ok(body.mensaje.includes('expirado'), 'Mensaje debe indicar expiracion');
});

test('acepta token JWT no expirado', () => {
  const token = crearJWT({
    sub: 'user-123',
    email: 'test@example.com',
    'cognito:groups': ['admins'],
    exp: Math.floor(Date.now() / 1000) + 3600, // Expira en 1 hora
  });
  const event = { headers: { Authorization: `Bearer ${token}` } };
  const result = requireAuth(event);
  assert.strictEqual(result, null, 'Token valido no debe generar error');
});

// ─── Claims de API Gateway ───
console.log('\nClaims de API Gateway:');

test('acepta evento con claims validos de API Gateway', () => {
  const event = {
    headers: {},
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'user-456',
            email: 'admin@test.com',
            'cognito:username': 'admin',
            'cognito:groups': 'admins,operators',
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
        },
      },
    },
  };
  const result = requireAuth(event);
  assert.strictEqual(result, null, 'Claims validos no deben generar error');
});

test('rechaza claims expirados', () => {
  const event = {
    headers: {},
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'user-456',
            email: 'admin@test.com',
            'cognito:groups': 'admins',
            exp: Math.floor(Date.now() / 1000) - 3600,
          },
        },
      },
    },
  };
  const result = requireAuth(event);
  assert.notStrictEqual(result, null, 'Claims expirados deben ser rechazados');
  assert.strictEqual(result.statusCode, 401);
});

// ─── getUserFromClaims ───
console.log('\ngetUserFromClaims:');

test('extrae usuario desde claims correctamente', () => {
  const event = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'user-789',
            email: 'op@test.com',
            'cognito:username': 'operator1',
            'cognito:groups': 'operators',
          },
        },
      },
    },
  };
  const user = getUserFromClaims(event);
  assert.notStrictEqual(user, null);
  assert.strictEqual(user.sub, 'user-789');
  assert.strictEqual(user.email, 'op@test.com');
  assert.strictEqual(user.rol, ROLES.OPERATOR);
  assert.deepStrictEqual(user.grupos, ['operators']);
});

test('retorna null si no hay claims', () => {
  const event = { headers: {} };
  const user = getUserFromClaims(event);
  assert.strictEqual(user, null);
});

test('maneja grupos como string separados por coma', () => {
  const event = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'user-multi',
            'cognito:groups': 'admins,operators,viewers',
          },
        },
      },
    },
  };
  const user = getUserFromClaims(event);
  assert.strictEqual(user.rol, ROLES.ADMIN); // Rol mas alto
  assert.strictEqual(user.grupos.length, 3);
});

// ─── getUser con fallback ───
console.log('\ngetUser (claims > JWT fallback):');

test('prefiere claims sobre JWT', () => {
  const token = crearJWT({
    sub: 'jwt-user',
    email: 'jwt@test.com',
    'cognito:groups': ['viewers'],
  });
  const event = {
    headers: { Authorization: `Bearer ${token}` },
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'claims-user',
            email: 'claims@test.com',
            'cognito:groups': 'admins',
          },
        },
      },
    },
  };
  const user = getUser(event);
  assert.strictEqual(user.sub, 'claims-user', 'Debe preferir claims sobre JWT');
  assert.strictEqual(user.rol, ROLES.ADMIN);
});

test('hace fallback a JWT si no hay claims', () => {
  const token = crearJWT({
    sub: 'jwt-only',
    email: 'jwt@test.com',
    'cognito:groups': ['operators'],
  });
  const event = { headers: { Authorization: `Bearer ${token}` } };
  const user = getUser(event);
  assert.notStrictEqual(user, null);
  assert.strictEqual(user.sub, 'jwt-only');
  assert.strictEqual(user.rol, ROLES.OPERATOR);
});

// ─── Roles ───
console.log('\nRoles:');

test('requireRole rechaza usuario sin rol', () => {
  const token = crearJWT({
    sub: 'no-role',
    email: 'norole@test.com',
    'cognito:groups': [],
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const event = { headers: { Authorization: `Bearer ${token}` } };
  const result = requireRole(ROLES.VIEWER)(event);
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.statusCode, 403);
});

test('requireRole acepta ADMIN para OPERATOR', () => {
  const token = crearJWT({
    sub: 'admin-user',
    email: 'admin@test.com',
    'cognito:groups': ['admins'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const event = { headers: { Authorization: `Bearer ${token}` } };
  const result = requireRole(ROLES.OPERATOR)(event);
  assert.strictEqual(result, null, 'ADMIN debe poder acceder a nivel OPERATOR');
});

test('requireRole rechaza VIEWER para OPERATOR', () => {
  const token = crearJWT({
    sub: 'viewer-user',
    email: 'viewer@test.com',
    'cognito:groups': ['viewers'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const event = { headers: { Authorization: `Bearer ${token}` } };
  const result = requireRole(ROLES.OPERATOR)(event);
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.statusCode, 403);
});

// ─── Resultados ───
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
