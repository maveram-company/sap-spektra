'use strict';

// =============================================================================
// SAP Spektra v1.0 - Middleware de Autenticacion y Autorizacion
// =============================================================================
// Valida tokens JWT de Cognito y aplica control de acceso basado en roles.
// API Gateway ya verifica la firma del token, aqui solo decodificamos el
// payload para extraer grupos y datos del usuario.
// =============================================================================

const { DynamoDB } = require('aws-sdk');
const logger = require('../utilidades/logger');

// ---------------------------------------------------------------------------
// Constantes de roles - jerarquia de mayor a menor privilegio
// ---------------------------------------------------------------------------
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  VIEWER: 'VIEWER',
});

// Nivel numerico de cada rol (mas alto = mas privilegio)
const NIVEL_ROL = Object.freeze({
  [ROLES.ADMIN]: 30,
  [ROLES.OPERATOR]: 20,
  [ROLES.VIEWER]: 10,
});

// Mapeo de nombre de grupo de Cognito al rol interno
const MAPEO_GRUPOS = Object.freeze({
  admins: ROLES.ADMIN,
  operators: ROLES.OPERATOR,
  viewers: ROLES.VIEWER,
});

// ---------------------------------------------------------------------------
// Cliente de DynamoDB para el registro de auditoria
// ---------------------------------------------------------------------------
const dynamodb = new DynamoDB.DocumentClient();
const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || 'SAPSentinel-AuditLog';

// ---------------------------------------------------------------------------
// Funciones auxiliares internas
// ---------------------------------------------------------------------------

/**
 * Decodifica el payload (segunda parte) de un token JWT desde Base64URL.
 * No verifica la firma porque API Gateway ya lo hizo.
 *
 * @param {string} token - Token JWT completo (header.payload.signature)
 * @returns {object|null} - Payload decodificado o null si falla
 */
function decodificarPayloadJWT(token) {
  try {
    const partes = token.split('.');
    if (partes.length !== 3) {
      logger.warn('Token JWT con formato invalido: no tiene 3 segmentos');
      return null;
    }

    // El payload es la segunda parte; viene en Base64URL
    const payloadBase64 = partes[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const payloadJSON = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    return JSON.parse(payloadJSON);
  } catch (error) {
    logger.error('Error al decodificar el payload del JWT', { error: error.message });
    return null;
  }
}

/**
 * Extrae el token Bearer del header Authorization.
 *
 * @param {object} event - Evento de API Gateway / Lambda
 * @returns {string|null} - Token sin el prefijo "Bearer " o null si no existe
 */
function extraerToken(event) {
  // Los headers pueden venir en distintas mayusculas/minusculas
  const headers = event.headers || {};
  const authHeader =
    headers.Authorization ||
    headers.authorization ||
    headers.AUTHORIZATION ||
    '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

/**
 * Determina el rol mas alto del usuario a partir de sus grupos de Cognito.
 *
 * @param {string[]} grupos - Lista de grupos de Cognito
 * @returns {string|null} - Rol mas alto encontrado o null
 */
function determinarRol(grupos) {
  if (!Array.isArray(grupos) || grupos.length === 0) {
    return null;
  }

  let rolMasAlto = null;
  let nivelMasAlto = -1;

  for (const grupo of grupos) {
    const nombreGrupo = grupo.toLowerCase();
    const rol = MAPEO_GRUPOS[nombreGrupo];

    if (rol && NIVEL_ROL[rol] > nivelMasAlto) {
      rolMasAlto = rol;
      nivelMasAlto = NIVEL_ROL[rol];
    }
  }

  return rolMasAlto;
}

// ---------------------------------------------------------------------------
// Funciones publicas
// ---------------------------------------------------------------------------

/**
 * Extrae usuario desde claims ya validados por API Gateway (Cognito authorizer).
 * Esta es la fuente preferida: API Gateway ya verifico la firma del JWT.
 *
 * @param {object} event - Evento de API Gateway
 * @returns {object|null} - Datos del usuario o null si no hay claims
 */
function getUserFromClaims(event) {
  // API Gateway HTTP API con JWT authorizer
  const claims = event.requestContext?.authorizer?.jwt?.claims
    || event.requestContext?.authorizer?.claims;

  if (!claims) return null;

  // Los grupos pueden venir como string separado por comas o como array
  let grupos = claims['cognito:groups'] || [];
  if (typeof grupos === 'string') {
    grupos = grupos.split(',').map(g => g.trim()).filter(Boolean);
  }

  const rol = determinarRol(grupos);

  return {
    sub: claims.sub || null,
    email: claims.email || null,
    username: claims['cognito:username'] || claims.username || null,
    grupos,
    rol,
  };
}

/**
 * Extrae la informacion del usuario autenticado desde el evento de Lambda.
 * Intenta primero usar claims validados por API Gateway (mas seguro).
 * Si no hay claims, hace fallback a decodificar el JWT manualmente.
 *
 * @param {object} event - Evento de API Gateway / Lambda
 * @returns {object|null} - Datos del usuario o null si no hay token valido
 *   - sub: ID unico del usuario en Cognito
 *   - email: correo electronico
 *   - username: nombre de usuario
 *   - grupos: array de grupos de Cognito
 *   - rol: rol determinado (ADMIN, OPERATOR, VIEWER)
 */
function getUser(event) {
  // Preferir claims validados por API Gateway (fuente segura)
  const userFromClaims = getUserFromClaims(event);
  if (userFromClaims) {
    return userFromClaims;
  }

  // Fallback: decodificar JWT manualmente (para invocaciones Lambda-to-Lambda)
  const token = extraerToken(event);
  if (!token) {
    logger.debug('No se encontro token ni claims en el evento');
    return null;
  }

  const payload = decodificarPayloadJWT(token);
  if (!payload) {
    return null;
  }

  const grupos = payload['cognito:groups'] || [];
  const rol = determinarRol(grupos);

  return {
    sub: payload.sub || null,
    email: payload.email || null,
    username: payload['cognito:username'] || payload.username || null,
    grupos,
    rol,
  };
}

/**
 * Valida que el evento contenga un token JWT valido.
 * Si no hay token o es invalido, devuelve una respuesta 401.
 *
 * @param {object} event - Evento de API Gateway / Lambda
 * @returns {object|null} - Respuesta 401 si falla, o null si el token es valido
 *
 * Ejemplo de uso:
 *   const authError = requireAuth(event);
 *   if (authError) return authError;
 */
function requireAuth(event) {
  // DENY-BY-DEFAULT: si no se puede verificar la identidad, denegar acceso
  const ruta = event.path || event.rawPath || 'desconocida';
  const metodo = event.httpMethod || event.requestContext?.http?.method || 'desconocido';

  // 1. Intentar usar claims validados por API Gateway (fuente mas segura)
  const userFromClaims = getUserFromClaims(event);
  if (userFromClaims) {
    // Validacion defensiva de expiracion (incluso si API Gateway ya valido)
    const claims = event.requestContext?.authorizer?.jwt?.claims
      || event.requestContext?.authorizer?.claims;
    if (claims && claims.exp) {
      const expTime = typeof claims.exp === 'number' ? claims.exp : parseInt(claims.exp, 10);
      if (expTime < Math.floor(Date.now() / 1000)) {
        logger.warn('Solicitud rechazada: token expirado (claims)', { ruta, metodo });
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'No autorizado',
            mensaje: 'El token ha expirado. Inicia sesion nuevamente.',
          }),
        };
      }
    }
    return null; // Claims validos
  }

  // 2. Fallback: verificar JWT del header Authorization
  const token = extraerToken(event);

  if (!token) {
    logger.warn('Solicitud rechazada: no se proporciono token ni claims de autenticacion', {
      ruta, metodo,
    });

    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'No autorizado',
        mensaje: 'Se requiere un token de autenticacion valido en el header Authorization.',
      }),
    };
  }

  const payload = decodificarPayloadJWT(token);

  if (!payload) {
    logger.warn('Solicitud rechazada: token JWT invalido o corrupto', { ruta });

    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'No autorizado',
        mensaje: 'El token proporcionado es invalido o esta corrupto.',
      }),
    };
  }

  // Validacion defensiva de expiracion
  if (payload.exp) {
    const expTime = typeof payload.exp === 'number' ? payload.exp : parseInt(payload.exp, 10);
    if (expTime < Math.floor(Date.now() / 1000)) {
      logger.warn('Solicitud rechazada: token expirado (JWT)', { ruta, sub: payload.sub });
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'No autorizado',
          mensaje: 'El token ha expirado. Inicia sesion nuevamente.',
        }),
      };
    }
  }

  // Token valido
  return null;
}

/**
 * Middleware que verifica que el usuario tenga al menos el rol minimo requerido.
 * Primero valida autenticacion y luego verifica el rol.
 * Devuelve una respuesta 401/403 si falla, o null si todo esta bien.
 *
 * @param {string} rolMinimo - Rol minimo requerido (ADMIN, OPERATOR, VIEWER)
 * @returns {function} - Funcion que recibe el event y devuelve respuesta de error o null
 *
 * Ejemplo de uso:
 *   const authError = requireRole(ROLES.OPERATOR)(event);
 *   if (authError) return authError;
 */
function requireRole(rolMinimo) {
  // Verificar que el rol solicitado sea valido
  if (!NIVEL_ROL[rolMinimo]) {
    logger.error('Rol invalido proporcionado a requireRole', { rolMinimo });
    throw new Error(`Rol invalido: "${rolMinimo}". Usa ROLES.ADMIN, ROLES.OPERATOR o ROLES.VIEWER.`);
  }

  return function verificarRol(event) {
    // Primero verificar autenticacion
    const authError = requireAuth(event);
    if (authError) {
      return authError;
    }

    // Obtener datos del usuario
    const usuario = getUser(event);

    if (!usuario || !usuario.rol) {
      logger.warn('Solicitud rechazada: usuario sin rol asignado', {
        sub: usuario?.sub || 'desconocido',
        grupos: usuario?.grupos || [],
        ruta: event.path || event.rawPath || 'desconocida',
      });

      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Acceso denegado',
          mensaje: 'No tienes un rol asignado. Contacta al administrador.',
        }),
      };
    }

    // Comparar nivel del rol del usuario contra el minimo requerido
    const nivelUsuario = NIVEL_ROL[usuario.rol];
    const nivelRequerido = NIVEL_ROL[rolMinimo];

    if (nivelUsuario < nivelRequerido) {
      logger.warn('Solicitud rechazada: rol insuficiente', {
        sub: usuario.sub,
        email: usuario.email,
        rolUsuario: usuario.rol,
        rolRequerido: rolMinimo,
        ruta: event.path || event.rawPath || 'desconocida',
      });

      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Acceso denegado',
          mensaje: `Se requiere rol ${rolMinimo} o superior. Tu rol actual es ${usuario.rol}.`,
        }),
      };
    }

    // Acceso permitido
    logger.info('Acceso autorizado', {
      sub: usuario.sub,
      email: usuario.email,
      rol: usuario.rol,
      rolRequerido: rolMinimo,
      ruta: event.path || event.rawPath || 'desconocida',
    });

    return null;
  };
}

// ---------------------------------------------------------------------------
// AuditLog - Registro de auditoria en DynamoDB
// ---------------------------------------------------------------------------

/**
 * Escribe un registro de auditoria en la tabla de DynamoDB.
 * Incluye evidencia del estado antes y despues de la accion, ademas
 * del requestId para trazabilidad completa.
 *
 * @param {object} opciones - Datos del registro de auditoria
 * @param {object} opciones.event - Evento original de Lambda (para extraer requestId y usuario)
 * @param {string} opciones.accion - Descripcion de la accion realizada (ej: "CREAR_ALERTA")
 * @param {string} opciones.recurso - Recurso afectado (ej: "alertas/ALT-001")
 * @param {object} [opciones.antes] - Estado del recurso ANTES de la accion (evidencia)
 * @param {object} [opciones.despues] - Estado del recurso DESPUES de la accion (evidencia)
 * @param {string} [opciones.resultado] - Resultado de la accion ("EXITO" o "ERROR")
 * @param {object} [opciones.metadata] - Datos adicionales para contexto
 * @returns {Promise<object>} - Resultado de la operacion de escritura en DynamoDB
 */
async function auditLog({ event, accion, recurso, antes = null, despues = null, resultado = 'EXITO', metadata = {} }) {
  // Extraer informacion del usuario y del request
  const usuario = getUser(event);
  const requestId =
    event.requestContext?.requestId ||
    event.requestContext?.extendedRequestId ||
    'sin-request-id';

  const timestamp = new Date().toISOString();

  // Construir el registro de auditoria
  const registro = {
    PK: `AUDIT#${timestamp.slice(0, 10)}`,           // Particion por dia
    SK: `${timestamp}#${requestId}`,                   // Ordenado por timestamp + requestId
    tipo: 'AUDIT_LOG',
    timestamp,
    requestId,
    accion,
    recurso,
    resultado,
    usuario: {
      sub: usuario?.sub || 'sistema',
      email: usuario?.email || 'desconocido',
      username: usuario?.username || 'desconocido',
      rol: usuario?.rol || 'NINGUNO',
    },
    evidencia: {
      antes,
      despues,
    },
    metadata,
    // TTL opcional: 90 dias desde ahora (en segundos epoch)
    ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60),
  };

  try {
    await dynamodb.put({
      TableName: AUDIT_LOG_TABLE,
      Item: registro,
    }).promise();

    logger.info('Registro de auditoria guardado', {
      accion,
      recurso,
      resultado,
      requestId,
      usuario: registro.usuario.email,
    });

    return registro;
  } catch (error) {
    // No lanzamos el error para no interrumpir el flujo principal,
    // pero lo registramos como error critico
    logger.error('Error al guardar registro de auditoria', {
      error: error.message,
      accion,
      recurso,
      requestId,
    });

    return null;
  }
}

// ---------------------------------------------------------------------------
// Exportaciones
// ---------------------------------------------------------------------------
module.exports = {
  requireAuth,
  requireRole,
  getUser,
  getUserFromClaims,
  auditLog,
  ROLES,
};
