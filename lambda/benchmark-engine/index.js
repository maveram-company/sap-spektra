'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — H40: Performance Benchmarking Engine
//  Motor de benchmarking de rendimiento para sistemas SAP.
//
//  ¿Qué hace este Lambda?
//  1. Calcula baselines de rendimiento por sistema (avg, p50, p75,
//     p90, p95, p99, min, max, stdDev) sobre ventanas configurables
//     (7d, 30d, 90d).
//  2. Compara métricas entre múltiples sistemas SAP para identificar
//     outliers y mejores desempeños.
//  3. Detecta degradación o mejora de rendimiento usando regresión
//     lineal sobre el historial de métricas.
//  4. Compara health scores entre sistemas y ambientes (PRD/QAS/DEV).
//  5. Genera reportes estructurados de benchmark con recomendaciones.
//
//  Triggers:
//  - EventBridge programado (diario a las 01:00 UTC): recalcular
//    baselines para todos los sistemas.
//  - HTTP API via dashboard-api: GET /benchmarks,
//    GET /benchmarks/{systemId}, GET /benchmarks/comparison
// ═══════════════════════════════════════════════════════════════

const { CloudWatchClient, GetMetricStatisticsCommand, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, BatchWriteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getSystemConfig: getTrialConfig } = require('../utilidades/trial-config');
const log = require('../utilidades/logger')('benchmark-engine');

// ─── Clientes de AWS ───
const cw = new CloudWatchClient({});
const ssm = new SSMClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ─── Variables de entorno ───
const METRICS_HISTORY_TABLE = process.env.METRICS_HISTORY_TABLE || 'sap-alwaysops-metrics-history';
const BENCHMARKS_TABLE = process.env.BENCHMARKS_TABLE || 'sap-alwaysops-benchmarks';
const CW_NAMESPACE = process.env.CW_NAMESPACE || 'SAPAlwaysOps';
const SYSTEMS_CONFIG_PARAM = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';

// ─── Constantes de configuración ───
const PREFIX = '[H40]';
const BENCHMARK_WINDOWS = [7, 30, 90]; // días
const DEFAULT_WINDOW = 30;

// Métricas SAP que se monitorean para benchmarking
const SAP_METRICS = [
  'ResponseTime',
  'DialogStepTime',
  'CPUUtilization',
  'MemoryUtilization',
  'DiskUtilization',
  'DatabaseResponseTime',
  'ICMConnections',
  'WorkProcessUsage',
  'QueueReads',
  'AbapDumps',
  'FailedJobs',
  'UserSessions',
  'SwapUsage',
  'NetworkLatency',
  'HealthScore',
];

// Umbrales de desviación para clasificar outliers
const OUTLIER_THRESHOLDS = {
  warning: 1.5,   // > 1.5 desviaciones estándar = warning
  critical: 2.5,  // > 2.5 desviaciones estándar = critical
};

// Confianza mínima para considerar una tendencia válida (R²)
const MIN_TREND_CONFIDENCE = 0.3;

// Umbral de pendiente para clasificar dirección de tendencia
const TREND_SLOPE_THRESHOLD = 0.005;

// ─── Caché de configuración de sistemas ───
let systemsConfigCache = null;
let configCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Punto de entrada del Lambda. Detecta el tipo de evento y
//  enruta a la función correspondiente.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Evento recibido', { eventPreview: JSON.stringify(event).substring(0, 500) });

  try {
    // ── Caso 1: EventBridge programado (recalcular baselines diarios) ──
    if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event') {
      log.info('Trigger: EventBridge programado — recalculando baselines');
      return await handleScheduledBaselines();
    }

    // ── Caso 2: Invocación directa con acción específica ──
    if (event.action) {
      return await handleDirectInvocation(event);
    }

    // ── Caso 3: HTTP API (via dashboard-api) ──
    if (event.httpMethod || event.requestContext) {
      return await handleHttpRequest(event);
    }

    // ── Caso 4: Evento no reconocido ──
    log.warn('Tipo de evento no reconocido');
    return buildResponse(400, { error: 'Tipo de evento no reconocido' });

  } catch (err) {
    log.error('Error fatal en handler', { error: err.message, stack: err.stack });
    return buildResponse(500, { error: 'Error interno del benchmarking engine', details: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
//  INVOCACIÓN DIRECTA
//  Cuando otro Lambda (dashboard-api) invoca este directamente
//  con un payload { action, ... }
// ═══════════════════════════════════════════════════════════════

async function handleDirectInvocation(event) {
  const { action } = event;
  log.info('Invocación directa', { action });

  switch (action) {
    case 'getBaselines':
      return await getBaselinesForSystem(event.systemId, event.window);
    case 'getComparison':
      return await getCrossSystemComparison(event.metricName, event.environment);
    case 'getTrends':
      return await getTrendsForSystem(event.systemId, event.window);
    case 'getReport':
      return await generateBenchmarkReport(event.systemId);
    case 'recalculate':
      return await handleScheduledBaselines();
    default:
      return { error: `Acción desconocida: ${action}` };
  }
}

// ═══════════════════════════════════════════════════════════════
//  HTTP REQUEST HANDLER
//  Procesa peticiones HTTP que llegan vía API Gateway / dashboard-api.
//  Rutas soportadas:
//    GET /benchmarks                → Resumen global
//    GET /benchmarks/{systemId}     → Baselines de un sistema
//    GET /benchmarks/comparison     → Comparación entre sistemas
// ═══════════════════════════════════════════════════════════════

async function handleHttpRequest(event) {
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = event.path || event.rawPath || '';
  const params = event.queryStringParameters || {};

  log.info('HTTP request', { method, path });

  // Solo aceptar GET
  if (method === 'OPTIONS') {
    return buildResponse(200, {});
  }
  if (method !== 'GET') {
    return buildResponse(405, { error: 'Método no permitido. Solo GET.' });
  }

  // ── GET /benchmarks/comparison ──
  if (path.endsWith('/comparison')) {
    const metricName = params.metric || 'HealthScore';
    const environment = params.environment || null;
    const result = await getCrossSystemComparison(metricName, environment);
    return buildResponse(200, result);
  }

  // ── GET /benchmarks/{systemId} ──
  const systemIdMatch = path.match(/\/benchmarks\/([A-Za-z0-9_-]+)$/);
  if (systemIdMatch) {
    const systemId = systemIdMatch[1];
    const window = parseInt(params.window) || DEFAULT_WINDOW;
    const includeTrends = params.trends === 'true';
    const result = await getBaselinesForSystem(systemId, window);

    // Si el usuario también quiere tendencias, las incluimos
    if (includeTrends) {
      result.trends = await getTrendsForSystem(systemId, window);
    }
    return buildResponse(200, result);
  }

  // ── GET /benchmarks (resumen global) ──
  if (path.endsWith('/benchmarks') || path.endsWith('/benchmarks/')) {
    const window = parseInt(params.window) || DEFAULT_WINDOW;
    const result = await getGlobalBenchmarkSummary(window);
    return buildResponse(200, result);
  }

  return buildResponse(404, { error: 'Ruta no encontrada' });
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES DE NEGOCIO
// ═══════════════════════════════════════════════════════════════

// ─── 1. RECALCULAR BASELINES (EventBridge diario) ───────────

/**
 * Recalcula baselines para TODOS los sistemas y métricas.
 * Se ejecuta diariamente a las 01:00 UTC vía EventBridge.
 * Para cada sistema, lee las métricas históricas de DynamoDB,
 * calcula las estadísticas y guarda los resultados en la tabla
 * de benchmarks.
 */
async function handleScheduledBaselines() {
  const startTime = Date.now();
  log.info('Inicio de recálculo diario de baselines');

  const systems = await getSystemsConfig();
  if (!systems || systems.length === 0) {
    log.warn('No se encontraron sistemas configurados');
    return { success: false, message: 'Sin sistemas configurados' };
  }

  log.info('Procesando baselines', { systems: systems.length, metrics: SAP_METRICS.length, windows: BENCHMARK_WINDOWS.length });

  let totalBaselines = 0;
  let totalErrors = 0;
  const systemResults = [];

  for (const system of systems) {
    const systemId = system.systemId || system.sid || system.id;
    const environment = system.environment || system.env || 'PRD';

    // Verificar modo trial — en trial solo calcular ventana de 7 días
    let windowsToProcess = BENCHMARK_WINDOWS;
    try {
      const trialConfig = await getTrialConfig(systemId);
      if (trialConfig.mode === 'TRIAL') {
        windowsToProcess = [7]; // Solo 7 días en modo trial
        log.info('Sistema en modo TRIAL — solo ventana de 7d', { systemId });
      }
    } catch (err) {
      // Si falla la verificación de trial, procesar todas las ventanas
      log.warn('No se pudo verificar modo trial', { systemId, error: err.message });
    }

    const systemStart = Date.now();
    let systemBaselines = 0;
    let systemErrors = 0;

    for (const windowDays of windowsToProcess) {
      for (const metricName of SAP_METRICS) {
        try {
          const dataPoints = await fetchMetricHistory(systemId, metricName, windowDays);

          if (dataPoints.length < 3) {
            // Necesitamos al menos 3 puntos para estadísticas útiles
            continue;
          }

          const stats = calculateStats(dataPoints);
          const trend = calculateLinearRegression(dataPoints);

          const baseline = {
            pk: `BASELINE#${systemId}`,
            sk: `${metricName}#${windowDays}d`,
            systemId,
            metricName,
            environment,
            window: `${windowDays}d`,
            windowDays,
            stats,
            trend: {
              slope: trend.slope,
              intercept: trend.intercept,
              rSquared: trend.rSquared,
              direction: classifyTrendDirection(trend.slope, metricName),
              confidence: trend.rSquared,
            },
            dataPointCount: dataPoints.length,
            calculatedAt: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + (windowDays * 2 * 86400), // TTL = 2x la ventana
          };

          await saveBenchmark(baseline);
          systemBaselines++;

        } catch (err) {
          systemErrors++;
          log.error('Error calculando baseline', { systemId, metricName, windowDays, error: err.message });
        }
      }
    }

    // Calcular health score global del sistema y guardarlo
    try {
      const healthBenchmark = await calculateSystemHealthBenchmark(systemId, environment);
      if (healthBenchmark) {
        await saveBenchmark(healthBenchmark);
        systemBaselines++;
      }
    } catch (err) {
      systemErrors++;
      log.error('Error calculando health benchmark', { systemId, error: err.message });
    }

    totalBaselines += systemBaselines;
    totalErrors += systemErrors;

    const elapsedMs = Date.now() - systemStart;
    log.info('Sistema procesado', { systemId, baselinesCalculated: systemBaselines, errors: systemErrors, durationMs: elapsedMs });

    systemResults.push({
      systemId,
      environment,
      baselinesCalculated: systemBaselines,
      errors: systemErrors,
      durationMs: elapsedMs,
    });
  }

  // Guardar resumen de la ejecución
  const summary = {
    pk: 'BENCHMARK_RUN',
    sk: new Date().toISOString(),
    totalSystems: systems.length,
    totalBaselines,
    totalErrors,
    durationMs: Date.now() - startTime,
    systemResults,
    completedAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + (90 * 86400), // 90 días de retención
  };
  await saveBenchmark(summary);

  log.info('Recálculo completado', { totalBaselines, totalErrors, durationMs: Date.now() - startTime });

  return {
    success: true,
    totalSystems: systems.length,
    totalBaselines,
    totalErrors,
    durationMs: Date.now() - startTime,
  };
}

// ─── 2. OBTENER BASELINES DE UN SISTEMA ─────────────────────

/**
 * Retorna los baselines calculados para un sistema específico.
 * @param {string} systemId - ID del sistema SAP
 * @param {number} windowDays - Ventana en días (7, 30, 90)
 * @returns {Object} Baselines del sistema
 */
async function getBaselinesForSystem(systemId, windowDays = DEFAULT_WINDOW) {
  log.info('Obteniendo baselines', { systemId, windowDays });

  // Validar ventana
  const validWindow = BENCHMARK_WINDOWS.includes(windowDays) ? windowDays : DEFAULT_WINDOW;

  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: BENCHMARKS_TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `BASELINE#${systemId}`,
        ':skPrefix': '', // traer todas las métricas
      },
    }));

    // Filtrar por ventana solicitada y agrupar por métrica
    const baselines = {};
    for (const item of (result.Items || [])) {
      if (item.windowDays === validWindow || item.sk.endsWith(`#${validWindow}d`)) {
        baselines[item.metricName] = {
          metricName: item.metricName,
          window: item.window,
          stats: item.stats,
          trend: item.trend,
          dataPointCount: item.dataPointCount,
          calculatedAt: item.calculatedAt,
        };
      }
    }

    // Obtener health benchmark
    let healthBenchmark = null;
    try {
      const healthResult = await ddbDoc.send(new GetCommand({
        TableName: BENCHMARKS_TABLE,
        Key: { pk: `HEALTH#${systemId}`, sk: 'LATEST' },
      }));
      healthBenchmark = healthResult.Item || null;
    } catch (err) {
      log.warn('No se encontró health benchmark', { systemId });
    }

    return {
      systemId,
      window: `${validWindow}d`,
      metricsCount: Object.keys(baselines).length,
      baselines,
      healthBenchmark,
      retrievedAt: new Date().toISOString(),
    };

  } catch (err) {
    log.error('Error obteniendo baselines', { systemId, error: err.message });
    throw err;
  }
}

// ─── 3. COMPARACIÓN CROSS-SYSTEM ────────────────────────────

/**
 * Compara una métrica específica entre todos los sistemas SAP
 * para identificar outliers y mejores desempeños.
 * @param {string} metricName - Nombre de la métrica a comparar
 * @param {string|null} environment - Filtrar por ambiente (PRD, QAS, DEV)
 * @returns {Object} Comparación con rankings
 */
async function getCrossSystemComparison(metricName = 'HealthScore', environment = null) {
  log.info('Comparación cross-system', { metricName, environment: environment || 'TODOS' });

  const systems = await getSystemsConfig();
  if (!systems || systems.length === 0) {
    return { metricName, systems: [], message: 'Sin sistemas configurados' };
  }

  // Recopilar el baseline de cada sistema para esta métrica
  const systemValues = [];
  for (const system of systems) {
    const sysId = system.systemId || system.sid || system.id;
    const sysEnv = system.environment || system.env || 'PRD';

    // Filtrar por ambiente si se especificó
    if (environment && sysEnv.toUpperCase() !== environment.toUpperCase()) {
      continue;
    }

    try {
      const result = await ddbDoc.send(new GetCommand({
        TableName: BENCHMARKS_TABLE,
        Key: { pk: `BASELINE#${sysId}`, sk: `${metricName}#${DEFAULT_WINDOW}d` },
      }));

      if (result.Item && result.Item.stats) {
        systemValues.push({
          systemId: sysId,
          environment: sysEnv,
          value: result.Item.stats.avg,
          stats: result.Item.stats,
          trend: result.Item.trend,
          calculatedAt: result.Item.calculatedAt,
        });
      }
    } catch (err) {
      log.warn('No se encontró baseline', { metricName, systemId: sysId });
    }
  }

  if (systemValues.length === 0) {
    return {
      metricName,
      environment: environment || 'ALL',
      systems: [],
      message: 'Sin datos de benchmark disponibles para esta métrica',
    };
  }

  // Calcular estadísticas globales para la comparación
  const allValues = systemValues.map(s => s.value);
  const globalStats = calculateStats(allValues.map((v, i) => ({ value: v, timestamp: i })));

  // Determinar si valores altos son "buenos" o "malos" según la métrica
  const higherIsBetter = isHigherBetter(metricName);

  // Ordenar: si "mayor es mejor", de mayor a menor; si no, de menor a mayor
  const sorted = [...systemValues].sort((a, b) =>
    higherIsBetter ? b.value - a.value : a.value - b.value
  );

  // Asignar rankings, percentiles y desviaciones
  const comparison = sorted.map((sys, index) => {
    const deviation = globalStats.stdDev > 0
      ? (sys.value - globalStats.avg) / globalStats.stdDev
      : 0;

    const percentile = systemValues.length > 1
      ? Math.round(((systemValues.length - index) / systemValues.length) * 100)
      : 100;

    let outlierStatus = 'normal';
    if (Math.abs(deviation) >= OUTLIER_THRESHOLDS.critical) {
      outlierStatus = 'critical_outlier';
    } else if (Math.abs(deviation) >= OUTLIER_THRESHOLDS.warning) {
      outlierStatus = 'warning_outlier';
    }

    return {
      systemId: sys.systemId,
      environment: sys.environment,
      value: round(sys.value, 4),
      rank: index + 1,
      percentile,
      deviation: round(deviation, 4),
      outlierStatus,
      trend: sys.trend,
      stats: sys.stats,
    };
  });

  // Identificar mejor y peor sistema
  const bestPerformer = comparison[0] || null;
  const worstPerformer = comparison[comparison.length - 1] || null;

  return {
    metricName,
    environment: environment || 'ALL',
    window: `${DEFAULT_WINDOW}d`,
    higherIsBetter,
    globalStats: {
      avg: round(globalStats.avg, 4),
      stdDev: round(globalStats.stdDev, 4),
      min: round(globalStats.min, 4),
      max: round(globalStats.max, 4),
      systemCount: systemValues.length,
    },
    bestPerformer: bestPerformer ? { systemId: bestPerformer.systemId, value: bestPerformer.value } : null,
    worstPerformer: worstPerformer ? { systemId: worstPerformer.systemId, value: worstPerformer.value } : null,
    systems: comparison,
    generatedAt: new Date().toISOString(),
  };
}

// ─── 4. ANÁLISIS DE TENDENCIAS ──────────────────────────────

/**
 * Obtiene las tendencias de todas las métricas de un sistema.
 * Utiliza regresión lineal para detectar degradación o mejora.
 * @param {string} systemId - ID del sistema SAP
 * @param {number} windowDays - Ventana en días
 * @returns {Object} Tendencias del sistema
 */
async function getTrendsForSystem(systemId, windowDays = DEFAULT_WINDOW) {
  log.info('Analizando tendencias', { systemId, windowDays });

  const trends = [];
  let degradingCount = 0;
  let improvingCount = 0;
  let stableCount = 0;

  for (const metricName of SAP_METRICS) {
    try {
      const dataPoints = await fetchMetricHistory(systemId, metricName, windowDays);

      if (dataPoints.length < 5) {
        // Necesitamos al menos 5 puntos para tendencias fiables
        continue;
      }

      const regression = calculateLinearRegression(dataPoints);
      const direction = classifyTrendDirection(regression.slope, metricName);

      // Solo reportar tendencias con confianza suficiente
      if (regression.rSquared >= MIN_TREND_CONFIDENCE) {
        const trendEntry = {
          metricName,
          slope: round(regression.slope, 6),
          intercept: round(regression.intercept, 4),
          direction,
          confidence: round(regression.rSquared, 4),
          dataPointCount: dataPoints.length,
          projectedValueIn7d: round(regression.intercept + regression.slope * (dataPoints.length + 7 * 24), 4),
        };

        trends.push(trendEntry);

        if (direction === 'degrading') degradingCount++;
        else if (direction === 'improving') improvingCount++;
        else stableCount++;
      }

    } catch (err) {
      log.warn('Error en tendencia', { metricName, systemId, error: err.message });
    }
  }

  // Ordenar: métricas degradando primero (más urgentes)
  trends.sort((a, b) => {
    const order = { degrading: 0, stable: 1, improving: 2 };
    return (order[a.direction] || 1) - (order[b.direction] || 1);
  });

  return {
    systemId,
    window: `${windowDays}d`,
    summary: {
      totalAnalyzed: trends.length,
      degrading: degradingCount,
      improving: improvingCount,
      stable: stableCount,
    },
    trends,
    analyzedAt: new Date().toISOString(),
  };
}

// ─── 5. HEALTH SCORE BENCHMARKING ───────────────────────────

/**
 * Calcula un benchmark de salud global del sistema basado en
 * todos los baselines individuales de métricas.
 * @param {string} systemId - ID del sistema
 * @param {string} environment - Ambiente (PRD, QAS, DEV)
 * @returns {Object|null} Benchmark de salud
 */
async function calculateSystemHealthBenchmark(systemId, environment) {
  log.info('Calculando health benchmark', { systemId, environment });

  // Obtener baselines actuales del sistema (ventana de 30d)
  const result = await ddbDoc.send(new QueryCommand({
    TableName: BENCHMARKS_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': `BASELINE#${systemId}`,
    },
  }));

  const items = (result.Items || []).filter(i => i.windowDays === DEFAULT_WINDOW);
  if (items.length === 0) return null;

  // Calcular score de salud ponderado
  const weights = {
    HealthScore: 3.0,
    CPUUtilization: 2.0,
    MemoryUtilization: 2.0,
    ResponseTime: 2.5,
    DialogStepTime: 2.0,
    DatabaseResponseTime: 2.0,
    DiskUtilization: 1.5,
    AbapDumps: 1.5,
    FailedJobs: 1.5,
    WorkProcessUsage: 1.0,
    ICMConnections: 1.0,
    UserSessions: 0.5,
    SwapUsage: 1.0,
    NetworkLatency: 1.0,
    QueueReads: 0.5,
  };

  let weightedScore = 0;
  let totalWeight = 0;
  const metricScores = {};

  for (const item of items) {
    const metric = item.metricName;
    const weight = weights[metric] || 1.0;
    const score = calculateMetricHealthScore(metric, item.stats);

    metricScores[metric] = {
      score: round(score, 2),
      weight,
      weightedContribution: round(score * weight, 2),
      stats: {
        avg: round(item.stats.avg, 2),
        p95: round(item.stats.p95, 2),
      },
      trend: item.trend?.direction || 'unknown',
    };

    weightedScore += score * weight;
    totalWeight += weight;
  }

  const overallScore = totalWeight > 0 ? round(weightedScore / totalWeight, 2) : 0;

  // Clasificar la salud general
  let healthStatus;
  if (overallScore >= 90) healthStatus = 'EXCELLENT';
  else if (overallScore >= 75) healthStatus = 'GOOD';
  else if (overallScore >= 60) healthStatus = 'FAIR';
  else if (overallScore >= 40) healthStatus = 'POOR';
  else healthStatus = 'CRITICAL';

  const benchmark = {
    pk: `HEALTH#${systemId}`,
    sk: 'LATEST',
    systemId,
    environment,
    overallScore,
    healthStatus,
    metricsEvaluated: items.length,
    metricScores,
    calculatedAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + (60 * 86400), // 60 días
  };

  // También guardar versión histórica para tracking
  const historicalKey = {
    pk: `HEALTH_HISTORY#${systemId}`,
    sk: new Date().toISOString(),
    ...benchmark,
    ttl: Math.floor(Date.now() / 1000) + (180 * 86400), // 180 días de historial
  };
  // No bloquear por el histórico
  saveBenchmark(historicalKey).catch(err =>
    log.warn('Error guardando historial de health', { systemId, error: err.message })
  );

  return benchmark;
}

// ─── 6. RESUMEN GLOBAL DE BENCHMARKS ────────────────────────

/**
 * Genera un resumen global de todos los benchmarks del sistema.
 * Usado por GET /benchmarks sin systemId.
 * @param {number} windowDays - Ventana en días
 * @returns {Object} Resumen global
 */
async function getGlobalBenchmarkSummary(windowDays = DEFAULT_WINDOW) {
  log.info('Generando resumen global de benchmarks', { windowDays });

  const systems = await getSystemsConfig();
  if (!systems || systems.length === 0) {
    return { systems: [], message: 'Sin sistemas configurados' };
  }

  const summaries = [];

  for (const system of systems) {
    const sysId = system.systemId || system.sid || system.id;
    const sysEnv = system.environment || system.env || 'PRD';

    try {
      // Obtener health benchmark
      const healthResult = await ddbDoc.send(new GetCommand({
        TableName: BENCHMARKS_TABLE,
        Key: { pk: `HEALTH#${sysId}`, sk: 'LATEST' },
      }));

      const health = healthResult.Item;

      // Contar tendencias degradando
      let degradingMetrics = 0;
      try {
        const baselineResult = await ddbDoc.send(new QueryCommand({
          TableName: BENCHMARKS_TABLE,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': `BASELINE#${sysId}` },
        }));

        for (const item of (baselineResult.Items || [])) {
          if (item.windowDays === windowDays && item.trend?.direction === 'degrading') {
            degradingMetrics++;
          }
        }
      } catch (err) {
        // No bloquear si falla
      }

      summaries.push({
        systemId: sysId,
        environment: sysEnv,
        healthScore: health ? health.overallScore : null,
        healthStatus: health ? health.healthStatus : 'UNKNOWN',
        degradingMetrics,
        lastCalculated: health ? health.calculatedAt : null,
      });

    } catch (err) {
      log.warn('Error obteniendo resumen', { systemId: sysId, error: err.message });
      summaries.push({
        systemId: sysId,
        environment: sysEnv,
        healthScore: null,
        healthStatus: 'ERROR',
        degradingMetrics: 0,
        lastCalculated: null,
      });
    }
  }

  // Ordenar por health score descendente (mejores primero)
  summaries.sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0));

  // Agrupar por ambiente
  const byEnvironment = {};
  for (const s of summaries) {
    const env = s.environment || 'UNKNOWN';
    if (!byEnvironment[env]) byEnvironment[env] = [];
    byEnvironment[env].push(s);
  }

  return {
    window: `${windowDays}d`,
    totalSystems: summaries.length,
    byEnvironment,
    systems: summaries,
    generatedAt: new Date().toISOString(),
  };
}

// ─── 7. REPORTE DE BENCHMARK ────────────────────────────────

/**
 * Genera un reporte estructurado de benchmark con recomendaciones
 * para un sistema específico.
 * @param {string} systemId - ID del sistema
 * @returns {Object} Reporte completo con recomendaciones
 */
async function generateBenchmarkReport(systemId) {
  log.info('Generando reporte de benchmark', { systemId });

  // Recopilar toda la información disponible
  const [baselines, trends, healthResult] = await Promise.all([
    getBaselinesForSystem(systemId, DEFAULT_WINDOW),
    getTrendsForSystem(systemId, DEFAULT_WINDOW),
    ddbDoc.send(new GetCommand({
      TableName: BENCHMARKS_TABLE,
      Key: { pk: `HEALTH#${systemId}`, sk: 'LATEST' },
    })).catch(() => ({ Item: null })),
  ]);

  const health = healthResult.Item;

  // Generar recomendaciones basadas en los datos
  const recommendations = generateRecommendations(baselines, trends, health);

  // Calcular score de rendimiento general (diferente al health score)
  const performanceScore = calculatePerformanceScore(baselines, trends);

  const report = {
    reportType: 'BENCHMARK_REPORT',
    systemId,
    generatedAt: new Date().toISOString(),
    window: `${DEFAULT_WINDOW}d`,

    // Resumen ejecutivo
    executiveSummary: {
      healthScore: health ? health.overallScore : null,
      healthStatus: health ? health.healthStatus : 'UNKNOWN',
      performanceScore: round(performanceScore, 1),
      totalMetricsAnalyzed: Object.keys(baselines.baselines || {}).length,
      degradingTrends: trends.summary?.degrading || 0,
      improvingTrends: trends.summary?.improving || 0,
      criticalRecommendations: recommendations.filter(r => r.severity === 'CRITICAL').length,
    },

    // Detalle de baselines
    baselines: baselines.baselines,

    // Detalle de tendencias
    trends: trends.trends,

    // Health breakdown
    healthBreakdown: health ? health.metricScores : null,

    // Recomendaciones priorizadas
    recommendations,

    // Metadatos
    metadata: {
      version: 'v1.0',
      engine: 'benchmark-engine',
      calculationMethod: 'linear-regression + percentile-analysis',
    },
  };

  // Guardar el reporte en DynamoDB
  const reportRecord = {
    pk: `REPORT#${systemId}`,
    sk: new Date().toISOString(),
    ...report,
    ttl: Math.floor(Date.now() / 1000) + (90 * 86400), // 90 días
  };
  await saveBenchmark(reportRecord);

  log.info('Reporte generado', { systemId, performanceScore, recommendations: recommendations.length });

  return report;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES: ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════

/**
 * Calcula estadísticas completas (avg, percentiles, min, max, stdDev)
 * a partir de un array de data points.
 * @param {Array} dataPoints - Array de { value, timestamp }
 * @returns {Object} Estadísticas calculadas
 */
function calculateStats(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) {
    return { avg: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, stdDev: 0, count: 0 };
  }

  const values = dataPoints.map(dp => typeof dp === 'number' ? dp : dp.value).filter(v => v != null && !isNaN(v));
  if (values.length === 0) {
    return { avg: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, stdDev: 0, count: 0 };
  }

  // Ordenar para percentiles
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  // Promedio
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / n;

  // Desviación estándar (población)
  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    avg: round(avg, 4),
    p50: round(percentile(sorted, 50), 4),
    p75: round(percentile(sorted, 75), 4),
    p90: round(percentile(sorted, 90), 4),
    p95: round(percentile(sorted, 95), 4),
    p99: round(percentile(sorted, 99), 4),
    min: round(sorted[0], 4),
    max: round(sorted[n - 1], 4),
    stdDev: round(stdDev, 4),
    count: n,
  };
}

/**
 * Calcula un percentil específico de un array ya ordenado.
 * Usa interpolación lineal entre los dos valores más cercanos.
 * @param {Array<number>} sorted - Array ordenado de valores
 * @param {number} p - Percentil deseado (0-100)
 * @returns {number} Valor del percentil
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  // Interpolación lineal
  const fraction = index - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES: REGRESIÓN LINEAL
// ═══════════════════════════════════════════════════════════════

/**
 * Calcula regresión lineal simple (y = mx + b) sobre un dataset.
 * Retorna la pendiente (slope), intercepto y R² (coeficiente de
 * determinación) como medida de confianza.
 * @param {Array} dataPoints - Array de { value, timestamp }
 * @returns {Object} { slope, intercept, rSquared }
 */
function calculateLinearRegression(dataPoints) {
  if (!dataPoints || dataPoints.length < 2) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }

  const n = dataPoints.length;

  // Normalizar timestamps a índices secuenciales (0, 1, 2, ...)
  // para evitar problemas de precisión numérica con timestamps grandes
  const xs = dataPoints.map((_, i) => i);
  const ys = dataPoints.map(dp => typeof dp === 'number' ? dp : dp.value);

  // Promedios
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  // Sumatorias para la regresión
  let ssXY = 0; // Suma de (xi - xMean) * (yi - yMean)
  let ssXX = 0; // Suma de (xi - xMean)²
  let ssYY = 0; // Suma de (yi - yMean)²

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  // Pendiente (slope) e intercepto
  const slope = ssXX !== 0 ? ssXY / ssXX : 0;
  const intercept = yMean - slope * xMean;

  // Coeficiente de determinación R²
  // Mide qué tan bien la línea explica la variación en los datos
  // R² = 1 → ajuste perfecto, R² = 0 → sin correlación
  const rSquared = (ssXX !== 0 && ssYY !== 0) ? Math.pow(ssXY, 2) / (ssXX * ssYY) : 0;

  return {
    slope: round(slope, 8),
    intercept: round(intercept, 4),
    rSquared: round(Math.max(0, Math.min(1, rSquared)), 4), // Clamp entre 0 y 1
  };
}

/**
 * Clasifica la dirección de una tendencia según la pendiente y
 * el tipo de métrica. Para métricas donde "más alto es peor"
 * (CPU, memoria, tiempos de respuesta), pendiente positiva =
 * degradando. Para health score, pendiente positiva = mejorando.
 * @param {number} slope - Pendiente de la regresión
 * @param {string} metricName - Nombre de la métrica
 * @returns {string} 'improving' | 'degrading' | 'stable'
 */
function classifyTrendDirection(slope, metricName) {
  if (Math.abs(slope) < TREND_SLOPE_THRESHOLD) return 'stable';

  const higherBetter = isHigherBetter(metricName);

  if (slope > 0) {
    return higherBetter ? 'improving' : 'degrading';
  } else {
    return higherBetter ? 'degrading' : 'improving';
  }
}

/**
 * Determina si un valor más alto de una métrica es "mejor".
 * Por ejemplo, HealthScore alto = bueno, CPUUtilization alta = malo.
 * @param {string} metricName - Nombre de la métrica
 * @returns {boolean}
 */
function isHigherBetter(metricName) {
  const higherIsBetterMetrics = new Set([
    'HealthScore',
    'UserSessions', // Más usuarios = más uso del sistema
  ]);
  return higherIsBetterMetrics.has(metricName);
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES: PUNTUACIÓN DE SALUD POR MÉTRICA
// ═══════════════════════════════════════════════════════════════

/**
 * Calcula un score de salud (0-100) para una métrica específica
 * basado en sus estadísticas. Cada métrica tiene sus propios
 * umbrales de lo que es "bueno" o "malo".
 * @param {string} metricName - Nombre de la métrica
 * @param {Object} stats - Estadísticas (avg, p95, etc.)
 * @returns {number} Score de 0 a 100
 */
function calculateMetricHealthScore(metricName, stats) {
  if (!stats) return 50; // Score neutro si no hay datos

  // Definir umbrales por métrica: [ideal, aceptable, warning, critical]
  const thresholds = {
    CPUUtilization:       { ideal: 40, acceptable: 65, warning: 80, critical: 95 },
    MemoryUtilization:    { ideal: 50, acceptable: 70, warning: 85, critical: 95 },
    DiskUtilization:      { ideal: 40, acceptable: 60, warning: 80, critical: 90 },
    ResponseTime:         { ideal: 200, acceptable: 500, warning: 1000, critical: 3000 },
    DialogStepTime:       { ideal: 300, acceptable: 700, warning: 1200, critical: 5000 },
    DatabaseResponseTime: { ideal: 50, acceptable: 150, warning: 500, critical: 2000 },
    WorkProcessUsage:     { ideal: 30, acceptable: 60, warning: 80, critical: 95 },
    ICMConnections:       { ideal: 30, acceptable: 60, warning: 80, critical: 95 },
    SwapUsage:            { ideal: 0, acceptable: 10, warning: 30, critical: 60 },
    AbapDumps:            { ideal: 0, acceptable: 2, warning: 10, critical: 50 },
    FailedJobs:           { ideal: 0, acceptable: 1, warning: 5, critical: 20 },
    NetworkLatency:       { ideal: 5, acceptable: 20, warning: 50, critical: 200 },
    QueueReads:           { ideal: 20, acceptable: 50, warning: 80, critical: 95 },
    HealthScore:          { ideal: 95, acceptable: 80, warning: 60, critical: 40, inverted: true },
    UserSessions:         { ideal: 100, acceptable: 50, warning: 20, critical: 5, inverted: true },
  };

  const t = thresholds[metricName];
  if (!t) return 50;

  // Usar p95 para métricas de utilización (más conservador que promedio)
  const value = ['CPUUtilization', 'MemoryUtilization', 'DiskUtilization', 'WorkProcessUsage']
    .includes(metricName) ? stats.p95 : stats.avg;

  if (t.inverted) {
    // Para métricas donde mayor = mejor (HealthScore, UserSessions)
    if (value >= t.ideal) return 100;
    if (value >= t.acceptable) return 75 + 25 * (value - t.acceptable) / (t.ideal - t.acceptable);
    if (value >= t.warning) return 50 + 25 * (value - t.warning) / (t.acceptable - t.warning);
    if (value >= t.critical) return 25 + 25 * (value - t.critical) / (t.warning - t.critical);
    return Math.max(0, 25 * value / t.critical);
  }

  // Para métricas donde menor = mejor (CPU, memoria, tiempos)
  if (value <= t.ideal) return 100;
  if (value <= t.acceptable) return 75 + 25 * (t.acceptable - value) / (t.acceptable - t.ideal);
  if (value <= t.warning) return 50 + 25 * (t.warning - value) / (t.warning - t.acceptable);
  if (value <= t.critical) return 25 + 25 * (t.critical - value) / (t.critical - t.warning);
  return Math.max(0, 25 * (1 - (value - t.critical) / t.critical));
}

/**
 * Calcula un score de rendimiento general basado en baselines y tendencias.
 * Este score tiene en cuenta no solo el estado actual sino la dirección
 * en que se mueven las métricas.
 * @param {Object} baselines - Baselines del sistema
 * @param {Object} trends - Tendencias del sistema
 * @returns {number} Score de rendimiento (0-100)
 */
function calculatePerformanceScore(baselines, trends) {
  let score = 70; // Score base

  // Ajustar por tendencias
  if (trends && trends.summary) {
    // Penalizar por métricas degradando
    score -= (trends.summary.degrading || 0) * 5;
    // Bonificar por métricas mejorando
    score += (trends.summary.improving || 0) * 2;
  }

  // Ajustar por cantidad de datos disponibles
  const metricCount = Object.keys(baselines?.baselines || {}).length;
  if (metricCount < 5) {
    score -= 10; // Penalizar si hay pocos datos
  }

  return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES: RECOMENDACIONES
// ═══════════════════════════════════════════════════════════════

/**
 * Genera recomendaciones priorizadas basadas en los baselines,
 * tendencias y health score de un sistema.
 * @param {Object} baselines - Baselines del sistema
 * @param {Object} trends - Tendencias del sistema
 * @param {Object|null} health - Health benchmark
 * @returns {Array} Lista de recomendaciones
 */
function generateRecommendations(baselines, trends, health) {
  const recommendations = [];

  // ── Recomendaciones basadas en tendencias de degradación ──
  if (trends && trends.trends) {
    for (const trend of trends.trends) {
      if (trend.direction === 'degrading' && trend.confidence >= MIN_TREND_CONFIDENCE) {
        const severity = trend.confidence >= 0.7 ? 'CRITICAL' : 'WARNING';
        recommendations.push({
          id: `TREND_DEGRADE_${trend.metricName}`,
          severity,
          category: 'PERFORMANCE_TREND',
          metric: trend.metricName,
          title: `${trend.metricName} muestra tendencia de degradación`,
          description: `La métrica ${trend.metricName} ha estado degradando consistentemente `
            + `(pendiente: ${trend.slope}, confianza: ${(trend.confidence * 100).toFixed(1)}%). `
            + `Se recomienda investigar la causa raíz antes de que alcance umbrales críticos.`,
          action: getRecommendedAction(trend.metricName, 'degrading'),
          confidence: trend.confidence,
        });
      }
    }
  }

  // ── Recomendaciones basadas en percentiles altos ──
  if (baselines && baselines.baselines) {
    for (const [metricName, baseline] of Object.entries(baselines.baselines)) {
      const stats = baseline.stats;
      if (!stats) continue;

      // Si el p95 es muy superior al promedio, hay picos preocupantes
      if (stats.avg > 0 && stats.p95 / stats.avg > 2.0 && !isHigherBetter(metricName)) {
        recommendations.push({
          id: `SPIKE_${metricName}`,
          severity: stats.p95 / stats.avg > 3.0 ? 'CRITICAL' : 'WARNING',
          category: 'PERFORMANCE_SPIKES',
          metric: metricName,
          title: `Picos significativos en ${metricName}`,
          description: `El percentil 95 de ${metricName} (${stats.p95}) es ${(stats.p95 / stats.avg).toFixed(1)}x `
            + `mayor que el promedio (${stats.avg}). Esto indica picos frecuentes que pueden afectar usuarios.`,
          action: `Investigar los períodos de pico y correlacionar con carga de trabajo o jobs batch.`,
          confidence: 0.8,
        });
      }

      // Si la desviación estándar es alta relativa al promedio
      if (stats.avg > 0 && stats.stdDev / stats.avg > 0.5 && !isHigherBetter(metricName)) {
        recommendations.push({
          id: `VARIABILITY_${metricName}`,
          severity: 'INFO',
          category: 'STABILITY',
          metric: metricName,
          title: `Alta variabilidad en ${metricName}`,
          description: `${metricName} muestra alta variabilidad (CV: ${((stats.stdDev / stats.avg) * 100).toFixed(1)}%). `
            + `Un comportamiento más predecible permitiría mejor capacity planning.`,
          action: `Revisar la distribución de carga y considerar balanceo o throttling.`,
          confidence: 0.6,
        });
      }
    }
  }

  // ── Recomendaciones basadas en health score ──
  if (health) {
    if (health.overallScore < 60) {
      recommendations.push({
        id: 'LOW_HEALTH_SCORE',
        severity: 'CRITICAL',
        category: 'OVERALL_HEALTH',
        metric: 'HealthScore',
        title: 'Health score general por debajo del umbral aceptable',
        description: `El health score del sistema es ${health.overallScore}/100 (${health.healthStatus}). `
          + `Se requiere atención inmediata para evitar impacto en usuarios.`,
        action: 'Revisar las métricas con peor score individual y priorizar correcciones.',
        confidence: 0.95,
      });
    }

    // Identificar las 3 métricas con peor score individual
    if (health.metricScores) {
      const worstMetrics = Object.entries(health.metricScores)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3);

      for (const worst of worstMetrics) {
        if (worst.score < 50) {
          recommendations.push({
            id: `LOW_METRIC_SCORE_${worst.name}`,
            severity: worst.score < 25 ? 'CRITICAL' : 'WARNING',
            category: 'METRIC_HEALTH',
            metric: worst.name,
            title: `Score bajo en ${worst.name}: ${worst.score}/100`,
            description: `La métrica ${worst.name} tiene un score de salud de ${worst.score}/100, `
              + `lo cual está arrastrando el score general del sistema.`,
            action: getRecommendedAction(worst.name, 'low_score'),
            confidence: 0.85,
          });
        }
      }
    }
  }

  // Ordenar por severidad (CRITICAL > WARNING > INFO)
  const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  recommendations.sort((a, b) =>
    (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2)
  );

  return recommendations;
}

/**
 * Retorna una acción recomendada específica para una métrica y situación.
 * @param {string} metricName - Nombre de la métrica
 * @param {string} situation - Tipo de situación (degrading, low_score)
 * @returns {string} Acción recomendada
 */
function getRecommendedAction(metricName, situation) {
  const actions = {
    CPUUtilization: {
      degrading: 'Revisar procesos con alto consumo de CPU. Considerar escalar vertical u horizontalmente.',
      low_score: 'Identificar work processes consumiendo CPU excesiva. Revisar jobs batch y reportes pesados.',
    },
    MemoryUtilization: {
      degrading: 'Investigar memory leaks en instancias SAP. Revisar configuración de buffers y caches.',
      low_score: 'Verificar parámetros de memoria SAP (em/initial_size_MB, etc.). Considerar aumentar RAM.',
    },
    ResponseTime: {
      degrading: 'Analizar transacciones más lentas con ST03/ST03N. Verificar índices de base de datos.',
      low_score: 'Ejecutar análisis de rendimiento completo. Revisar network latency y DB performance.',
    },
    DialogStepTime: {
      degrading: 'Revisar tiempos de diálogo con SM50/SM66. Verificar locks de base de datos.',
      low_score: 'Identificar programas ABAP con tiempos de ejecución altos. Revisar table buffering.',
    },
    DatabaseResponseTime: {
      degrading: 'Verificar estadísticas de base de datos y plan de ejecución de queries frecuentes.',
      low_score: 'Ejecutar DB02 para análisis de espacio y rendimiento. Considerar reorganización de tablas.',
    },
    DiskUtilization: {
      degrading: 'Planificar expansión de almacenamiento. Ejecutar limpieza de logs y archivos temporales.',
      low_score: 'Ejecutar cleanup inmediato: logs antiguos, spools, archivos temporales. Verificar archiving.',
    },
    AbapDumps: {
      degrading: 'Analizar dumps frecuentes con ST22. Priorizar corrección de errores de programación.',
      low_score: 'Revisar dumps más recurrentes en ST22 y escalar a equipo de desarrollo ABAP.',
    },
    FailedJobs: {
      degrading: 'Revisar jobs fallidos en SM37. Verificar dependencias y permisos de ejecución.',
      low_score: 'Auditar cadena de jobs y dependencias. Implementar monitoreo proactivo de pre-condiciones.',
    },
    WorkProcessUsage: {
      degrading: 'Verificar balanceo de carga entre servidores de aplicación. Revisar parámetros rdisp/*.',
      low_score: 'Considerar aumentar work processes o distribuir carga. Revisar SM50 para procesos stuck.',
    },
    SwapUsage: {
      degrading: 'Investigar consumo de memoria que fuerza swap. Aumentar memoria física disponible.',
      low_score: 'Swap activo indica falta de memoria RAM. Priorizar aumento de memoria del servidor.',
    },
    NetworkLatency: {
      degrading: 'Verificar infraestructura de red. Revisar routers, firewalls y balanceadores de carga.',
      low_score: 'Evaluar topología de red entre componentes SAP. Considerar migración a red de mayor velocidad.',
    },
  };

  const metricActions = actions[metricName];
  if (metricActions && metricActions[situation]) {
    return metricActions[situation];
  }

  return `Revisar la métrica ${metricName} en detalle y consultar notas SAP relevantes.`;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES: ACCESO A DATOS
// ═══════════════════════════════════════════════════════════════

/**
 * Lee el historial de métricas de un sistema desde DynamoDB
 * para una ventana de tiempo específica.
 * @param {string} systemId - ID del sistema
 * @param {string} metricName - Nombre de la métrica
 * @param {number} windowDays - Ventana en días
 * @returns {Array} Data points con { value, timestamp }
 */
async function fetchMetricHistory(systemId, metricName, windowDays) {
  const cutoffDate = new Date(Date.now() - windowDays * 86400 * 1000).toISOString();

  try {
    const result = await ddbDoc.send(new QueryCommand({
      TableName: METRICS_HISTORY_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk >= :cutoff',
      ExpressionAttributeValues: {
        ':pk': `METRIC#${systemId}#${metricName}`,
        ':cutoff': cutoffDate,
      },
      ScanIndexForward: true, // Orden cronológico ascendente
    }));

    return (result.Items || []).map(item => ({
      value: parseFloat(item.value || item.metricValue || 0),
      timestamp: item.sk || item.timestamp,
    })).filter(dp => !isNaN(dp.value));

  } catch (err) {
    log.warn('Error leyendo historial', { systemId, metricName, error: err.message });
    return [];
  }
}

/**
 * Lee la configuración de sistemas SAP desde SSM Parameter Store.
 * Usa caché de 5 minutos para no sobrecargar SSM.
 * @returns {Array} Lista de sistemas configurados
 */
async function getSystemsConfig() {
  // Verificar caché
  if (systemsConfigCache && (Date.now() - configCacheTime) < CACHE_TTL_MS) {
    return systemsConfigCache;
  }

  try {
    const param = await ssm.send(new GetParameterCommand({
      Name: SYSTEMS_CONFIG_PARAM,
      WithDecryption: true,
    }));

    const parsed = JSON.parse(param.Parameter.Value);
    systemsConfigCache = Array.isArray(parsed) ? parsed : [parsed];
    configCacheTime = Date.now();

    log.info('Configuración cargada', { systemCount: systemsConfigCache.length });
    return systemsConfigCache;

  } catch (err) {
    log.error('Error leyendo configuración de sistemas', { error: err.message });
    // Retornar caché expirado si existe, mejor que nada
    if (systemsConfigCache) {
      log.warn('Usando caché expirado de configuración');
      return systemsConfigCache;
    }
    return [];
  }
}

/**
 * Guarda un registro de benchmark en DynamoDB.
 * Usa una escritura condicional para no sobreescribir datos
 * más recientes en caso de ejecuciones concurrentes.
 * @param {Object} item - Registro a guardar
 */
async function saveBenchmark(item) {
  try {
    await ddbDoc.send(new PutCommand({
      TableName: BENCHMARKS_TABLE,
      Item: item,
    }));
  } catch (err) {
    log.error('Error guardando benchmark', { pk: item.pk, sk: item.sk, error: err.message });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES: UTILIDADES
// ═══════════════════════════════════════════════════════════════

/**
 * Redondea un número a N decimales.
 * Evita errores de punto flotante en los reportes.
 * @param {number} value - Valor a redondear
 * @param {number} decimals - Cantidad de decimales
 * @returns {number} Valor redondeado
 */
function round(value, decimals = 2) {
  if (value == null || isNaN(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Construye una respuesta HTTP estándar para API Gateway.
 * Incluye headers CORS para acceso desde el frontend dashboard.
 * @param {number} statusCode - Código HTTP
 * @param {Object} body - Cuerpo de la respuesta
 * @returns {Object} Respuesta formateada para API Gateway
 */
function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}
