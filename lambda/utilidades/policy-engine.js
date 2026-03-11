'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.4 — Policy Engine Unico
//  Motor de politicas para permitir/denegar operaciones.
//  Deny-by-default: si no hay regla que permita → bloquear.
//  Un solo modulo para TODO: scheduler, discovery, ejecucion,
//  simulacion, export evidence, bypass incidente.
// ═══════════════════════════════════════════════════════════════

const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const ssm = new SSMClient({});

// Cache de politicas (se recargan cada 5 minutos)
let _policiesCache = null;
let _policiesCacheTime = 0;
const POLICY_CACHE_TTL_MS = 5 * 60 * 1000;

// Acciones posibles del policy engine
const POLICY_ACTIONS = Object.freeze({
  ALLOW: 'ALLOW',
  DENY: 'DENY',
  REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
});

// Politicas por defecto (deny-by-default con excepciones minimas)
const DEFAULT_POLICIES = {
  version: '1.0',
  rules: [
    // Simulaciones siempre permitidas
    { match: { dryRun: true }, action: POLICY_ACTIONS.ALLOW, reason: 'Simulaciones siempre permitidas' },
    // Runbooks costSafe en ambientes no-PRD
    { match: { costSafe: true, environment: ['DEV', 'QAS', 'SBX'] }, action: POLICY_ACTIONS.ALLOW, reason: 'CostSafe en ambiente no productivo' },
    // Runbooks costSafe en PRD
    { match: { costSafe: true, environment: 'PRD' }, action: POLICY_ACTIONS.ALLOW, reason: 'CostSafe permitido incluso en PRD' },
    // Runbooks con costo en PRD requieren aprobacion
    { match: { costSafe: false, environment: 'PRD' }, action: POLICY_ACTIONS.REQUIRE_APPROVAL, reason: 'Runbook con costo en ambiente productivo' },
    // Severidad CRITICAL en PRD requiere aprobacion humana
    { match: { severity: 'CRITICAL', environment: 'PRD' }, action: POLICY_ACTIONS.REQUIRE_APPROVAL, reason: 'Severidad CRITICAL en PRD' },
  ],
};

/**
 * Carga politicas desde SSM Parameter Store (o usa las por defecto).
 */
async function loadPolicies() {
  if (_policiesCache && (Date.now() - _policiesCacheTime) < POLICY_CACHE_TTL_MS) {
    return _policiesCache;
  }

  try {
    const paramName = process.env.POLICIES_PARAM || '/sap-alwaysops/policies';
    const result = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: false }));
    _policiesCache = JSON.parse(result.Parameter.Value);
    _policiesCacheTime = Date.now();
    return _policiesCache;
  } catch (err) {
    if (err.name === 'ParameterNotFound') {
      _policiesCache = DEFAULT_POLICIES;
      _policiesCacheTime = Date.now();
      return _policiesCache;
    }
    // Si hay error, usar defaults
    return DEFAULT_POLICIES;
  }
}

/**
 * Evalua si un contexto coincide con una regla de politica.
 */
function matchesRule(rule, context) {
  for (const [key, expected] of Object.entries(rule.match)) {
    const actual = context[key];
    if (actual === undefined) return false; // Si el contexto no tiene el campo, la regla no aplica

    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (typeof expected === 'boolean') {
      if (actual !== expected) return false;
    } else {
      if (actual !== expected) return false;
    }
  }
  return true;
}

/**
 * Evalua una accion contra las politicas. Deny-by-default.
 *
 * @param {string} action - Tipo de accion (execute, simulate, schedule, etc.)
 * @param {object} context - Contexto de la accion
 *   - environment: string (PRD, QAS, DEV, SBX)
 *   - severity: string (LOW, MEDIUM, HIGH, CRITICAL)
 *   - costSafe: boolean
 *   - runbookId: string
 *   - dryRun: boolean
 *   - userRole: string (ADMIN, OPERATOR, VIEWER)
 *   - haEnabled: boolean
 *   - ticket: string (opcional)
 * @returns {Promise<{allowed: boolean, action: string, reason: string}>}
 */
async function evaluatePolicy(action, context) {
  const policies = await loadPolicies();

  for (const rule of policies.rules) {
    if (matchesRule(rule, context)) {
      return {
        allowed: rule.action === POLICY_ACTIONS.ALLOW,
        action: rule.action,
        reason: rule.reason,
      };
    }
  }

  // DENY-BY-DEFAULT: si ninguna regla coincidio, denegar
  return {
    allowed: false,
    action: POLICY_ACTIONS.DENY,
    reason: 'Ninguna politica autoriza esta accion (deny-by-default)',
  };
}

/**
 * Clasificacion de seguridad de runbooks (migrado de runbook-engine).
 * Compatibilidad con el flujo existente.
 */
function classifyRunbookSafety(runbookId, breach) {
  const safeRunbooks = ['RB-ASE-001', 'RB-HANA-001', 'RB-HA-001', 'RB-JVM-001', 'RB-JVM-002', 'RB-PO-001', 'RB-ABAP-001'];
  if (safeRunbooks.includes(runbookId)) {
    return { level: 'SAFE', reason: `${runbookId} es costSafe=true, sin cambios de infraestructura` };
  }

  const riskyRunbooks = ['RB-ASE-002', 'RB-HANA-002'];
  if (riskyRunbooks.includes(runbookId)) {
    return { level: 'RISKY', reason: `${runbookId} modifica infraestructura (EBS), requiere aprobacion` };
  }

  if (breach && breach.severity === 'CRITICAL' && (breach.env === 'PRD' || breach.landscape === 'PRD')) {
    return { level: 'REQUIRES_HUMAN', reason: 'Severidad CRITICAL en ambiente productivo' };
  }

  return { level: 'SAFE', reason: 'Clasificacion por defecto' };
}

module.exports = {
  POLICY_ACTIONS,
  DEFAULT_POLICIES,
  evaluatePolicy,
  classifyRunbookSafety,
  loadPolicies,
  matchesRule,
};
