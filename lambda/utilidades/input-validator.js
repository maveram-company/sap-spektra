// ============================================================================
//  SAP Spektra v2.0 — Validador de Inputs
//  Módulo compartido para sanitizar y validar entradas de usuario.
//  Previene inyección de comandos, JSON malformado y datos inválidos.
// ============================================================================

'use strict';

/**
 * Parsea JSON de forma segura. Retorna null si el JSON es inválido.
 * Reemplaza todos los JSON.parse(event.body) sin try-catch en las Lambdas.
 *
 * @param {string|object} body - String JSON o objeto ya parseado
 * @returns {object|null} - Objeto parseado o null si falla
 */
function safeParse(body) {
  if (body === null || body === undefined) return null;
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Valida un SAP System ID (SID).
 * SIDs son exactamente 3 caracteres alfanuméricos en mayúsculas.
 * Previene inyección de comandos shell vía SID en template literals.
 *
 * @param {string} sid - System ID a validar
 * @returns {string} - SID validado
 * @throws {Error} - Si el formato es inválido
 */
function sanitizeSid(sid) {
  if (!sid || typeof sid !== 'string') {
    throw new Error('SID es requerido y debe ser string');
  }
  const trimmed = sid.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{2}$/.test(trimmed)) {
    throw new Error(`SID invalido: "${sid}". Debe ser 3 caracteres alfanumericos (ej: OMP, S4H, CRP)`);
  }
  return trimmed;
}

/**
 * Valida un nombre de función SAP (sapcontrol -function <nombre>).
 * Solo permite caracteres alfanuméricos y guiones bajos.
 *
 * @param {string} fnName - Nombre de función a validar
 * @returns {string} - Nombre validado
 * @throws {Error} - Si contiene caracteres no permitidos
 */
function sanitizeFunctionName(fnName) {
  if (!fnName || typeof fnName !== 'string') {
    throw new Error('Nombre de funcion es requerido');
  }
  if (!/^[A-Za-z0-9_]+$/.test(fnName)) {
    throw new Error(`Nombre de funcion invalido: "${fnName}". Solo alfanumerico y guiones bajos.`);
  }
  return fnName;
}

/**
 * Valida un EC2 Instance ID.
 * Formato: i- seguido de 8 a 17 caracteres hexadecimales.
 *
 * @param {string} instanceId - Instance ID a validar
 * @returns {string} - Instance ID validado
 * @throws {Error} - Si el formato es inválido
 */
function sanitizeInstanceId(instanceId) {
  if (!instanceId || typeof instanceId !== 'string') {
    throw new Error('Instance ID es requerido');
  }
  if (!/^i-[a-f0-9]{8,17}$/.test(instanceId)) {
    throw new Error(`Instance ID invalido: "${instanceId}". Formato esperado: i-0a1b2c3d4e5f6`);
  }
  return instanceId;
}

/**
 * Valida un ARN de AWS.
 * Formato básico: arn:aws:service:region:account:resource
 *
 * @param {string} arn - ARN a validar
 * @returns {string} - ARN validado
 * @throws {Error} - Si el formato es inválido
 */
function sanitizeArn(arn) {
  if (!arn || typeof arn !== 'string') {
    throw new Error('ARN es requerido');
  }
  if (!/^arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:\d{12}:.+$/.test(arn)) {
    throw new Error(`ARN invalido: "${arn}"`);
  }
  return arn;
}

/**
 * Valida un AWS Profile Name (para credenciales locales).
 * Solo alfanumérico, guiones y guiones bajos.
 *
 * @param {string} profileName - Nombre de perfil
 * @returns {string} - Nombre validado
 * @throws {Error} - Si contiene caracteres peligrosos
 */
function sanitizeProfileName(profileName) {
  if (!profileName || typeof profileName !== 'string') {
    throw new Error('Profile name es requerido');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(profileName)) {
    throw new Error(`Profile name invalido: "${profileName}". Solo alfanumerico, guiones y guiones bajos.`);
  }
  return profileName;
}

/**
 * Valida un email básico.
 *
 * @param {string} email - Email a validar
 * @returns {string} - Email validado (lowercase)
 * @throws {Error} - Si el formato es inválido
 */
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Email es requerido');
  }
  const trimmed = email.trim().toLowerCase();
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    throw new Error(`Email invalido: "${email}"`);
  }
  return trimmed;
}

/**
 * Valida un nombre de stack de CloudFormation.
 * Formato: alfanumérico + guiones, 1-128 chars, empieza con letra.
 *
 * @param {string} stackName - Nombre del stack
 * @returns {string} - Nombre validado
 * @throws {Error} - Si el formato es inválido
 */
function sanitizeStackName(stackName) {
  if (!stackName || typeof stackName !== 'string') {
    throw new Error('Stack name es requerido');
  }
  if (!/^[a-zA-Z][a-zA-Z0-9-]{0,127}$/.test(stackName)) {
    throw new Error(`Stack name invalido: "${stackName}". Debe empezar con letra, solo alfanumerico y guiones, max 128 chars.`);
  }
  return stackName;
}

/**
 * Valida un subcomando de base de datos (para dbmcli, isql, etc).
 * Usa whitelist por runbook: solo permite subcomandos conocidos y seguros.
 * Si el runbook no esta en la whitelist, aplica blacklist como fallback.
 *
 * @param {string} subcommand - Subcomando a validar
 * @param {string} [runbookId] - ID del runbook para validacion por whitelist
 * @returns {string} - Subcomando validado
 * @throws {Error} - Si el subcomando no esta permitido
 */

// Whitelist de subcomandos permitidos por runbook
const ALLOWED_DB_SUBCOMMANDS = {
  'RB-ASE-001': ['dump tran', 'sp_who', 'sp_lock', 'SELECT'],
  'RB-ASE-002': ['df -h', 'Get-Volume'],
  'RB-ASE-003': ['dump tran', 'df -h', 'Get-Volume'],
  'RB-HANA-001': ['ALTER SYSTEM RECLAIM', 'ALTER SYSTEM CLEAR', 'SELECT'],
  'RB-HANA-002': ['SELECT', 'df -h', 'Get-Volume'],
  'RB-HA-001': ['resume log transfer'],
  'RB-MAXDB-001': ['db_state', 'db_online', 'backup_history_list', 'info'],
  'RB-BACKUP-001': ['SELECT', 'backup_history_list'],
};

function sanitizeDbSubcommand(subcommand, runbookId) {
  if (!subcommand || typeof subcommand !== 'string') {
    throw new Error('Subcomando de BD es requerido');
  }

  // Si hay runbookId, usar whitelist estricta
  if (runbookId && ALLOWED_DB_SUBCOMMANDS[runbookId]) {
    const allowed = ALLOWED_DB_SUBCOMMANDS[runbookId];
    const isAllowed = allowed.some(cmd => subcommand.trim().startsWith(cmd));
    if (!isAllowed) {
      throw new Error(
        `Subcomando "${subcommand}" no permitido para runbook ${runbookId}. ` +
        `Permitidos: ${allowed.join(', ')}`
      );
    }
    return subcommand;
  }

  // Fallback para custom runbooks: blacklist de metacaracteres peligrosos
  // ADVERTENCIA: esto es menos seguro que la whitelist
  const dangerous = /[;&|`$(){}[\]<>!\\]/;
  if (dangerous.test(subcommand)) {
    throw new Error(`Subcomando de BD contiene caracteres prohibidos: "${subcommand}"`);
  }

  // Bloquear saltos de linea sueltos (posible inyeccion multi-linea)
  if (/[\r\n]/.test(subcommand) && !subcommand.includes('<<EOSQL')) {
    throw new Error('Subcomando de BD contiene saltos de linea no permitidos');
  }

  return subcommand;
}

/**
 * Valida una lista de comandos contra la whitelist de un runbook.
 * Cada comando se verifica individualmente.
 *
 * @param {string[]} commands - Lista de comandos a validar
 * @param {string} runbookId - ID del runbook
 * @returns {string[]} - Comandos validados
 * @throws {Error} - Si algun comando no esta permitido
 */
function sanitizeRunbookCommands(commands, runbookId) {
  if (!Array.isArray(commands)) {
    throw new Error('commands debe ser un array');
  }
  if (!runbookId || typeof runbookId !== 'string') {
    throw new Error('runbookId es requerido');
  }

  // Validacion basica: no permitir metacaracteres de shell peligrosos en ningun comando
  const shellDangerous = /[`]|\$\(|\|\||&&/;
  for (const cmd of commands) {
    if (typeof cmd !== 'string') {
      throw new Error('Cada comando debe ser un string');
    }
    if (shellDangerous.test(cmd)) {
      throw new Error(`Comando contiene metacaracteres de shell peligrosos: "${cmd.slice(0, 80)}..."`);
    }
  }

  return commands;
}

module.exports = {
  safeParse,
  sanitizeSid,
  sanitizeFunctionName,
  sanitizeInstanceId,
  sanitizeArn,
  sanitizeProfileName,
  sanitizeEmail,
  sanitizeStackName,
  sanitizeDbSubcommand,
  sanitizeRunbookCommands,
  ALLOWED_DB_SUBCOMMANDS,
};
