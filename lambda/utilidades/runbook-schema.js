'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.4 — Runbook Schema Declarativo
//  Define runbooks como JSON validado con prechecks, steps y rollback.
//  "No strings libres" — todo pasa por validacion estricta.
// ═══════════════════════════════════════════════════════════════

// Campos requeridos en un runbook declarativo
const REQUIRED_FIELDS = ['id', 'version', 'description', 'steps'];

// Niveles de riesgo permitidos
const RISK_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/**
 * Valida que un runbook declarativo cumpla con el schema.
 *
 * @param {object} definition - Definicion del runbook
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateRunbookSchema(definition) {
  const errors = [];

  if (!definition || typeof definition !== 'object') {
    return { valid: false, errors: ['La definicion del runbook debe ser un objeto'] };
  }

  // Campos requeridos
  for (const field of REQUIRED_FIELDS) {
    if (!definition[field]) {
      errors.push(`Campo requerido faltante: ${field}`);
    }
  }

  // ID formato
  if (definition.id && !/^RB-[A-Z]+-\d{3}$/.test(definition.id) && !/^RB-CUSTOM-\d{3}$/.test(definition.id)) {
    errors.push(`ID de runbook invalido: "${definition.id}". Formato esperado: RB-XXX-NNN`);
  }

  // Version formato semver simple
  if (definition.version && !/^\d+\.\d+$/.test(definition.version)) {
    errors.push(`Version invalida: "${definition.version}". Formato esperado: X.Y`);
  }

  // Steps deben ser array no vacio
  if (definition.steps) {
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
      errors.push('steps debe ser un array no vacio');
    } else {
      definition.steps.forEach((step, i) => {
        if (!step.id) errors.push(`step[${i}]: falta campo 'id'`);
        if (!step.command && !step.action) errors.push(`step[${i}]: falta 'command' o 'action'`);
      });
    }
  }

  // Prechecks (opcional pero si existe debe ser array)
  if (definition.prechecks && !Array.isArray(definition.prechecks)) {
    errors.push('prechecks debe ser un array');
  }

  // Rollback (opcional pero si existe debe ser array)
  if (definition.rollback && !Array.isArray(definition.rollback)) {
    errors.push('rollback debe ser un array');
  }

  // Risk level
  if (definition.riskLevel && !RISK_LEVELS.includes(definition.riskLevel)) {
    errors.push(`riskLevel invalido: "${definition.riskLevel}". Permitidos: ${RISK_LEVELS.join(', ')}`);
  }

  // AllowedCommands (si existe, debe ser array de strings)
  if (definition.allowedCommands) {
    if (!Array.isArray(definition.allowedCommands)) {
      errors.push('allowedCommands debe ser un array de strings');
    } else {
      definition.allowedCommands.forEach((cmd, i) => {
        if (typeof cmd !== 'string') errors.push(`allowedCommands[${i}]: debe ser string`);
      });
    }
  }

  // RequiredFacts (si existe, debe ser array de strings)
  if (definition.requiredFacts) {
    if (!Array.isArray(definition.requiredFacts)) {
      errors.push('requiredFacts debe ser un array de strings');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Evalua prechecks de un runbook contra el contexto actual.
 *
 * @param {object[]} prechecks - Lista de prechecks
 * @param {object} context - Contexto de ejecucion (capabilities, facts, etc.)
 * @returns {{passed: boolean, failed: object[]}}
 */
function evaluatePrechecks(prechecks, context) {
  if (!prechecks || prechecks.length === 0) {
    return { passed: true, failed: [] };
  }

  const failed = [];

  for (const check of prechecks) {
    switch (check.type) {
      case 'capability': {
        const cap = context.capabilities?.[check.requires];
        if (!cap || !cap.enabled) {
          failed.push({
            type: 'capability',
            requires: check.requires,
            reason: cap?.howToFix || `Capacidad ${check.requires} no disponible`,
          });
        }
        break;
      }
      case 'fact': {
        const factValue = getNestedValue(context.facts, check.path);
        if (factValue === undefined) {
          failed.push({ type: 'fact', path: check.path, reason: `Fact no encontrado: ${check.path}` });
        } else if (check.operator && check.value !== undefined) {
          if (!compareValues(factValue, check.operator, check.value)) {
            failed.push({ type: 'fact', path: check.path, reason: `Fact ${check.path} = ${factValue}, esperado ${check.operator} ${check.value}` });
          }
        }
        break;
      }
      case 'changeWindow': {
        if (context.changeWindow === false) {
          failed.push({ type: 'changeWindow', reason: 'Fuera de ventana de cambio' });
        }
        break;
      }
      default:
        failed.push({ type: check.type, reason: `Tipo de precheck desconocido: ${check.type}` });
    }
  }

  return { passed: failed.length === 0, failed };
}

// Helpers internos
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function compareValues(actual, operator, expected) {
  switch (operator) {
    case '<': return actual < expected;
    case '>': return actual > expected;
    case '<=': return actual <= expected;
    case '>=': return actual >= expected;
    case '==': return actual == expected; // eslint-disable-line eqeqeq
    case '!=': return actual != expected; // eslint-disable-line eqeqeq
    default: return false;
  }
}

module.exports = {
  RISK_LEVELS,
  validateRunbookSchema,
  evaluatePrechecks,
};
