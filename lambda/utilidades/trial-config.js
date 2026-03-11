// ============================================================================
//  Avvale SAP AlwaysOps v1.0 — H33: TRIAL MODE CONFIGURATION
//  Módulo compartido para controlar el modo de operación del sistema
//  TRIAL = mínimo costo, toda la funcionalidad
//  PRODUCTION = rendimiento completo
// ============================================================================

'use strict';

/**
 * Configuración del Modo Trial vs Producción
 *
 * En modo TRIAL todo funciona pero con recursos mínimos:
 * - Polling cada 30 min en vez de 5 min
 * - Retención de datos 7 días en vez de 90
 * - Lambda con 128 MB en vez de 256-512 MB
 * - AI limitado a 5 consultas/día
 * - Runbooks en modo simulación (no ejecutan realmente)
 * - Notificaciones solo por email
 * - Sin reportes programados (solo bajo demanda)
 */

const log = require('./logger')('trial-config');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const ssm = new SSMClient({});

// ── Cache para evitar llamadas repetidas a SSM ──
let cachedSystemModes = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de cache

// ── Configuraciones por modo ──
const MODE_CONFIGS = {
  TRIAL: {
    label: 'Trial',
    description: 'Modo de prueba con costo mínimo',

    // Monitoreo
    pollingIntervalMinutes: 30,        // Cada 30 min (vs 5 en prod)
    metricsRetentionDays: 7,           // 7 días de retención (vs 90)
    maxMetricsPerCollection: 10,       // Máx 10 métricas (vs ilimitado)

    // AI / Bedrock
    aiEnabled: true,
    aiMaxCallsPerDay: 5,               // Máx 5 llamadas a Bedrock/día
    aiModel: 'anthropic.claude-3-haiku-20240307', // Modelo más barato
    aiMaxTokens: 500,                  // Tokens reducidos

    // Runbooks
    runbookExecutionMode: 'SIMULATE',  // Solo simula, no ejecuta
    runbookMaxPerDay: 3,               // Máx 3 simulaciones/día
    runbookChaining: false,            // Sin encadenamiento

    // Notificaciones
    notificationChannels: ['email'],   // Solo email
    notificationBatching: true,        // Agrupar notificaciones
    notificationBatchWindowMinutes: 60, // Ventana de 1 hora
    maxNotificationsPerDay: 10,        // Máx 10/día

    // Reportes
    scheduledReports: false,           // Sin reportes automáticos
    onDemandReports: true,             // Reportes bajo demanda sí
    complianceMapping: false,          // Sin mapeo de compliance

    // Capacity Planning
    capacityPlanningEnabled: true,
    capacityLookbackDays: 7,           // Solo 7 días (vs 30)

    // DR / HA
    drDrillsEnabled: false,            // Sin simulacros DR
    haMonitoringInterval: 60,          // Cada 60 min (vs 5)

    // Dashboard
    dashboardRefreshSeconds: 120,      // Refresh cada 2 min (vs 30s)
    maxSystemsInTrial: 3,              // Máx 3 sistemas en trial

    // Escalation
    escalationEnabled: true,
    escalationLevels: 1,               // Solo L1 (vs L1/L2/L3)

    // Approval
    approvalTimeout: 24,               // 24 horas (vs configurable)
    autoApproveInTrial: true,          // Auto-aprobar en trial

    // Costo estimado
    estimatedMonthlyCostUSD: { min: 3, max: 8 }
  },

  PRODUCTION: {
    label: 'Producción',
    description: 'Modo completo para ambientes productivos',

    // Monitoreo
    pollingIntervalMinutes: 5,
    metricsRetentionDays: 90,
    maxMetricsPerCollection: 100,

    // AI / Bedrock
    aiEnabled: true,
    aiMaxCallsPerDay: 1000,
    aiModel: 'anthropic.claude-3-haiku-20240307',
    aiMaxTokens: 2000,

    // Runbooks
    runbookExecutionMode: 'EXECUTE',
    runbookMaxPerDay: 100,
    runbookChaining: true,

    // Notificaciones
    notificationChannels: ['email', 'slack', 'teams', 'servicenow'],
    notificationBatching: false,
    notificationBatchWindowMinutes: 0,
    maxNotificationsPerDay: 1000,

    // Reportes
    scheduledReports: true,
    onDemandReports: true,
    complianceMapping: true,

    // Capacity Planning
    capacityPlanningEnabled: true,
    capacityLookbackDays: 30,

    // DR / HA
    drDrillsEnabled: true,
    haMonitoringInterval: 5,

    // Dashboard
    dashboardRefreshSeconds: 30,
    maxSystemsInTrial: 999,

    // Escalation
    escalationEnabled: true,
    escalationLevels: 3,

    // Approval
    approvalTimeout: 4,
    autoApproveInTrial: false,

    // Costo estimado
    estimatedMonthlyCostUSD: { min: 45, max: 80 }
  }
};

/**
 * Obtiene el modo de un sistema específico desde SSM Parameter Store
 * @param {string} systemId - ID del sistema SAP
 * @returns {Promise<string>} 'TRIAL' o 'PRODUCTION'
 */
async function getSystemMode(systemId) {
  try {
    // Primero revisar cache
    if (cachedSystemModes && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
      if (cachedSystemModes[systemId]) {
        return cachedSystemModes[systemId];
      }
    }

    // Leer configuración desde SSM
    const configParam = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems';
    const result = await ssm.send(new GetParameterCommand({
      Name: configParam,
      WithDecryption: true
    }));

    const systems = JSON.parse(result.Parameter.Value);

    // Construir cache de modos
    cachedSystemModes = {};
    cacheTimestamp = Date.now();

    for (const sys of (Array.isArray(systems) ? systems : [systems])) {
      const id = sys.systemId || sys.sid || sys.id;
      cachedSystemModes[id] = sys.mode || sys.operationMode || 'PRODUCTION';
    }

    return cachedSystemModes[systemId] || 'PRODUCTION';

  } catch (err) {
    log.warn('No se pudo obtener modo, usando PRODUCTION', { systemId, error: err.message });
    return 'PRODUCTION';
  }
}

/**
 * Obtiene la configuración completa para un sistema según su modo
 * @param {string} systemId - ID del sistema
 * @returns {Promise<Object>} Configuración del modo
 */
async function getSystemConfig(systemId) {
  const mode = await getSystemMode(systemId);
  return {
    mode,
    ...MODE_CONFIGS[mode],
    systemId
  };
}

/**
 * Verifica si un sistema está en modo trial
 * @param {string} systemId - ID del sistema
 * @returns {Promise<boolean>}
 */
async function isTrialMode(systemId) {
  const mode = await getSystemMode(systemId);
  return mode === 'TRIAL';
}

/**
 * Verifica si una acción está permitida según el modo y los límites diarios
 * @param {string} systemId - ID del sistema
 * @param {string} actionType - Tipo: 'ai_call', 'runbook', 'notification', 'report'
 * @param {number} currentDailyCount - Conteo actual del día
 * @returns {Promise<{allowed: boolean, reason: string, mode: string}>}
 */
async function checkActionAllowed(systemId, actionType, currentDailyCount = 0) {
  const config = await getSystemConfig(systemId);

  const limits = {
    ai_call: config.aiMaxCallsPerDay,
    runbook: config.runbookMaxPerDay,
    notification: config.maxNotificationsPerDay,
  };

  const limit = limits[actionType];
  if (limit !== undefined && currentDailyCount >= limit) {
    return {
      allowed: false,
      reason: `Límite diario alcanzado para ${actionType}: ${currentDailyCount}/${limit} (modo ${config.mode})`,
      mode: config.mode
    };
  }

  // Verificar si la feature está habilitada
  const featureChecks = {
    dr_drill: config.drDrillsEnabled,
    compliance: config.complianceMapping,
    scheduled_report: config.scheduledReports,
    runbook_chain: config.runbookChaining,
  };

  if (featureChecks[actionType] === false) {
    return {
      allowed: false,
      reason: `${actionType} deshabilitado en modo ${config.mode}`,
      mode: config.mode
    };
  }

  return { allowed: true, reason: 'OK', mode: config.mode };
}

/**
 * Obtiene la configuración del modo sin consultar SSM (para uso offline)
 * Útil cuando ya sabes el modo del sistema
 * @param {string} mode - 'TRIAL' o 'PRODUCTION'
 * @returns {Object} Configuración del modo
 */
function getModeConfig(mode) {
  return MODE_CONFIGS[mode] || MODE_CONFIGS.PRODUCTION;
}

/**
 * Resetea el cache (útil para testing)
 */
function resetCache() {
  cachedSystemModes = null;
  cacheTimestamp = 0;
}

module.exports = {
  MODE_CONFIGS,
  getSystemMode,
  getSystemConfig,
  isTrialMode,
  checkActionAllowed,
  getModeConfig,
  resetCache,
  CACHE_TTL_MS
};
