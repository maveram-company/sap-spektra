'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.4 — Mensajes Estandarizados
//  Formato unico para errores, exitos y notificaciones.
//  "No mas 'Internal error' sin pasos accionables."
// ═══════════════════════════════════════════════════════════════

/**
 * Crea un mensaje estandarizado con next steps.
 *
 * @param {object} params
 * @param {string} params.title - Titulo corto (1 linea)
 * @param {string} params.summary - Resumen (1-2 oraciones)
 * @param {string} params.whatHappened - Que paso
 * @param {string} params.why - Por que paso
 * @param {string[]} params.nextSteps - Lista de pasos siguientes
 * @param {string} [params.severity] - LOW, MEDIUM, HIGH, CRITICAL
 * @param {object} [params.metadata] - Datos adicionales
 * @returns {object}
 */
function formatMessage({ title, summary, whatHappened, why, nextSteps = [], severity = 'INFO', metadata = {} }) {
  return {
    title,
    summary,
    whatHappened,
    why,
    nextSteps,
    severity,
    metadata,
    referenceId: metadata.executionId || metadata.requestId || null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Formatea un error con contexto y pasos accionables.
 */
function formatError(error, context = {}) {
  const message = typeof error === 'string' ? error : error.message;
  const code = error.code || 'UNKNOWN_ERROR';

  // Mapear errores comunes a mensajes accionables
  const errorGuides = {
    'MISSING_FACTS': {
      why: 'No se encontraron datos suficientes del sistema para ejecutar la operacion.',
      nextSteps: ['Ejecutar discovery en el sistema', 'Verificar conectividad SSM', 'Revisar que el agente SSM este activo'],
    },
    'SID_LOCKED': {
      why: 'Otro runbook ya esta ejecutandose en este SID.',
      nextSteps: ['Esperar a que termine la ejecucion actual', 'Verificar en el historial si hay ejecuciones colgadas', 'Contactar al operador que inicio la ejecucion'],
    },
    'POLICY_DENIED': {
      why: 'La politica de seguridad no permite esta operacion.',
      nextSteps: ['Verificar la politica activa en /sap-alwaysops/policies', 'Solicitar aprobacion si aplica', 'Contactar al administrador para excepciones'],
    },
    'CHANGE_WINDOW_BLOCKED': {
      why: 'La operacion esta fuera de la ventana de cambio permitida.',
      nextSteps: ['Verificar la ventana de cambio del ambiente', 'Solicitar bypass con aprobacion reforzada', 'Esperar a la proxima ventana de mantenimiento'],
    },
    'CAPABILITY_MISSING': {
      why: 'El sistema no tiene las capacidades necesarias para este runbook.',
      nextSteps: ['Revisar la matriz de capacidades del sistema', 'Instalar componentes faltantes', 'Verificar la configuracion de discovery'],
    },
  };

  const guide = errorGuides[code] || {
    why: 'Error inesperado durante la operacion.',
    nextSteps: ['Revisar los logs de CloudWatch para mas detalles', 'Contactar al equipo de soporte con el referenceId'],
  };

  return formatMessage({
    title: `Error: ${code}`,
    summary: message,
    whatHappened: message,
    why: guide.why,
    nextSteps: guide.nextSteps,
    severity: context.severity || 'HIGH',
    metadata: {
      ...context,
      errorCode: code,
      errorStack: error.stack ? error.stack.split('\n').slice(0, 3) : null,
    },
  });
}

/**
 * Formatea un resultado exitoso.
 */
function formatSuccess(result, context = {}) {
  return formatMessage({
    title: result.title || 'Operacion completada',
    summary: result.summary || `${context.runbookId || 'Operacion'} ejecutado exitosamente en ${context.sid || 'sistema'}`,
    whatHappened: result.whatHappened || 'La operacion se completo sin errores.',
    why: result.why || 'Todos los pasos se ejecutaron correctamente.',
    nextSteps: result.nextSteps || ['Verificar metricas del sistema', 'Monitorear por 15 minutos para confirmar estabilidad'],
    severity: 'INFO',
    metadata: {
      ...context,
      executionId: result.executionId,
      duration: result.duration,
    },
  });
}

module.exports = {
  formatMessage,
  formatError,
  formatSuccess,
};
