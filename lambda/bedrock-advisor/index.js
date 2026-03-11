'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — Bedrock Advisor (7 Use Cases)
//  Asesor inteligente con Amazon Bedrock (Claude Haiku).
//
//  7 módulos IA:
//  UC1 — Análisis de Incidentes (cada breach)
//  UC2 — Predicción de Disco proactiva (cada 6h)
//  UC3 — Safety Gate (síncrono, antes de cada auto-ejecución)
//  UC4 — Digest Ejecutivo Diario (1/día 22:00 UTC)
//  UC5 — Adaptación de Runbooks (antes de presentar pasos)
//  UC6 — Análisis de Chatbot (intent + respuesta conversacional)
//  UC7 — Evaluación de Riesgo de Operaciones Programadas
//
//  Triggers:
//  - SNS ADVISOR_TOPIC_ARN → UC1 (BREACH_DETECTED, METRIC_SNAPSHOT)
//  - EventBridge cada 6h → UC2
//  - Invocación síncrona desde runbook-engine → UC3
//  - EventBridge 1/día 22:00 UTC → UC4
//  - Invocación síncrona desde runbook-engine → UC5
//  - Invocación síncrona desde chatbot-agent → UC6
//  - Invocación síncrona desde scheduler-engine → UC7
// ═══════════════════════════════════════════════════════════════

const { getSystemConfig: getTrialConfig, checkActionAllowed } = require('../utilidades/trial-config');
const { trackTokens, checkDailyLimit } = require('../utilidades/token-tracker');
const { createCircuitBreaker } = require('../utilidades/circuit-breaker');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { CloudWatchClient, GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const log = require('../utilidades/logger')('bedrock-advisor');

// Clientes de AWS
const bedrock = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || 'us-east-1' });
const sns = new SNSClient({});
const cw = new CloudWatchClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

// Configuración — modelo según documento de arquitectura
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-4-5-20251001';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '1024');
const CW_NAMESPACE = process.env.CW_NAMESPACE || 'SAPAlwaysOps';
const ADVISOR_RESULTS_TABLE = process.env.ADVISOR_RESULTS_TABLE || 'sap-alwaysops-advisor-results';
const AI_CONFIG_PARAM = process.env.AI_CONFIG_PARAM || '/sap-alwaysops/ai-config';

// Circuit breaker para llamadas a Bedrock
const bedrockCircuitBreaker = createCircuitBreaker('bedrock', {
  failureThreshold: 5,
  resetTimeoutMs: 10 * 60 * 1000, // 10 minutos
});

// Cache de configuracion AI
let aiConfigCache = null;
let aiConfigCacheTime = 0;
const AI_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getAiConfig() {
  if (aiConfigCache && (Date.now() - aiConfigCacheTime) < AI_CONFIG_CACHE_TTL) {
    return aiConfigCache;
  }
  try {
    const param = await ssm.send(new GetParameterCommand({ Name: AI_CONFIG_PARAM, WithDecryption: true }));
    aiConfigCache = JSON.parse(param.Parameter.Value);
    aiConfigCacheTime = Date.now();
    return aiConfigCache;
  } catch (err) {
    // Si no existe el parametro SSM, usar defaults
    return {
      UC1_enabled: true, UC2_enabled: true, UC3_enabled: true,
      UC4_enabled: true, UC5_enabled: true, UC6_enabled: true,
      UC7_enabled: true, chatbot_enabled: true,
      daily_token_limit: 100000,
      monthly_cost_limit_usd: 50,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
//  PROMPT DEL SISTEMA — Contexto SAP para todas las UC
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Eres un experto en SAP Basis con 20 años de experiencia administrando sistemas SAP en producción.
Tu rol es analizar métricas de monitoreo de sistemas SAP y dar recomendaciones claras y accionables.

Contexto de los runbooks disponibles:
- RB-ASE-001: Truncar log de transacciones ASE, matar transacciones viejas, limpiar bloqueos (costSafe=true, sin costo AWS)
- RB-ASE-002: Expansión de disco físico ASE via EBS (costSafe=false, requiresApproval=true, +$0.08/GB/mes)
- RB-ASE-003: Escenario combinado disco ASE - DUMP TX auto + EBS aprobación (split)
- RB-HANA-001: Gestión de memoria HANA - reclamar volumen, limpiar caché SQL (costSafe=true)
- RB-HANA-002: Expansión de disco HANA via EBS (costSafe=false, requiresApproval=true)
- RB-HA-001: Remediación de lag de replicación (costSafe=true)
- RB-JVM-001: Thread dump JVM / limpieza heap (costSafe=true)
- RB-JVM-002: Forzar GC OldGen JVM (costSafe=true)
- RB-PO-001: Análisis mensajes fallidos PO (costSafe=true)
- RB-ABAP-001: Gestión de work processes y sesiones ABAP (costSafe=true)

IMPORTANTE sobre SAP ASE:
- El disco FÍSICO (df -h /saplog) muestra archivos de device pre-alocados como "usados" SIEMPRE
- El log LÓGICO (lct_admin) muestra el uso REAL dentro del device
- Escenario 0=OK, 1=FÍSICO solo, 2=LÓGICO solo, 3=AMBOS
- DUMP TRANSACTION solo aplica cuando el log LÓGICO está alto (escenario 2 o 3)

Reglas para tus respuestas:
1. Responde SIEMPRE en español
2. Sé conciso pero específico
3. Prioriza acciones por urgencia
4. Menciona IDs de runbook cuando aplique
5. Incluye nivel de riesgo: BAJO, MEDIO, ALTO, CRÍTICO
6. Usa formato estructurado con secciones claras`;

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: callBedrock
//  Llama a Amazon Bedrock con un prompt y sistema.
// ═══════════════════════════════════════════════════════════════

async function callBedrock(prompt, systemPrompt, maxTokens, useCase) {
  // Circuit breaker check
  if (!bedrockCircuitBreaker.canExecute()) {
    const state = bedrockCircuitBreaker.getState();
    log.warn('Circuit breaker OPEN — saltando llamada', { failures: state.failures });
    return { success: false, error: 'Circuit breaker abierto — Bedrock temporalmente deshabilitado', circuitOpen: true };
  }

  // Daily token limit check
  try {
    const aiConfig = await getAiConfig();
    const limitCheck = await checkDailyLimit(aiConfig.daily_token_limit);
    if (!limitCheck.allowed) {
      log.warn('Limite diario alcanzado', { usage: limitCheck.usage, limit: limitCheck.limit });
      return { success: false, error: `Limite diario de tokens alcanzado (${limitCheck.usage}/${limitCheck.limit})`, dailyLimitReached: true };
    }
  } catch (err) {
    // No bloquear por error en limit check
    log.warn('Error verificando limite diario', { error: err.message });
  }

  try {
    log.info('Invocando modelo', { modelId: MODEL_ID });

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens || MAX_TOKENS,
      system: systemPrompt || SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const response = await bedrock.send(new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: body,
    }));

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const text = responseBody.content[0].text;

    // Registrar tokens consumidos
    const inputTokens = responseBody.usage?.input_tokens || 0;
    const outputTokens = responseBody.usage?.output_tokens || 0;
    trackTokens(useCase || 'unknown', inputTokens, outputTokens, MODEL_ID).catch(() => {});

    log.info('Respuesta recibida', { chars: text.length, inputTokens, outputTokens });
    bedrockCircuitBreaker.recordSuccess();
    return { success: true, text, inputTokens, outputTokens };
  } catch (err) {
    log.warn('Error llamando Bedrock', { error: err.message });
    bedrockCircuitBreaker.recordFailure();
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: saveAdvisorResult
//  Guarda resultados de IA en DynamoDB advisor-results
// ═══════════════════════════════════════════════════════════════

async function saveAdvisorResult(useCase, systemId, result) {
  try {
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 días
    await ddbDoc.send(new PutCommand({
      TableName: ADVISOR_RESULTS_TABLE,
      Item: {
        pk: `ADVISOR#${systemId}`,
        sk: `${new Date().toISOString()}#${useCase}`,
        useCase,
        systemId,
        result,
        bedrockUsed: result.bedrockUsed !== false,
        timestamp: new Date().toISOString(),
        ttl,
      },
    }));
  } catch (err) {
    log.warn('Error guardando resultado advisor', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  UC1 — ANÁLISIS DE INCIDENTES
//  Trigger: Cada breach detectado (vía SNS BREACH_DETECTED)
// ═══════════════════════════════════════════════════════════════

async function uc1IncidentAnalysis(message) {
  log.info('Análisis de incidente', { systemId: message.systemId, useCase: 'UC1' });

  const breachList = message.breaches.map((b, i) =>
    `  ${i + 1}. ${b.metricName} = ${b.value} (umbral: ${b.threshold}, severidad: ${b.severity}, runbook: ${b.runbook}, costSafe: ${b.costSafe})`
  ).join('\n');

  const relevantMetrics = Object.entries(message.metrics)
    .filter(([key]) => !key.includes('Success'))
    .map(([key, val]) => `  ${key}: ${typeof val === 'number' ? val.toFixed(2) : val}`)
    .join('\n');

  const prompt = `ALERTA: ${message.breaches.length} breach(es) en ${message.systemId} (${message.systemType}/${message.dbType}, SID=${message.sid}, Ambiente=${message.env}).

BREACHES:
${breachList}

MÉTRICAS ACTUALES:
${relevantMetrics}

Responde con este formato exacto:
ROOT_CAUSE: [causa raíz en 1-2 frases]
RISK_IF_IGNORED: [qué ocurre en 30 minutos sin acción]
ACTIONS:
- INMEDIATA: [acción + runbook ID si aplica]
- 30_MIN: [acción de seguimiento]
- 24H: [acción preventiva a largo plazo]
AUTO_REMEDIATION: [SAFE / RISKY / REQUIRES_HUMAN] + razón con valores de métricas
ESTIMATED_MINUTES: [tiempo estimado de resolución]`;

  const result = await callBedrock(prompt, undefined, undefined, 'UC1');

  if (!result.success) {
    // Fallback sin Bedrock
    const criticals = message.breaches.filter(b => b.severity === 'CRITICAL');
    result.text = `ANÁLISIS AUTOMÁTICO (Bedrock no disponible)\n\n`;
    result.text += `ROOT_CAUSE: ${criticals.length} breach(es) CRITICAL detectados en ${message.systemId}\n`;
    result.text += `RISK_IF_IGNORED: Posible degradación o caída del servicio SAP\n`;
    result.text += `ACTIONS:\n`;
    message.breaches.forEach(b => {
      result.text += `- ${b.severity}: Ejecutar ${b.runbook} para ${b.metricName} (${b.costSafe ? 'auto-ejecutable' : 'requiere aprobación'})\n`;
    });
    result.text += `AUTO_REMEDIATION: ${criticals.length > 0 ? 'REQUIRES_HUMAN' : 'SAFE'}\n`;
    result.text += `ESTIMATED_MINUTES: 15-30`;
  }

  await saveAdvisorResult('UC1', message.systemId, { analysis: result.text, bedrockUsed: result.success });
  return { useCase: 'UC1', systemId: message.systemId, analysis: result.text, bedrockUsed: result.success };
}

// ═══════════════════════════════════════════════════════════════
//  UC2 — PREDICCIÓN DE DISCO (PROACTIVO)
//  Trigger: EventBridge cada 6 horas
//  Analiza 7 días de histórico y predice días hasta crítico
// ═══════════════════════════════════════════════════════════════

async function uc2DiskForecast(systemsConfig) {
  log.info('Predicción de disco proactiva', { useCase: 'UC2' });
  const results = [];

  for (const sys of systemsConfig) {
    if (!sys.enabled) continue;

    // Leer 7 días de histórico de métricas de disco
    const diskMetrics = getDiskMetricsForDbType(sys.database?.type);
    const historicalData = {};

    for (const metricName of diskMetrics) {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 días

      try {
        const cwResult = await cw.send(new GetMetricStatisticsCommand({
          Namespace: CW_NAMESPACE,
          MetricName: metricName,
          Dimensions: [{ Name: 'SAPSystemId', Value: sys.systemId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600, // 1 hora
          Statistics: ['Average'],
        }));

        const datapoints = (cwResult.Datapoints || [])
          .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp))
          .map(dp => ({ timestamp: dp.Timestamp.toISOString(), value: dp.Average }));

        historicalData[metricName] = datapoints;
      } catch (err) {
        log.warn('Error leyendo métrica', { metricName, systemId: sys.systemId, error: err.message });
        historicalData[metricName] = [];
      }
    }

    // Construir prompt con datos de 7 días
    let dataSection = '';
    for (const [metric, points] of Object.entries(historicalData)) {
      if (points.length === 0) continue;
      const first = points[0]?.value?.toFixed(2) || 'N/A';
      const last = points[points.length - 1]?.value?.toFixed(2) || 'N/A';
      const max = Math.max(...points.map(p => p.value)).toFixed(2);
      const min = Math.min(...points.map(p => p.value)).toFixed(2);
      dataSection += `  ${metric}: inicio=${first}%, actual=${last}%, min=${min}%, max=${max}% (${points.length} datapoints/7d)\n`;
    }

    if (!dataSection) {
      log.info('Sin datos históricos, saltando', { systemId: sys.systemId, useCase: 'UC2' });
      continue;
    }

    const prompt = `PREDICCIÓN DE DISCO — Sistema: ${sys.systemId} (${sys.systemType}/${sys.database?.type}, SID=${sys.sid})

DATOS HISTÓRICOS (7 días, por hora):
${dataSection}

${sys.database?.type === 'SAP_ASE' ? 'NOTA ASE: Distinguir disco FÍSICO (PhysLog/PhysData = filesystem) del LÓGICO (LogFull = uso real del log dentro del device pre-alocado).\n' : ''}
Responde con este formato exacto:
TENDENCIA: [%/día por cada métrica de disco]
DIAS_HASTA_95: [días estimados hasta alcanzar 95% por cada capa]
ROOT_PATTERN: [patrón identificado, ej: "falta schedule DUMP TX cada 4h"]
ACCIONES_PREVENTIVAS:
1. [acción rankeada por prioridad + runbook si aplica]
2. [segunda acción]
3. [tercera acción]
ALERTA_PROACTIVA: [SI/NO — SI si daysUntilCritical < 3 días]`;

    const result = await callBedrock(prompt, undefined, undefined, 'UC2');
    const forecast = result.success ? result.text : `PREDICCIÓN BÁSICA (Bedrock no disponible)\nSin análisis IA disponible para ${sys.systemId}. Revisar métricas de disco manualmente.`;

    await saveAdvisorResult('UC2', sys.systemId, { forecast, bedrockUsed: result.success });

    // Si predice < 3 días → publicar alerta proactiva
    if (result.success && result.text.includes('ALERTA_PROACTIVA: SI')) {
      await publishAdvisorAlert('UC2_DISK_FORECAST', sys.systemId, forecast);
    }

    results.push({ systemId: sys.systemId, bedrockUsed: result.success });
  }

  return results;
}

function getDiskMetricsForDbType(dbType) {
  switch (dbType) {
    case 'SAP_ASE': return ['DB_ASE_LogFullPct', 'DB_ASE_PhysLogPct', 'DB_ASE_PhysDataPct', 'DB_ASE_LogGrowthPctPerHr'];
    case 'SAP_HANA': return ['DB_HANA_MemPct', 'DB_HANA_DiskPct'];
    case 'ORACLE': return ['DB_ORA_TablespacePct'];
    case 'MSSQL': return ['DB_MSSQL_LogPct', 'DB_MSSQL_DataPct'];
    case 'IBM_DB2': return ['DB_DB2_TablespacePct', 'DB_DB2_LogPct'];
    default: return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  UC3 — SAFETY GATE (SÍNCRONO)
//  Trigger: Invocación síncrona desde runbook-engine ANTES de
//  CUALQUIER acción costSafe=true.
//  Retorna: SAFE / RISKY / REQUIRES_HUMAN
// ═══════════════════════════════════════════════════════════════

async function uc3SafetyGate(event) {
  log.info('Safety Gate invocado', { runbookId: event.runbookId, systemId: event.systemId, useCase: 'UC3' });

  const { runbookId, breach, metrics, systemId, dbType, systemType, sid } = event;

  // Extraer métricas relevantes para el Safety Gate
  const oldestTx = metrics?.DB_ASE_OldestTxMin || 0;
  const blockingChains = metrics?.DB_ASE_BlockingChains || 0;
  const logFullPct = metrics?.DB_ASE_LogFullPct || 0;
  const heapPct = metrics?.APP_JVM_HeapPct || 0;
  const currentHour = new Date().getUTCHours();
  // Horario laboral Colombia: 13:00-23:00 UTC (8am-6pm COT)
  const isBusinessHours = currentHour >= 13 && currentHour <= 23;

  // ═══════════════════════════════════════════════════════════════
  //  HARD RULES (fast path) — Defensa en profundidad
  //  Estas reglas se evalúan ANTES de llamar a Bedrock.
  //  Si alguna aplica, retornamos inmediatamente sin gastar
  //  tokens de IA. Esto es más rápido y más seguro.
  // ═══════════════════════════════════════════════════════════════

  // Regla 1: Runbooks que crean recursos AWS → SIEMPRE requieren humano
  const EBS_RUNBOOKS = ['RB-ASE-002', 'RB-HANA-002', 'RB-ASE-003'];
  if (EBS_RUNBOOKS.includes(runbookId)) {
    const hardDecision = {
      decision: 'REQUIRES_HUMAN',
      reason: `${runbookId} implica expansión EBS (+costo AWS). Siempre requiere aprobación humana por política costSafe.`,
      condition: 'N/A — acción siempre requiere aprobación',
      alternative: 'Revisar espacio actual con df -h antes de aprobar la expansión.',
      bedrockUsed: false,
      hardRule: true,
    };
    log.info('HARD RULE: EBS runbook requiere humano', { runbookId, decision: 'REQUIRES_HUMAN' });
    await saveAdvisorResult('UC3', systemId, hardDecision);
    return hardDecision;
  }

  // Regla 2: Blocking chains + transacción vieja → RISKY/REQUIRES_HUMAN
  if ((runbookId === 'RB-ASE-001') && blockingChains > 0 && oldestTx > 30) {
    const hardDecision = {
      decision: 'REQUIRES_HUMAN',
      reason: `blocking_chains=${blockingChains} con oldest_tx=${oldestTx}min (>30). DUMP TX podría interrumpir transacción activa bloqueante.`,
      condition: 'Esperar a que oldest_tx < 30 min y blocking_chains = 0.',
      alternative: 'Verificar en SM50/SM66 qué proceso tiene la transacción abierta antes de aprobar.',
      bedrockUsed: false,
      hardRule: true,
    };
    log.info('HARD RULE: blocking + old tx requiere humano', { blockingChains, oldestTx, decision: 'REQUIRES_HUMAN' });
    await saveAdvisorResult('UC3', systemId, hardDecision);
    return hardDecision;
  }

  // Regla 3: Transacción muy vieja sola → REQUIRES_HUMAN
  if ((runbookId === 'RB-ASE-001') && oldestTx > 60) {
    const hardDecision = {
      decision: 'REQUIRES_HUMAN',
      reason: `oldest_tx=${oldestTx}min (>60). DUMP TX podría causar rollback extenso de transacción de larga duración.`,
      condition: 'N/A',
      alternative: 'Identificar la transacción con sp_who y decidir si es seguro hacer DUMP TX.',
      bedrockUsed: false,
      hardRule: true,
    };
    log.info('HARD RULE: old tx > 60 min requiere humano', { oldestTx, decision: 'REQUIRES_HUMAN' });
    await saveAdvisorResult('UC3', systemId, hardDecision);
    return hardDecision;
  }

  // Regla 4: Blocking leve → RISKY
  if ((runbookId === 'RB-ASE-001') && (blockingChains > 0 || oldestTx > 30)) {
    const hardDecision = {
      decision: 'RISKY',
      reason: `blocking_chains=${blockingChains}, oldest_tx=${oldestTx}min. Situación intermedia — acción probablemente segura pero con riesgo.`,
      condition: `Esperar hasta oldest_tx < 30 min y blocking_chains = 0.`,
      alternative: '',
      bedrockUsed: false,
      hardRule: true,
    };
    log.info('HARD RULE: blocking o old tx intermedio', { blockingChains, oldestTx, decision: 'RISKY' });
    await saveAdvisorResult('UC3', systemId, hardDecision);
    return hardDecision;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Si no aplican hard rules → consultar a Bedrock para análisis
  //  más sofisticado con contexto de métricas y horario.
  // ═══════════════════════════════════════════════════════════════

  const safetyPrompt = `Eres el Safety Gate de SAP Spektra. Debes evaluar si una acción automática es SEGURA.

REGLAS DE SEGURIDAD para DUMP TRANSACTION ASE:
- SAFE: oldest_tx < 30 min AND blocking_chains = 0
- RISKY: oldest_tx entre 30-60 min OR blocking leve (1 chain < 10 min)
- REQUIRES_HUMAN: oldest_tx > 60 min OR blocking_chains > 0 con tx antigua

ACCIÓN PROPUESTA: ${runbookId}
SISTEMA: ${systemId} (${systemType}/${dbType}, SID=${sid})
HORA UTC: ${currentHour}:00 (${isBusinessHours ? 'Horario laboral Colombia' : 'Fuera de horario laboral'})

MÉTRICAS ACTUALES:
  oldest_tx_minutes: ${oldestTx}
  blocking_chains: ${blockingChains}
  log_full_pct: ${logFullPct}%
  jvm_heap_pct: ${heapPct}%

Responde EXACTAMENTE con este formato JSON:
{"decision":"SAFE|RISKY|REQUIRES_HUMAN","reason":"razón específica con valores","condition":"qué debe cambiar para ser SAFE (si RISKY)","alternative":"qué verificar antes de aprobar (si HUMAN)"}`;

  const result = await callBedrock(safetyPrompt, SYSTEM_PROMPT, 512, 'UC3');

  let decision;
  if (result.success) {
    try {
      // Intentar parsear JSON de la respuesta
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      decision = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      log.warn('No se pudo parsear respuesta JSON de Bedrock', { useCase: 'UC3' });
      decision = null;
    }
  }

  // Fallback: reglas codificadas si Bedrock falla
  if (!decision) {
    log.info('Usando reglas codificadas (Bedrock no disponible)', { useCase: 'UC3' });
    if (runbookId === 'RB-ASE-001' || runbookId === 'RB-ASE-003') {
      if (oldestTx > 60 || (blockingChains > 0 && oldestTx > 30)) {
        decision = { decision: 'REQUIRES_HUMAN', reason: `oldest_tx=${oldestTx}min, blocking_chains=${blockingChains}. Transacción antigua podría interrumpirse con DUMP TX.`, condition: 'N/A', alternative: 'Verificar en SM50/SM66 qué proceso tiene la transacción abierta.' };
      } else if (oldestTx > 30 || blockingChains > 0) {
        decision = { decision: 'RISKY', reason: `oldest_tx=${oldestTx}min (entre 30-60), blocking_chains=${blockingChains}. Situación intermedia.`, condition: `Esperar hasta oldest_tx < 30 min y blocking_chains = 0.`, alternative: '' };
      } else {
        decision = { decision: 'SAFE', reason: `oldest_tx=${oldestTx}min < 30, blocking_chains=${blockingChains} = 0. Condiciones seguras para DUMP TRANSACTION.`, condition: '', alternative: '' };
      }
    } else {
      // Para otros runbooks costSafe, permitir por defecto
      decision = { decision: 'SAFE', reason: `Runbook ${runbookId} es costSafe=true sin condiciones especiales de seguridad.`, condition: '', alternative: '' };
    }
    decision.bedrockUsed = false;
  } else {
    decision.bedrockUsed = true;
  }

  await saveAdvisorResult('UC3', systemId, decision);

  log.info('Safety Gate decisión', { decision: decision.decision, reason: decision.reason });
  return decision;
}

// ═══════════════════════════════════════════════════════════════
//  UC4 — DIGEST EJECUTIVO DIARIO
//  Trigger: EventBridge 1/día a las 22:00 UTC (5pm Colombia)
// ═══════════════════════════════════════════════════════════════

async function uc4DailyDigest(systemsConfig) {
  log.info('Generando digest ejecutivo diario', { useCase: 'UC4' });

  // Recopilar resumen de 24h para todos los sistemas
  let systemSummaries = '';

  for (const sys of systemsConfig) {
    if (!sys.enabled) continue;

    // Leer estadísticas de 24h de métricas clave
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    const keyMetrics = getDiskMetricsForDbType(sys.database?.type);
    keyMetrics.push('APP_JVM_HeapPct', 'APP_PO_FailedMessages');

    let metricsSection = '';
    for (const metricName of keyMetrics) {
      try {
        const cwResult = await cw.send(new GetMetricStatisticsCommand({
          Namespace: CW_NAMESPACE,
          MetricName: metricName,
          Dimensions: [{ Name: 'SAPSystemId', Value: sys.systemId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 86400, // 24h completo
          Statistics: ['Average', 'Maximum', 'Minimum'],
        }));

        const dp = cwResult.Datapoints?.[0];
        if (dp) {
          metricsSection += `    ${metricName}: avg=${dp.Average?.toFixed(2)}, max=${dp.Maximum?.toFixed(2)}, min=${dp.Minimum?.toFixed(2)}\n`;
        }
      } catch (err) { /* skip */ }
    }

    // Leer incidentes del día desde DynamoDB
    let incidentsSection = '';
    try {
      const incResult = await ddbDoc.send(new QueryCommand({
        TableName: process.env.INCIDENTS_TABLE || 'sap-alwaysops-incidents',
        KeyConditionExpression: 'pk = :pk AND sk > :since',
        ExpressionAttributeValues: { ':pk': `INCIDENT#${sys.systemId}`, ':since': startTime.toISOString() },
        Limit: 20,
      }));
      const count = incResult.Items?.length || 0;
      incidentsSection = `  Incidentes hoy: ${count}\n`;
    } catch (err) {
      incidentsSection = '  Incidentes hoy: datos no disponibles\n';
    }

    systemSummaries += `\nSISTEMA: ${sys.systemId} (${sys.systemType}/${sys.database?.type}, SID=${sys.sid})\n`;
    systemSummaries += metricsSection || '  Sin datos de métricas disponibles\n';
    systemSummaries += incidentsSection;
  }

  const prompt = `DIGEST EJECUTIVO DIARIO — SAP Spektra
Fecha: ${new Date().toISOString().split('T')[0]}
Hora: 5:00 PM Colombia (22:00 UTC)

RESUMEN DE 24 HORAS:
${systemSummaries}

Genera un reporte con estas 3 secciones para diferentes audiencias:

RESUMEN_EJECUTIVO: [2-3 frases NO técnicas para CIO/gerencia — estado general, riesgos principales]

ASPECTOS_TECNICOS: [3-5 bullets con valores numéricos para el equipo SAP Basis]

ACCIONES_MANANA: [2-4 acciones preventivas concretas con runbook IDs para ejecutar mañana temprano]`;

  const result = await callBedrock(prompt, SYSTEM_PROMPT, 1200, 'UC4');

  const digest = result.success ? result.text :
    `DIGEST AUTOMÁTICO (Bedrock no disponible)\n\nRESUMEN_EJECUTIVO: Sistemas SAP operando. Revisar métricas manualmente.\n\nASPECTOS_TECNICOS: Sin análisis IA disponible.\n\nACCIONES_MANANA: Verificar estado de todos los sistemas al inicio del día.`;

  // Guardar en DynamoDB
  for (const sys of systemsConfig) {
    if (sys.enabled) await saveAdvisorResult('UC4', sys.systemId, { digest, bedrockUsed: result.success });
  }

  // Publicar digest por SNS para que email-agent lo envíe
  await publishAdvisorAlert('UC4_DAILY_DIGEST', 'ALL_SYSTEMS', digest);

  return { useCase: 'UC4', bedrockUsed: result.success, systemsIncluded: systemsConfig.filter(s => s.enabled).length };
}

// ═══════════════════════════════════════════════════════════════
//  UC5 — ADAPTACIÓN DE RUNBOOKS
//  Trigger: Invocación síncrona desde runbook-engine antes de
//  presentar pasos al operador/aprobador
// ═══════════════════════════════════════════════════════════════

async function uc5RunbookAdaptation(event) {
  log.info('Adaptación de runbook', { runbookId: event.runbookId, systemId: event.systemId, useCase: 'UC5' });

  const { runbookId, commands, systemId, systemType, dbType, sid, metrics, breach } = event;

  const prompt = `ADAPTACIÓN DE RUNBOOK — ${runbookId}
Sistema: ${systemId} (${systemType}/${dbType}, SID=${sid})

PASOS GENÉRICOS DEL RUNBOOK:
${(commands || []).map((cmd, i) => `  Paso ${i + 1}: ${cmd}`).join('\n')}

MÉTRICAS ACTUALES DEL INCIDENTE:
  Métrica en breach: ${breach?.metricName} = ${breach?.value} (umbral: ${breach?.threshold})

Adapta cada paso al sistema real. Responde con este formato por cada paso:
PASO_1:
  COMANDO: [comando exacto con SID=${sid} y valores reales]
  GENERA_COSTO_AWS: SI/NO
  REQUIERE_APROBACION: SI/NO
  ADVERTENCIA: [basada en métricas actuales, si aplica]
  VERIFICACION: [comando para confirmar éxito del paso]

RIESGO_GENERAL: [BAJO/MEDIO/ALTO/CRÍTICO]
DURACION_ESTIMADA: [minutos totales]`;

  const result = await callBedrock(prompt, SYSTEM_PROMPT, 1024, 'UC5');

  const adaptation = result.success ? result.text :
    `ADAPTACIÓN BÁSICA (Bedrock no disponible)\n\n${(commands || []).map((cmd, i) => `PASO_${i + 1}:\n  COMANDO: ${cmd}\n  GENERA_COSTO_AWS: NO\n  REQUIERE_APROBACION: NO\n  VERIFICACION: echo "Verificar manualmente"\n`).join('\n')}\nRIESGO_GENERAL: MEDIO\nDURACION_ESTIMADA: 15`;

  await saveAdvisorResult('UC5', systemId, { adaptation, bedrockUsed: result.success });

  return { useCase: 'UC5', runbookId, systemId, adaptation, bedrockUsed: result.success };
}

// ═══════════════════════════════════════════════════════════════
//  UC6 — ANÁLISIS DE CHATBOT (INTENT + RESPUESTA)
//  Trigger: Invocación síncrona desde chatbot-agent
//  Analiza el mensaje del usuario, detecta intent, genera respuesta
// ═══════════════════════════════════════════════════════════════

async function uc6ChatbotAnalysis(event) {
  log.info('Análisis de chatbot', { userId: event.userId || 'anónimo', useCase: 'UC6' });

  const { message, conversationHistory, systemsList, currentTime } = event;

  const chatbotPrompt = `Eres Spektra AI, asistente de SAP Spektra. Ayudas a clientes a gestionar sus sistemas SAP.

SISTEMAS DISPONIBLES: ${systemsList || 'No configurados'}
HORA ACTUAL: ${currentTime || new Date().toISOString()}

HISTORIAL DE CONVERSACIÓN:
${(conversationHistory || []).map(m => `${m.role}: ${m.content}`).join('\n').substring(0, 2000)}

MENSAJE DEL USUARIO: ${message}

Analiza el mensaje y responde con JSON:
{
  "intent": "STATUS|BACKUP|RESTART|METRICS|INCIDENTS|RECOMMENDATION|OPERATIONS|CANCEL|HELP|CONVERSATION",
  "systemId": "ID del sistema mencionado o null",
  "parameters": { "scheduledTime": "hora si se menciona", "backupType": "full|log", "restartType": "graceful|force" },
  "response": "respuesta conversacional en español",
  "requiresConfirmation": true si es acción destructiva,
  "actionSummary": "resumen de acción o null",
  "sentiment": "positive|neutral|negative|urgent",
  "confidence": 0.0-1.0
}`;

  const result = await callBedrock(chatbotPrompt, SYSTEM_PROMPT, 800, 'UC6');

  let parsed = null;
  if (result.success) {
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      log.warn('No se pudo parsear JSON de respuesta', { useCase: 'UC6' });
    }
  }

  if (parsed) {
    parsed.bedrockUsed = true;
  } else {
    parsed = {
      intent: 'CONVERSATION',
      systemId: null,
      parameters: {},
      response: 'Entendido. ¿En qué puedo ayudarte con tus sistemas SAP?',
      requiresConfirmation: false,
      actionSummary: null,
      sentiment: 'neutral',
      confidence: 0.3,
      bedrockUsed: false,
    };
  }

  await saveAdvisorResult('UC6', event.systemId || 'CHATBOT', {
    intent: parsed.intent,
    sentiment: parsed.sentiment,
    bedrockUsed: parsed.bedrockUsed,
  });

  return parsed;
}

// ═══════════════════════════════════════════════════════════════
//  UC7 — EVALUACIÓN DE RIESGO DE OPERACIONES PROGRAMADAS
//  Trigger: Invocación síncrona desde scheduler-engine
//  Evalúa el riesgo de ejecutar una operación (backup/reinicio)
// ═══════════════════════════════════════════════════════════════

async function uc7RiskAssessment(event) {
  log.info('Evaluación de riesgo', { operationType: event.operationType, systemId: event.systemId, useCase: 'UC7' });

  const {
    operationType, systemId, sid, systemType, dbType,
    commands, metrics, recentIncidents,
    scheduledTime, requestedBy, currentHourUTC, isBusinessHours,
  } = event;

  const metricsText = Object.entries(metrics || {})
    .map(([k, v]) => `  ${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
    .join('\n');

  const riskPrompt = `EVALUACIÓN DE RIESGO — Operación programada por cliente

OPERACIÓN: ${operationType}
SISTEMA: ${systemId} (${systemType}/${dbType}, SID=${sid})
HORA PROGRAMADA: ${scheduledTime}
HORA ACTUAL UTC: ${currentHourUTC}:00 (${isBusinessHours ? 'Horario laboral Colombia' : 'Fuera de horario'})
SOLICITADO POR: ${requestedBy}
INCIDENTES RECIENTES (4h): ${recentIncidents}

COMANDOS A EJECUTAR:
${(commands || []).map((c, i) => `  ${i + 1}. ${c.substring(0, 100)}`).join('\n')}

MÉTRICAS ACTUALES:
${metricsText || '  Sin métricas disponibles'}

REGLAS DE EVALUACIÓN:
- BACKUP en horario no laboral sin incidentes → LOW
- BACKUP en horario laboral en producción → MEDIUM
- RESTART en desarrollo → MEDIUM
- RESTART en producción fuera de horario → HIGH
- RESTART en producción en horario laboral → CRITICAL
- Incidentes activos incrementan riesgo un nivel
- Disco >90% incrementa riesgo para backups

Responde EXACTAMENTE con JSON:
{
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "reason": "razón específica con valores de métricas",
  "recommendation": "qué hacer antes de ejecutar",
  "autoExecute": true/false,
  "alternativeTime": "hora sugerida si el riesgo es alto",
  "preconditions": ["lista de verificaciones previas"]
}`;

  const result = await callBedrock(riskPrompt, SYSTEM_PROMPT, 600, 'UC7');

  let assessment;
  if (result.success) {
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      assessment = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      log.warn('No se pudo parsear JSON de evaluación', { useCase: 'UC7' });
      assessment = null;
    }
  }

  // Fallback: evaluación básica sin IA
  if (!assessment) {
    log.info('Usando reglas codificadas (Bedrock no disponible)', { useCase: 'UC7' });
    const isProduction = (sid || '').toUpperCase().includes('PRD');

    if (operationType === 'RESTART') {
      if (isBusinessHours && isProduction) {
        assessment = { riskLevel: 'CRITICAL', reason: `Reinicio de ${sid} (PRODUCCIÓN) en horario laboral.`, recommendation: 'Programar fuera de horario laboral (después de 6PM COT).', autoExecute: false, alternativeTime: '05:00 UTC (12AM COT)' };
      } else if (isProduction) {
        assessment = { riskLevel: 'HIGH', reason: `Reinicio de ${sid} (PRODUCCIÓN) fuera de horario.`, recommendation: 'Verificar que no haya jobs batch activos.', autoExecute: false };
      } else {
        assessment = { riskLevel: 'MEDIUM', reason: `Reinicio de ${sid} (no producción).`, recommendation: 'Proceder con precaución.', autoExecute: true };
      }
    } else if (operationType === 'BACKUP') {
      const diskPct = parseFloat(metrics?.DB_ASE_PhysDataPct || metrics?.DB_HANA_DiskPct || 0);
      if (diskPct > 90) {
        assessment = { riskLevel: 'HIGH', reason: `Disco al ${diskPct.toFixed(1)}%. Backup podría quedarse sin espacio.`, recommendation: 'Liberar espacio antes del backup.', autoExecute: false };
      } else if (isBusinessHours && isProduction) {
        assessment = { riskLevel: 'MEDIUM', reason: 'Backup en horario laboral puede causar degradación.', recommendation: 'Proceder — impacto es temporal.', autoExecute: true };
      } else {
        assessment = { riskLevel: 'LOW', reason: 'Backup en condiciones seguras.', recommendation: 'Proceder sin restricciones.', autoExecute: true };
      }
    } else {
      assessment = { riskLevel: 'MEDIUM', reason: 'Operación genérica.', recommendation: 'Verificar estado del sistema.', autoExecute: true };
    }
    assessment.bedrockUsed = false;
  } else {
    assessment.bedrockUsed = true;
  }

  // Validar autoExecute vs riskLevel
  if (['HIGH', 'CRITICAL'].includes(assessment.riskLevel)) {
    assessment.autoExecute = false;
  }

  await saveAdvisorResult('UC7', systemId, {
    operationType,
    riskLevel: assessment.riskLevel,
    autoExecute: assessment.autoExecute,
    bedrockUsed: assessment.bedrockUsed,
  });

  log.info('Evaluación de riesgo completada', { riskLevel: assessment.riskLevel, autoExecute: assessment.autoExecute });
  return assessment;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: publishAdvisorAlert
//  Publica resultados del advisor por SNS
// ═══════════════════════════════════════════════════════════════

async function publishAdvisorAlert(eventType, systemId, content) {
  const topicArn = process.env.ADVISOR_TOPIC_ARN;
  if (!topicArn) return;

  const message = {
    type: 'ADVISOR_RECOMMENDATION',
    subType: eventType,
    systemId,
    recommendation: content,
    timestamp: new Date().toISOString(),
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: `SAP Spektra Advisor ${eventType}: ${systemId}`,
      Message: JSON.stringify(message),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: eventType },
        systemId: { DataType: 'String', StringValue: systemId },
      },
    }));
  } catch (err) {
    log.warn('Error publicando resultado advisor', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: loadSystemsConfig
//  Carga configuración de sistemas desde SSM
// ═══════════════════════════════════════════════════════════════

async function loadSystemsConfig() {
  try {
    const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';
    const param = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
    return JSON.parse(param.Parameter.Value);
  } catch (err) {
    log.warn('Error cargando config', { error: err.message });
    return [{
      systemId: process.env.SYSTEM_ID || 'SAP-DEFAULT',
      systemType: process.env.SYSTEM_TYPE || 'SAP_PO',
      sid: process.env.SYSTEM_SID || 'PRD',
      environment: 'Production',
      enabled: true,
      database: { type: process.env.DB_TYPE || 'SAP_ASE' },
    }];
  }
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL — Rutea a la UC correcta
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Bedrock Advisor v1.0 invocado (7 UC)');
  const startTime = Date.now();

  try {
    // ─── v1.0 — H35: Trial Mode para AI ───
    // Obtener configuración de trial para el sistema actual
    let trialConfig = null;
    let isTrial = false;
    try {
      const systemId = event.systemId || event.detail?.systemId || null;
      if (systemId) {
        trialConfig = await getTrialConfig(systemId);
        isTrial = trialConfig.mode === 'TRIAL';
        if (isTrial) {
          log.info('Bedrock Advisor en modo TRIAL', { aiMaxCallsPerDay: trialConfig.aiMaxCallsPerDay, aiMaxTokens: trialConfig.aiMaxTokens });
        }
      }
    } catch (trialErr) {
      // No-bloqueante: si falla la config de trial, continuar en modo normal
      log.warn('Error obteniendo config trial, continuando en modo normal', { error: trialErr.message });
    }

    // ─── v1.0 Phase 5: AI Config — toggles por UC ───
    const aiConfig = await getAiConfig();
    const requestedUC = event.useCase || event.action || '';

    // Verificar toggle UC
    const ucToggleMap = {
      'UC3': 'UC3_enabled', 'safety-gate': 'UC3_enabled',
      'UC5': 'UC5_enabled', 'adapt-runbook': 'UC5_enabled',
      'UC6': 'UC6_enabled', 'chatbot-analysis': 'UC6_enabled',
      'UC7': 'UC7_enabled', 'risk-assessment': 'UC7_enabled',
    };
    const toggleKey = ucToggleMap[requestedUC];
    if (toggleKey && aiConfig[toggleKey] === false) {
      log.info('UC deshabilitado via SSM toggle', { requestedUC, toggleKey });
      return { statusCode: 200, body: { message: `${requestedUC} deshabilitado via configuracion`, disabled: true, bedrockUsed: false } };
    }

    // ─── UC3: Safety Gate (invocación síncrona desde runbook-engine) ───
    if (event.useCase === 'UC3' || event.action === 'safety-gate') {
      // v1.0 — H35: En trial, verificar límite de llamadas AI antes de UC3
      if (isTrial) {
        try {
          const aiCheck = await checkActionAllowed(event.systemId, 'ai_call', 0);
          if (!aiCheck.allowed) {
            log.info('Llamada AI omitida', { useCase: 'UC3', reason: aiCheck.reason });
            return { statusCode: 200, body: { decision: 'SAFE', reason: 'Trial mode - AI limit reached, usando decisión segura por defecto', bedrockUsed: false, mode: 'TRIAL' } };
          }
        } catch (err) { /* No-bloqueante */ }
      }
      const decision = await uc3SafetyGate(event);
      return { statusCode: 200, body: decision };
    }

    // ─── UC5: Runbook Adaptation (invocación síncrona desde runbook-engine) ───
    if (event.useCase === 'UC5' || event.action === 'adapt-runbook') {
      // v1.0 — H35: En trial, verificar límite de llamadas AI antes de UC5
      if (isTrial) {
        try {
          const aiCheck = await checkActionAllowed(event.systemId, 'ai_call', 0);
          if (!aiCheck.allowed) {
            log.info('Llamada AI omitida', { useCase: 'UC5', reason: aiCheck.reason });
            return { statusCode: 200, body: { useCase: 'UC5', message: 'Trial mode - AI limit reached', bedrockUsed: false, mode: 'TRIAL' } };
          }
        } catch (err) { /* No-bloqueante */ }
      }
      const adaptation = await uc5RunbookAdaptation(event);
      return { statusCode: 200, body: adaptation };
    }

    // ─── UC6: Chatbot Analysis (invocación síncrona desde chatbot-agent) ───
    if (event.useCase === 'UC6' || event.action === 'chatbot-analysis') {
      // v1.0 — H35: En trial, verificar límite de llamadas AI antes de UC6
      if (isTrial) {
        try {
          const aiCheck = await checkActionAllowed(event.systemId || 'CHATBOT', 'ai_call', 0);
          if (!aiCheck.allowed) {
            log.info('Llamada AI omitida', { useCase: 'UC6', reason: aiCheck.reason });
            return { statusCode: 200, body: { intent: 'CONVERSATION', response: 'Modo trial: se alcanzó el límite diario de consultas IA. Intenta de nuevo mañana.', bedrockUsed: false, mode: 'TRIAL' } };
          }
        } catch (err) { /* No-bloqueante */ }
      }
      const analysis = await uc6ChatbotAnalysis(event);
      return { statusCode: 200, body: analysis };
    }

    // ─── UC7: Risk Assessment (invocación síncrona desde scheduler-engine) ───
    if (event.useCase === 'UC7' || event.action === 'risk-assessment') {
      // v1.0 — H35: En trial, verificar límite de llamadas AI antes de UC7
      if (isTrial) {
        try {
          const aiCheck = await checkActionAllowed(event.systemId, 'ai_call', 0);
          if (!aiCheck.allowed) {
            log.info('Llamada AI omitida', { useCase: 'UC7', reason: aiCheck.reason });
            return { statusCode: 200, body: { riskLevel: 'MEDIUM', reason: 'Trial mode - AI limit reached, usando evaluación por defecto', bedrockUsed: false, autoExecute: true, mode: 'TRIAL' } };
          }
        } catch (err) { /* No-bloqueante */ }
      }
      const assessment = await uc7RiskAssessment(event);
      return { statusCode: 200, body: assessment };
    }

    // ─── UC2: Disk Forecast (EventBridge cada 6h) ───
    if (event.source === 'aws.events' && event['detail-type'] === 'SAP Spektra Disk Forecast') {
      const systemsConfig = await loadSystemsConfig();
      const results = await uc2DiskForecast(systemsConfig);
      const duration = Date.now() - startTime;
      return { statusCode: 200, body: { message: 'UC2 Disk Forecast completado', duration: `${duration}ms`, results } };
    }

    // ─── UC4: Daily Digest (EventBridge 1/día 22:00 UTC) ───
    if (event.source === 'aws.events' && event['detail-type'] === 'SAP Spektra Daily Digest') {
      const systemsConfig = await loadSystemsConfig();
      const result = await uc4DailyDigest(systemsConfig);
      const duration = Date.now() - startTime;
      return { statusCode: 200, body: { message: 'UC4 Daily Digest completado', duration: `${duration}ms`, result } };
    }

    // ─── UC1: Incident Analysis (SNS trigger) ───
    const records = event.Records || [];
    if (records.length > 0) {
      const results = [];
      for (const record of records) {
        const snsMessage = record.Sns?.Message;
        if (!snsMessage) continue;

        const message = JSON.parse(snsMessage);

        if (message.type === 'BREACH_DETECTED') {
          // v1.0 — H35: En trial, verificar límite de llamadas AI antes de UC1
          if (isTrial || (!trialConfig && message.systemId)) {
            try {
              const sysTrialConfig = trialConfig || await getTrialConfig(message.systemId);
              if (sysTrialConfig.mode === 'TRIAL') {
                const aiCheck = await checkActionAllowed(message.systemId, 'ai_call', 0);
                if (!aiCheck.allowed) {
                  log.info('Llamada AI omitida', { useCase: 'UC1', reason: aiCheck.reason });
                  results.push({ useCase: 'UC1', systemId: message.systemId, message: 'Trial mode - AI limit reached', mode: 'TRIAL' });
                  continue;
                }
              }
            } catch (err) { /* No-bloqueante */ }
          }
          const result = await uc1IncidentAnalysis(message);
          await publishAdvisorAlert('UC1_INCIDENT_ANALYSIS', message.systemId, result.analysis);
          results.push(result);
        } else if (message.type === 'METRIC_SNAPSHOT') {
          log.info('Snapshot recibido (análisis ligero)', { systemId: message.systemId, useCase: 'UC1' });
          results.push({ useCase: 'UC1-SNAPSHOT', systemId: message.systemId, skipped: true });
        }
      }

      const duration = Date.now() - startTime;
      return { statusCode: 200, body: { message: 'Bedrock Advisor v1.0 completado', duration: `${duration}ms`, results } };
    }

    // ─── Invocación directa sin routing claro ───
    const duration = Date.now() - startTime;
    return { statusCode: 200, body: { message: 'Bedrock Advisor v1.0 listo (7 UC)', duration: `${duration}ms` } };

  } catch (err) {
    log.error('Error fatal', { error: err.message, stack: err.stack });
    return { statusCode: 500, body: { error: err.message } };
  }
};
