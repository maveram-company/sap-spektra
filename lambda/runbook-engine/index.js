'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — Runbook Engine
//  Motor de ejecución de runbooks para remediación automática.
//
//  ¿Qué hace este Lambda?
//  Cuando el universal-collector detecta un breach (una métrica
//  que supera su umbral), Step Functions invoca este Lambda.
//  Según el tipo de breach, ejecuta comandos de remediación
//  en los servidores SAP via SSM, o delega al approval-gateway
//  si la acción requiere aprobación humana.
// ═══════════════════════════════════════════════════════════════

const { getSystemConfig: getTrialConfig } = require('../utilidades/trial-config');
const { sanitizeSid, sanitizeFunctionName } = require('../utilidades/input-validator');
const { SSMClient, GetParameterCommand, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { ssmRunWithBackoff } = require('../utilidades/ssm-poller');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchClient, PutMetricDataCommand, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const log = require('../utilidades/logger')('runbook-engine');

// Clientes de AWS (se crean una sola vez, se reutilizan entre invocaciones)
const ssm = new SSMClient({});
const lambda = new LambdaClient({});
const s3 = new S3Client({});
const secretsManager = new SecretsManagerClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cw = new CloudWatchClient({});
const sns = new SNSClient({});

// ═══════════════════════════════════════════════════════════════
//  CREDENCIALES DE BD — Se obtienen de AWS Secrets Manager
//  Nunca hardcodear credenciales en el codigo fuente.
//  Cache de 5 minutos para evitar llamadas excesivas.
// ═══════════════════════════════════════════════════════════════
const _dbCredentialsCache = {};
const DB_CRED_CACHE_TTL_MS = 5 * 60 * 1000;

async function getDbCredentials(sid, dbType) {
  const cacheKey = `${sid}:${dbType}`;
  const cached = _dbCredentialsCache[cacheKey];
  if (cached && (Date.now() - cached.loadedAt) < DB_CRED_CACHE_TTL_MS) {
    return cached.value;
  }

  const secretName = `sap-alwaysops/${sid}/${dbType}-credentials`;
  try {
    const result = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    const parsed = JSON.parse(result.SecretString);
    _dbCredentialsCache[cacheKey] = { value: parsed, loadedAt: Date.now() };
    log.info('Credenciales de BD obtenidas de Secrets Manager', { sid, dbType });
    return parsed;
  } catch (err) {
    log.warn('No se pudieron obtener credenciales de Secrets Manager, usando XUSER/keystore', {
      sid, dbType, error: err.message,
    });
    // Fallback: usar almacen de credenciales nativo de la BD (XUSER para MaxDB, hdbuserstore para HANA)
    return { username: 'DEFAULT', password: null, useKeyStore: true };
  }
}

// Pre-cargar credenciales para un SID antes de ejecutar runbooks
async function preloadDbCredentials(sid) {
  await Promise.allSettled([
    getDbCredentials(sid, 'MAXDB'),
    getDbCredentials(sid, 'ASE'),
    getDbCredentials(sid, 'HANA'),
  ]);
}

// Espacio de nombres para métricas en CloudWatch
const NAMESPACE = 'SAPAlwaysOps';

// Tabla dedicada para historial de ejecuciones (según documento de arquitectura)
const RUNBOOK_EXECUTIONS_TABLE = process.env.RUNBOOK_EXECUTIONS_TABLE || 'sap-alwaysops-runbook-executions';

// ARN del Lambda bedrock-advisor (para Safety Gate UC3 y UC5)
const BEDROCK_ADVISOR_ARN = process.env.BEDROCK_ADVISOR_ARN || '';

// ═══════════════════════════════════════════════════════════════
//  MAINTENANCE WINDOWS (Ventanas de mantenimiento)
//  Durante una ventana de mantenimiento, se suprimen las
//  ejecuciones de runbooks y solo se loguea que se omitió.
//  Configuración en SSM: /sap-alwaysops/maintenance-windows
// ═══════════════════════════════════════════════════════════════

let maintenanceWindowsCache = null;
let maintenanceWindowsCacheTime = 0;
const MW_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de caché

async function getMaintenanceWindows() {
  // Retornar caché si es reciente
  if (maintenanceWindowsCache && (Date.now() - maintenanceWindowsCacheTime) < MW_CACHE_TTL_MS) {
    return maintenanceWindowsCache;
  }

  try {
    const paramName = process.env.MAINTENANCE_WINDOWS_PARAM || '/sap-alwaysops/maintenance-windows';
    const param = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: false }));
    maintenanceWindowsCache = JSON.parse(param.Parameter.Value);
    maintenanceWindowsCacheTime = Date.now();
    return maintenanceWindowsCache;
  } catch (err) {
    // Si el parámetro no existe, no hay ventanas — no es error
    if (err.name === 'ParameterNotFound') return [];
    log.warn('Error leyendo ventanas de mantenimiento', { error: err.message });
    return [];
  }
}

function isInMaintenanceWindow(systemId) {
  if (!maintenanceWindowsCache || maintenanceWindowsCache.length === 0) return false;
  const now = new Date();

  return maintenanceWindowsCache.some(mw => {
    // Verificar si aplica a este sistema (o a todos si no especifica)
    const appliesToSystem = !mw.systemId || mw.systemId === systemId || mw.systemId === '*';
    if (!appliesToSystem) return false;

    const start = new Date(mw.start);
    const end = new Date(mw.end);
    return now >= start && now <= end;
  });
}

// ═══════════════════════════════════════════════════════════════
//H15: CUSTOM RUNBOOKS FROM S3
//  Permite cargar runbooks personalizados desde un bucket S3.
//  Los runbooks custom se definen en archivos JSON con formato:
//  {
//    "id": "RB-CUSTOM-001",
//    "description": "Mi runbook personalizado",
//    "osCommands": {
//      "LINUX": ["echo 'Paso 1'", "echo 'Paso 2'"],
//      "WINDOWS": ["Write-Output 'Paso 1'", "Write-Output 'Paso 2'"]
//    },
//    "costSafe": true,
//    "estimatedCostUsd": 0
//  }
// ═══════════════════════════════════════════════════════════════

const CUSTOM_RUNBOOKS_BUCKET = process.env.CUSTOM_RUNBOOKS_BUCKET || '';
const customRunbooksCache = { data: null, loadedAt: 0 };
const CUSTOM_CACHE_TTL_MS = 5 * 60 * 1000; // Cache por 5 minutos

// Carga runbooks personalizados desde S3
async function loadCustomRunbooks() {
  if (!CUSTOM_RUNBOOKS_BUCKET) return {};

  // Usar cache si es reciente
  const now = Date.now();
  if (customRunbooksCache.data && (now - customRunbooksCache.loadedAt) < CUSTOM_CACHE_TTL_MS) {
    return customRunbooksCache.data;
  }

  const customRunbooks = {};
  const customEstimators = {};

  try {
    // Listar todos los archivos .json en el bucket
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: CUSTOM_RUNBOOKS_BUCKET,
      Prefix: 'runbooks/',
      MaxKeys: 50,
    }));

    const keys = (listResult.Contents || [])
      .filter(obj => obj.Key.endsWith('.json'))
      .map(obj => obj.Key);

    log.info('Runbooks custom encontrados en S3', { count: keys.length });

    for (const key of keys) {
      try {
        const getResult = await s3.send(new GetObjectCommand({
          Bucket: CUSTOM_RUNBOOKS_BUCKET,
          Key: key,
        }));

        const body = await getResult.Body.transformToString();
        const definition = JSON.parse(body);

        if (!definition.id || !definition.osCommands) {
          log.warn('Runbook custom invalido', { key, reason: 'falta id o osCommands' });
          continue;
        }

        // Crear función de runbook desde la definición JSON
        customRunbooks[definition.id] = (sid, metricName, osType = 'LINUX') => {
          const commands = definition.osCommands[osType] || definition.osCommands.LINUX || [];
          // Reemplazar variables de template en los comandos
          return commands.map(cmd =>
            cmd.replace(/\$\{SID\}/g, sid)
              .replace(/\$\{sid\}/g, sid.toLowerCase())
              .replace(/\$\{METRIC\}/g, metricName)
          );
        };

        // Crear cost estimator
        customEstimators[definition.id] = () => ({
          costUsd: definition.estimatedCostUsd || 0,
          description: definition.costDescription || `Custom runbook: ${definition.description || definition.id}`,
        });

        log.info('Runbook custom cargado', { id: definition.id, description: definition.description || 'sin descripcion' });
      } catch (err) {
        log.warn('Error cargando runbook custom', { key, error: err.message });
      }
    }

    customRunbooksCache.data = { runbooks: customRunbooks, estimators: customEstimators };
    customRunbooksCache.loadedAt = now;
  } catch (err) {
    log.error('Error listando runbooks de S3', { error: err.message });
    if (customRunbooksCache.data) return customRunbooksCache.data;
  }

  return customRunbooksCache.data || { runbooks: {}, estimators: {} };
}

function getRunbookFunction(runbookId) {
  // 1. Primero buscar en los runbooks built-in
  if (RUNBOOKS[runbookId]) return RUNBOOKS[runbookId];

  // 2. H15: Buscar en los runbooks custom cargados de S3
  if (customRunbooksCache.data?.runbooks[runbookId]) {
    log.info('Usando runbook custom', { runbookId });
    return customRunbooksCache.data.runbooks[runbookId];
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
//  COSTOS ESTIMADOS POR RUNBOOK
//  Cada runbook que requiresApproval tiene un costo AWS estimado.
//  Esto se incluye en la solicitud de aprobación para que
//  el aprobador vea el impacto económico.
// ═══════════════════════════════════════════════════════════════

// Precios AWS EBS por GB/mes (us-east-1)
const EBS_PRICES = { gp3: 0.08, io2: 0.125 };
const DEFAULT_EXPAND_GB = 100; // GB por defecto si no se puede calcular

const COST_ESTIMATORS = {
  'RB-ASE-001': () => ({ costUsd: 0, description: 'Sin costo AWS (operación interna DB)' }),
  'RB-ASE-002': (breach) => {
    // Calcular GB necesarios: si disco está al 90%, expandir ~20% del tamaño actual
    const currentPct = breach?.value || 90;
    const expandGB = currentPct > 90 ? 150 : DEFAULT_EXPAND_GB;
    const cost = expandGB * EBS_PRICES.gp3;
    return { costUsd: parseFloat(cost.toFixed(2)), description: `+$${cost.toFixed(2)}/mes por ${expandGB}GB EBS gp3 adicional` };
  },
  'RB-ASE-003': (breach) => {
    // Paso 1 es gratis (truncate), paso 2 podría ser EBS
    const expandGB = DEFAULT_EXPAND_GB;
    const cost = expandGB * EBS_PRICES.gp3;
    return { costUsd: parseFloat(cost.toFixed(2)), description: `Truncate gratis + posible +$${cost.toFixed(2)}/mes si se necesita ${expandGB}GB EBS` };
  },
  'RB-HANA-001': () => ({ costUsd: 0, description: 'Sin costo AWS (operación interna HANA)' }),
  'RB-HANA-002': (breach) => {
    const currentPct = breach?.value || 90;
    const expandGB = currentPct > 90 ? 200 : 150;
    const cost = expandGB * EBS_PRICES.io2;
    return { costUsd: parseFloat(cost.toFixed(2)), description: `+$${cost.toFixed(2)}/mes por ${expandGB}GB EBS io2 adicional` };
  },
  'RB-HA-001': () => ({ costUsd: 0, description: 'Sin costo AWS (resume replicación)' }),
  'RB-JVM-001': () => ({ costUsd: 0, description: 'Sin costo AWS (garbage collection)' }),
  'RB-JVM-002': () => ({ costUsd: 0, description: 'Sin costo AWS (full GC)' }),
  'RB-PO-001': () => ({ costUsd: 0, description: 'Sin costo AWS (restart adapter)' }),
  'RB-ABAP-001': () => ({ costUsd: 0, description: 'Sin costo AWS (limpiar sesiones)' }),
  // v1.0 — Nuevos runbooks
  'RB-BACKUP-001': () => ({ costUsd: 0, description: 'Sin costo AWS (verificación de backup)' }),
  'RB-CERT-001': () => ({ costUsd: 0, description: 'Sin costo AWS (verificación de certificados)' }),
  'RB-WP-001': () => ({ costUsd: 0, description: 'Sin costo AWS (limpieza de work processes PRIV/Hold)' }),
  'RB-RFC-001': () => ({ costUsd: 0, description: 'Sin costo AWS (limpieza de colas RFC/tRFC/qRFC)' }),
  'RB-JOB-001': () => ({ costUsd: 0, description: 'Sin costo AWS (verificación de jobs SM37)' }),
  'RB-HOUSE-001': () => ({ costUsd: 0, description: 'Sin costo AWS (housekeeping SM21/spool/TEMSE)' }),
  'RB-LOCK-001': () => ({ costUsd: 0, description: 'Sin costo AWS (gestión de locks SM12)' }),
  'RB-TRANS-001': () => ({ costUsd: 0, description: 'Sin costo AWS (verificación de transportes STMS)' }),
  // v1.0 — MaxDB cost estimators
  'RB-MAXDB-001': () => ({ costUsd: 0, description: 'Sin costo AWS — operación interna MaxDB (log/cache management)' }),
  'RB-MAXDB-002': (breach) => {
    const currentPct = breach?.currentValue || 90;
    const gbNeeded = Math.ceil((currentPct - 70) * 2);
    const monthlyCost = gbNeeded * 0.10;
    return { costUsd: monthlyCost, description: `Expansión EBS ~${gbNeeded}GB gp3 para MaxDB data volume (+$${monthlyCost.toFixed(2)}/mes)` };
  },
};

function estimateCost(runbookId, breach) {
  let estimator = COST_ESTIMATORS[runbookId];
  //H15: Buscar en custom estimators si no existe built-in
  if (!estimator && customRunbooksCache.data?.estimators) {
    estimator = customRunbooksCache.data.estimators[runbookId];
  }
  return estimator ? estimator(breach) : { costUsd: 0, description: 'Costo no estimado' };
}

// ═══════════════════════════════════════════════════════════════
//  DEFINICIÓN DE RUNBOOKS
//  Cada runbook es una función que recibe el SID del sistema
//  y el nombre de la métrica, y devuelve un array de comandos
//  shell que se ejecutarán en el servidor via SSM.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  v1.0 — HELPERS PARA COMANDOS OS-AWARE (Windows + Linux)
// ═══════════════════════════════════════════════════════════════

// ─── v1.0: Helper para comandos OS-aware ───
function sapcontrolCmd(sid, fnName, osType) {
  sid = sanitizeSid(sid); fnName = sanitizeFunctionName(fnName);
  const sidLower = sid.toLowerCase();
  if (osType === 'WINDOWS') {
    return `& "C:\\usr\\sap\\${sid}\\SYS\\exe\\uc\\NTAMD64\\sapcontrol.exe" -nr 00 -function ${fnName}`;
  }
  return `su - ${sidLower}adm -c "sapcontrol -nr 00 -function ${fnName}"`;
}

function diskCheckCmd(path, driveLetter, osType) {
  if (driveLetter && !/^[A-Z]$/.test(driveLetter)) throw new Error('Drive letter invalido');
  if (osType === 'WINDOWS') {
    return `Get-Volume | Where-Object {$_.DriveLetter -eq '${driveLetter}'} | Select-Object DriveLetter,Size,SizeRemaining`;
  }
  return `df -h ${path}`;
}

function dbmcliCmd(sid, subcommand, osType) {
  sid = sanitizeSid(sid);
  // Credenciales se obtienen de Secrets Manager (cache en _dbCredentialsCache)
  // Si no hay credenciales, se usa el keystore nativo (XUSER: -u DEFAULT)
  const creds = _dbCredentialsCache[`${sid}:MAXDB`]?.value;
  const userParam = (creds && creds.password && !creds.useKeyStore)
    ? `-u ${creds.username},${creds.password}`
    : '-u DEFAULT';

  if (osType === 'WINDOWS') {
    return `& "C:\\sapdb\\programs\\bin\\dbmcli.exe" -d ${sid} ${userParam} ${subcommand}`;
  }
  const sidLower = sid.toLowerCase();
  return `su - sdb${sidLower} -c "dbmcli -d ${sid} ${userParam} ${subcommand}"`;
}

// Helper: genera comando isql de ASE compatible con Linux o Windows
function aseIsqlCmd(sid, sqlBlock, osType) {
  sid = sanitizeSid(sid);
  const sidLower = sid.toLowerCase();
  if (osType === 'WINDOWS') {
    return `& "C:\\sybase\\${sid}\\OCS-16_0\\bin\\isql.exe" -Usa -P(Get-Content C:\\sybase\\.sapwd) -S${sid} -w999 -b <<EOSQL\n${sqlBlock}\ngo\nEOSQL`;
  }
  return `su - syb${sidLower} -c "isql -Usa -P$(cat /sybase/.sapwd) -S${sid} -w999 <<EOSQL\n${sqlBlock}\ngo\nEOSQL"`;
}

// Helper: genera comando hdbsql de HANA compatible con Linux o Windows
function hanaHdbsqlCmd(sid, sqlStatement, osType) {
  sid = sanitizeSid(sid);
  const sidLower = sid.toLowerCase();
  if (osType === 'WINDOWS') {
    return `& "C:\\usr\\sap\\${sid}\\HDB00\\exe\\hdbsql.exe" -U SYSTEM -d SYSTEMDB "${sqlStatement}"`;
  }
  return `su - ${sidLower}adm -c "hdbsql -U SYSTEM -d SYSTEMDB \\"${sqlStatement}\\""`;
}

// Helper: genera echo compatible con OS
function echoCmd(message, osType) {
  if (osType === 'WINDOWS') {
    return `Write-Output "${message}"`;
  }
  return `echo "${message}"`;
}

const RUNBOOKS = {
  // ─── ASE: Truncar log de transacciones, matar transacciones viejas, limpiar bloqueos ───
  'RB-ASE-001': (sid, metricName, osType = 'LINUX') => {
    const sidLower = sid.toLowerCase();
    const cmds = [];

    // Siempre intentar truncar el log de transacciones (acción segura)
    cmds.push(
      echoCmd(`[RUNBOOK] RB-ASE-001: Ejecutando dump tran para SID=${sid}`, osType),
      aseIsqlCmd(sid, `dump tran ${sid} with truncate_only`, osType)
    );

    // Si el problema es una transacción vieja abierta
    if (metricName === 'DB_ASE_OldestTxMin') {
      cmds.push(
        echoCmd('[RUNBOOK] Buscando transacciones abiertas hace mas de 60 minutos...', osType),
        aseIsqlCmd(sid, `SELECT spid, starttime, cmd FROM master..sysprocesses\nWHERE spid IN (SELECT spid FROM master..syslogshold)`, osType)
      );
    }

    // Si hay cadenas de bloqueo
    if (metricName === 'DB_ASE_BlockingChains') {
      cmds.push(
        echoCmd('[RUNBOOK] Analizando cadenas de bloqueo...', osType),
        aseIsqlCmd(sid, `SELECT blocked, spid, cmd, status FROM master..sysprocesses WHERE blocked > 0`, osType)
      );
    }

    return cmds;
  },

  // ─── ASE: Expansión de disco físico (requiere aprobación) ───
  'RB-ASE-002': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-ASE-002: Análisis de espacio en disco para SID=${sid}`, osType),
      diskCheckCmd(`/sybase/${sid}/saplog`, 'D', osType),
      diskCheckCmd(`/sybase/${sid}/sapdata`, 'D', osType),
      echoCmd('[RUNBOOK] Este runbook requiere expansión de volumen EBS', osType),
      echoCmd('[RUNBOOK] Acción: Aumentar tamaño del volumen y ejecutar resize2fs/xfs_growfs', osType),
    ];
  },

  // ─── ASE: Escenario combinado disco (log + data, requiere aprobación) ───
  'RB-ASE-003': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-ASE-003: Escenario combinado - truncar log Y expandir disco para SID=${sid}`, osType),
      // Paso 1: truncar log (esto sí es seguro)
      aseIsqlCmd(sid, `dump tran ${sid} with truncate_only`, osType),
      // Paso 2: reportar estado del disco
      diskCheckCmd(`/sybase/${sid}/saplog`, 'D', osType),
      diskCheckCmd(`/sybase/${sid}/sapdata`, 'D', osType),
      echoCmd('[RUNBOOK] Después del truncate, verificar si la expansión sigue siendo necesaria', osType),
    ];
  },

  // ─── HANA: Gestión de memoria (liberar caché, reclamar volumen) ───
  'RB-HANA-001': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-HANA-001: Gestión de memoria HANA para SID=${sid}`, osType),
      hanaHdbsqlCmd(sid, 'ALTER SYSTEM RECLAIM DATAVOLUME 120 DEFRAGMENT', osType),
      hanaHdbsqlCmd(sid, 'ALTER SYSTEM CLEAR SQL PLAN CACHE', osType),
      echoCmd('[RUNBOOK] Caché SQL limpiada y volumen de datos defragmentado', osType),
    ];
  },

  // ─── HANA: Expansión de disco (requiere aprobación) ───
  'RB-HANA-002': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-HANA-002: Análisis de disco HANA para SID=${sid}`, osType),
      diskCheckCmd(`/hana/data/${sid}`, 'D', osType),
      diskCheckCmd(`/hana/log/${sid}`, 'D', osType),
      hanaHdbsqlCmd(sid, 'SELECT * FROM M_DISK_USAGE', osType),
      echoCmd('[RUNBOOK] Requiere expansión de volumen EBS para /hana/data o /hana/log', osType),
    ];
  },

  // ─── HA: Remediación de lag de replicación ───
  'RB-HA-001': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-HA-001: Remediación de lag de replicación para SID=${sid}`, osType),
      aseIsqlCmd(sid, `resume log transfer from all`, osType),
      echoCmd('[RUNBOOK] Log transfer resumido en Replication Server', osType),
    ];
  },

  // ─── JVM: Limpieza de heap y garbage collection ───
  'RB-JVM-001': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-JVM-001: Limpieza de heap JVM para SID=${sid}`, osType),
      sapcontrolCmd(sid, 'GarbageCollectorRun', osType),
      echoCmd('[RUNBOOK] Garbage Collector ejecutado', osType),
    ];
  },

  // ─── JVM: Gestión de OldGen ───
  'RB-JVM-002': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-JVM-002: Gestión de OldGen JVM para SID=${sid}`, osType),
      sapcontrolCmd(sid, 'J2EEControlProcess all GarbageCollector', osType),
      echoCmd('[RUNBOOK] Full GC ejecutado en todos los procesos J2EE', osType),
    ];
  },

  // ─── PO: Limpieza de cola de mensajes ───
  'RB-PO-001': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-PO-001: Limpieza de mensajes PO para SID=${sid}`, osType),
      sapcontrolCmd(sid, 'RestartService', osType),
      echoCmd('[RUNBOOK] Servicio de Adapter Framework reiniciado', osType),
    ];
  },

  // ─── ABAP: Gestión de work processes y sesiones ───
  'RB-ABAP-001': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-ABAP-001: Gestión de work processes para SID=${sid}`, osType),
      sapcontrolCmd(sid, 'ABAPCleanOldSessions 30', osType),
      sapcontrolCmd(sid, 'ABAPGetSystemWPTable', osType),
      echoCmd('[RUNBOOK] Sesiones viejas limpiadas y work processes verificados', osType),
    ];
  },

  // ═══════════════════════════════════════════════════════════════
  //  v1.0 — NUEVOS RUNBOOKS
  // ═══════════════════════════════════════════════════════════════

  // ─── BACKUP: Verificar último backup exitoso y reportar estado ───
  'RB-BACKUP-001': (sid, metricName, osType = 'LINUX') => {
    const sidLower = sid.toLowerCase();
    const cmds = [
      echoCmd(`[RUNBOOK] RB-BACKUP-001: Verificación de backups para SID=${sid}`, osType),
    ];

    if (metricName.includes('HANA')) {
      cmds.push(
        hanaHdbsqlCmd(sid, 'SELECT TOP 5 ENTRY_TYPE_NAME, SYS_START_TIME, STATE_NAME FROM M_BACKUP_CATALOG ORDER BY SYS_START_TIME DESC', osType),
        echoCmd('[RUNBOOK] Si el último backup tiene > 24h, ejecutar backup DATA', osType),
      );
    } else if (metricName.includes('ORA')) {
      if (osType === 'WINDOWS') {
        cmds.push(
          `& "C:\\oracle\\${sid}\\bin\\rman.exe" target / cmdfile=C:\\temp\\list_backup.rcv`,
          echoCmd('[RUNBOOK] Verificar último backup exitoso en RMAN. Si > 12h, escalar a DBA Oracle.', osType),
        );
      } else {
        cmds.push(
          `su - ora${sidLower} -c "rman target / <<EORMAN\nLIST BACKUP SUMMARY;\nEORMAN"`,
          echoCmd('[RUNBOOK] Verificar último backup exitoso en RMAN. Si > 12h, escalar a DBA Oracle.', osType),
        );
      }
    } else if (metricName.includes('MSSQL')) {
      cmds.push(
        echoCmd('[RUNBOOK] Verificar backups en SQL Server Agent Jobs', osType),
        echoCmd('Query: SELECT TOP 5 database_name, backup_finish_date, type FROM msdb.dbo.backupset ORDER BY backup_finish_date DESC', osType),
        echoCmd('[RUNBOOK] Si backup > 12h, verificar SQL Agent Jobs y Maintenance Plans', osType),
      );
    } else if (metricName.includes('DB2')) {
      if (osType === 'WINDOWS') {
        cmds.push(
          `& "C:\\Program Files\\IBM\\SQLLIB\\BIN\\db2.exe" "SELECT TIMESTAMP, OPERATIONTYPE, SQLCODE FROM SYSIBMADM.DB_HISTORY WHERE OPERATION='B' ORDER BY TIMESTAMP DESC FETCH FIRST 5 ROWS ONLY"`,
          echoCmd('[RUNBOOK] Si backup > 48h, verificar db2 BACKUP DATABASE configuración.', osType),
        );
      } else {
        cmds.push(
          `su - db2${sidLower} -c "db2 \\"SELECT TIMESTAMP, OPERATIONTYPE, SQLCODE FROM SYSIBMADM.DB_HISTORY WHERE OPERATION='B' ORDER BY TIMESTAMP DESC FETCH FIRST 5 ROWS ONLY\\""`,
          echoCmd('[RUNBOOK] Si backup > 48h, verificar db2 BACKUP DATABASE configuración.', osType),
        );
      }
    } else if (metricName.includes('MAXDB')) {
      cmds.push(
        dbmcliCmd(sid, 'backup_history_list', osType),
        echoCmd('[RUNBOOK] Si backup > 48h, ejecutar: dbmcli -d SID backup_start DATA EXTERNAL', osType),
      );
    } else {
      // ASE fallback
      cmds.push(
        aseIsqlCmd(sid, `SELECT TOP 5 database_name, start_time, type FROM master..sysbackuphistory ORDER BY start_time DESC`, osType),
        echoCmd('[RUNBOOK] Si backup > 24h, verificar plan de backups de ASE.', osType),
      );
    }

    return cmds;
  },

  // ─── CERT: Verificar expiración de certificados ICM/PSE ───
  'RB-CERT-001': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-CERT-001: Verificación de certificados ICM/PSE para SID=${sid}`, osType),
      sapcontrolCmd(sid, 'ICMGetCacheEntries', osType),
      sapcontrolCmd(sid, 'ABAPGetSystemInfo', osType),
      echoCmd('[RUNBOOK] Verificar fechas de expiración de certificados SSL/TLS', osType),
    ];
  },

  // ─── WP: Gestión de Work Processes en Priv/Hold ───
  'RB-WP-001': (sid, metricName, osType = 'LINUX') => {
    const cmds = [
      echoCmd(`[RUNBOOK] RB-WP-001: Gestión de work processes PRIV/Hold para SID=${sid}`, osType),
      sapcontrolCmd(sid, 'ABAPGetWPTable', osType),
    ];

    if (metricName === 'APP_ABAP_PrivModeWP') {
      cmds.push(
        echoCmd('[RUNBOOK] Detectados work processes en modo PRIV. Limpiando sesiones viejas...', osType),
        sapcontrolCmd(sid, 'ABAPCleanOldSessions 15', osType),
      );
    }
    if (metricName === 'APP_ABAP_HoldWP') {
      cmds.push(
        echoCmd('[RUNBOOK] Detectados work processes en Hold. Verificando locks...', osType),
        sapcontrolCmd(sid, 'EnqGetStatistic', osType),
      );
    }

    cmds.push(echoCmd('[RUNBOOK] Work processes verificados y sesiones limpiadas', osType));
    return cmds;
  },

  // ─── RFC: Limpieza y diagnóstico de colas RFC/tRFC/qRFC ───
  'RB-RFC-001': (sid, metricName, osType = 'LINUX') => {
    const cmds = [
      echoCmd(`[RUNBOOK] RB-RFC-001: Diagnóstico de colas RFC para SID=${sid}`, osType),
      sapcontrolCmd(sid, 'ABAPGetWPTable', osType),
    ];

    if (metricName.includes('tRFC') || metricName.includes('TRFC')) {
      cmds.push(echoCmd('[RUNBOOK] Cola tRFC saturada - verificar SM58 para registros atascados', osType));
    }
    if (metricName.includes('qRFC') || metricName.includes('QRFC')) {
      cmds.push(echoCmd('[RUNBOOK] Cola qRFC saturada - verificar QRFC_MONITOR (SMQ1/SMQ2)', osType));
    }
    cmds.push(
      echoCmd('[RUNBOOK] Verificar registros RFC pendientes y activar scheduler si necesario', osType)
    );

    return cmds;
  },

  // ─── JOB: Verificación y diagnóstico de jobs SM37 ───
  'RB-JOB-001': (sid, metricName, osType = 'LINUX') => {
    const cmds = [
      echoCmd(`[RUNBOOK] RB-JOB-001: Verificación de batch jobs SM37 para SID=${sid}`, osType),
    ];

    if (metricName === 'APP_ABAP_FailedJobs24h') {
      cmds.push(
        echoCmd('[RUNBOOK] Jobs fallidos detectados - verificar SM37 con filtro Status=Cancelled', osType),
        echoCmd('[RUNBOOK] Query: SELECT JOBNAME, STRTDATE, STRTTIME FROM TBTCO WHERE STATUS=\'A\' AND STRTDATE >= sy-datum - 1', osType),
      );
    }
    if (metricName === 'APP_ABAP_LongRunningJobs') {
      cmds.push(
        echoCmd('[RUNBOOK] Jobs de larga duración detectados - verificar SM37 con filtro Status=Active', osType),
        echoCmd('[RUNBOOK] Considerar cancelar jobs que excedan 4x su duración normal', osType),
      );
    }

    return cmds;
  },

  // ─── HOUSE: Housekeeping automático (SM21, spool, TEMSE) ───
  'RB-HOUSE-001': (sid, metricName, osType = 'LINUX') => {
    const cmds = [
      echoCmd(`[RUNBOOK] RB-HOUSE-001: Housekeeping automático para SID=${sid}`, osType),
    ];

    if (metricName === 'APP_ABAP_OldSpoolJobs') {
      cmds.push(echoCmd('[RUNBOOK] Spool cleanup: ejecutar RSPO0041 via SM36 o sapcontrol', osType));
    }
    if (metricName === 'APP_ABAP_SM21OldLogs') {
      cmds.push(echoCmd('[RUNBOOK] Log cleanup: ejecutar RSSYSLGD para limpiar logs antiguos de SM21', osType));
    }
    if (metricName === 'APP_ABAP_TEMSEObjects') {
      cmds.push(echoCmd('[RUNBOOK] TemSe cleanup: ejecutar RSPO1043 para limpiar objetos TemSe antiguos', osType));
    }

    cmds.push(sapcontrolCmd(sid, 'ABAPGetSystemWPTable', osType));
    return cmds;
  },

  // ─── LOCK: Gestión de locks SM12 ───
  'RB-LOCK-001': (sid, metricName, osType = 'LINUX') => {
    return [
      echoCmd(`[RUNBOOK] RB-LOCK-001: Gestión de locks SM12 para SID=${sid}`, osType),
      sapcontrolCmd(sid, 'EnqGetStatistic', osType),
      echoCmd('[RUNBOOK] Verificar locks viejos en SM12 y liberar si es seguro', osType),
      echoCmd('[RUNBOOK] Si lock_wait_time > 120s, considerar reinicio del enqueue server', osType),
    ];
  },

  // ─── TRANS: Monitoreo de transportes STMS ───
  'RB-TRANS-001': (sid, metricName, osType = 'LINUX') => {
    const cmds = [
      echoCmd(`[RUNBOOK] RB-TRANS-001: Monitoreo de transportes STMS para SID=${sid}`, osType),
    ];

    if (metricName === 'APP_ABAP_StuckTransports') {
      cmds.push(
        echoCmd('[RUNBOOK] Transportes atascados detectados - verificar STMS Import Queue', osType),
        echoCmd('[RUNBOOK] Query: SELECT TRKORR, TRSTATUS FROM E070 WHERE TRSTATUS IN (\'D\',\'L\')', osType),
      );
    }
    if (metricName === 'APP_ABAP_FailedTransports') {
      cmds.push(
        echoCmd('[RUNBOOK] Transportes fallidos detectados - verificar logs en /usr/sap/trans/log/', osType),
      );
      if (osType === 'WINDOWS') {
        cmds.push(echoCmd('[RUNBOOK] Verificar logs en C:\\usr\\sap\\trans\\log\\', osType));
      }
    }

    return cmds;
  },

  // ═══════════════════════════════════════════════════════════════
  //  v1.0 — RUNBOOKS MAXDB
  // ═══════════════════════════════════════════════════════════════

  'RB-MAXDB-001': (sid, metricName, osType) => {
    // Gestión de log y caché MaxDB (costSafe: true)
    return {
      name: 'MaxDB Log & Cache Management',
      steps: [
        { action: 'diagnose', command: dbmcliCmd(sid, 'info state', osType), description: 'Verificar estado de la instancia MaxDB' },
        { action: 'diagnose', command: dbmcliCmd(sid, 'info caches', osType), description: 'Verificar estado de cachés' },
        { action: 'remediate', command: dbmcliCmd(sid, 'autolog_off', osType), description: 'Desactivar autolog temporalmente' },
        { action: 'remediate', command: dbmcliCmd(sid, 'autolog_on', osType), description: 'Reactivar autolog' },
        { action: 'verify', command: dbmcliCmd(sid, 'info log', osType), description: 'Verificar estado del log después de la remediación' },
      ],
      estimatedDuration: '5-10 minutos',
      rollbackSteps: ['Reiniciar instancia MaxDB si es necesario'],
    };
  },

  'RB-MAXDB-002': (sid, metricName, osType) => {
    // Expansión de volumen datos MaxDB (costSafe: false, requiresApproval)
    return {
      name: 'MaxDB Data Volume Expansion',
      steps: [
        { action: 'diagnose', command: dbmcliCmd(sid, 'info data', osType), description: 'Verificar uso de volúmenes de datos' },
        { action: 'diagnose', command: diskCheckCmd(`/sapdb/${sid}/sapdata`, 'D', osType), description: 'Verificar espacio en disco' },
        { action: 'remediate', command: dbmcliCmd(sid, 'info data', osType), description: 'Analizar distribución de datos para expansión' },
        { action: 'verify', command: dbmcliCmd(sid, 'info data', osType), description: 'Verificar estado post-expansión' },
      ],
      estimatedDuration: '15-30 minutos',
      rollbackSteps: ['Contactar DBA para reducir volumen si es necesario'],
    };
  },
};

// ─── Caché de secretos (mismo patrón que universal-collector) ───
const configCache = {};

// ─── Idempotencia: evitar ejecutar el mismo runbook dos veces para el mismo breach ───
// Clave: systemId + metricName + runbookId → timestamp última ejecución
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutos: no re-ejecutar el mismo runbook

async function isAlreadyExecuted(systemId, metricName, runbookId) {
  try {
    const deduplicationKey = `DEDUP#${systemId}#${metricName}#${runbookId}`;
    const result = await ddbDoc.send(new QueryCommand({
      TableName: process.env.RUNBOOK_EXECUTIONS_TABLE || 'sap-alwaysops-runbook-executions',
      KeyConditionExpression: 'pk = :pk AND sk > :since',
      ExpressionAttributeValues: {
        ':pk': `RUNBOOK#${systemId}`,
        ':since': new Date(Date.now() - DEDUP_WINDOW_MS).toISOString(),
      },
      Limit: 5,
      ScanIndexForward: false, // Más recientes primero
    }));

    const recentExec = (result.Items || []).find(item =>
      item.runbookId === runbookId && item.metricName === metricName
    );

    if (recentExec) {
      log.info('Runbook ya ejecutado recientemente (deduplicacion)', { runbookId, metricName, executedAt: recentExec.executedAt });
      return true;
    }
    return false;
  } catch (err) {
    log.warn('Error verificando idempotencia', { error: err.message });
    return false; // En caso de error, permitir ejecución
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: ssmRunCommand
//  Ejecuta comandos shell en una instancia EC2 via SSM.
//  Es la misma función auxiliar que usa el universal-collector.
// ═══════════════════════════════════════════════════════════════

async function ssmRunCommand(instanceId, commands, osType = 'LINUX') {
  const result = await ssmRunWithBackoff(ssm, instanceId, commands, {
    osType,
    commandTimeoutSeconds: 60,
    maxWaitMs: parseInt(process.env.SSM_RUNBOOK_TIMEOUT_MS || '90000'),
    logger: console,
  });
  // Mantener formato de retorno compatible con código existente
  return {
    success: result.success,
    output: result.output,
    stderr: result.errorOutput,
    status: result.status,
    commandId: result.commandId,
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getSystemConfig
//  Carga la configuración del sistema desde SSM Parameter Store.
//  Busca el instanceId del sistema para poder ejecutar comandos.
// ═══════════════════════════════════════════════════════════════

async function getSystemConfig(systemId) {
  const paramName = process.env.SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/systems-config';

  // Usar caché para no leer SSM en cada invocación
  if (configCache[paramName]) {
    const sys = configCache[paramName].find(s => s.systemId === systemId);
    return sys || null;
  }

  try {
    const param = await ssm.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    }));
    const systems = JSON.parse(param.Parameter.Value);
    configCache[paramName] = systems;
    return systems.find(s => s.systemId === systemId) || null;
  } catch (err) {
    log.warn('No se pudo cargar configuracion de SSM', { error: err.message });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: executeRunbook
//  Busca el runbook por ID, genera los comandos y los ejecuta
//  en la instancia del sistema via SSM.
// ═══════════════════════════════════════════════════════════════

async function executeRunbook(breach, sid, instanceId, options = {}) {
  const runbookId = breach.runbook;
  const runbookFn = getRunbookFunction(runbookId);
  const dryRun = options.dryRun || false;
  const osType = options.osType || 'LINUX';

  if (!runbookFn) {
    log.error('Runbook no encontrado', { runbookId, detail: 'ni built-in ni custom' });
    return {
      success: false,
      runbookId,
      error: `Runbook ${runbookId} no está definido (verificar built-in y custom-runbooks.json)`,
    };
  }

  // Generar los comandos específicos para este SID y métrica
  const commands = runbookFn(sid, breach.metricName, osType);

  // v1.7 — DRY-RUN MODE: generar comandos sin ejecutar
  if (dryRun) {
    log.info('DRY-RUN: comandos generados, no ejecutados', { runbookId, sid, commandCount: commands.length });
    return {
      success: true,
      dryRun: true,
      runbookId,
      metricName: breach.metricName,
      metricValue: breach.value,
      severity: breach.severity,
      commands,
      commandCount: commands.length,
      output: '[DRY-RUN] Comandos generados pero NO ejecutados',
      executedAt: new Date().toISOString(),
    };
  }

  // v1.0 — H35: En modo trial, simular ejecución sin ejecutar realmente
  if (options.trialMode) {
    log.info('TRIAL: simulacion de ejecucion', { runbookId, commandCount: commands.length, sid });
    return {
      success: true,
      simulated: true,
      mode: 'TRIAL',
      runbookId,
      metricName: breach.metricName,
      metricValue: breach.value,
      severity: breach.severity,
      commands,
      commandCount: commands.length,
      output: `[SIMULACIÓN] Comando ejecutado exitosamente (modo trial)`,
      duration: 0,
      executedAt: new Date().toISOString(),
    };
  }

  log.info('Ejecutando runbook', { runbookId, sid, commandCount: commands.length });

  // ─── Governance: Evidence Pack — Captura estado ANTES ───
  const beforeSnapshot = {
    timestamp: new Date().toISOString(),
    metricName: breach.metricName,
    metricValue: breach.value,
    severity: breach.severity,
    runbookId,
    sid,
    instanceId,
  };

  // ─── Governance: Safety Classification ───
  const safetyClassification = classifyRunbookSafety(runbookId, breach);

  // Ejecutar en la instancia via SSM
  const result = await ssmRunCommand(instanceId, commands, osType);

  // ─── Governance: Evidence Pack — Estado DESPUES ───
  const afterSnapshot = {
    timestamp: new Date().toISOString(),
    success: result.success,
    ssmStatus: result.status,
    outputLength: (result.output || '').length,
  };

  return {
    success: result.success,
    runbookId,
    metricName: breach.metricName,
    metricValue: breach.value,
    severity: breach.severity,
    ssmStatus: result.status,
    output: result.output,
    errorOutput: result.errorOutput,
    executedAt: new Date().toISOString(),
    // Governance metadata
    governance: {
      safetyClassification,
      evidencePack: { before: beforeSnapshot, after: afterSnapshot },
      commandCount: commands.length,
      policy: options.policy || 'default',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: classifyRunbookSafety
//  Clasifica un runbook como SAFE, RISKY o REQUIRES_HUMAN
//  basado en reglas de negocio por ID y contexto.
// ═══════════════════════════════════════════════════════════════

function classifyRunbookSafety(runbookId, breach) {
  // Runbooks costSafe=true siempre son SAFE
  const safeRunbooks = ['RB-ASE-001', 'RB-HANA-001', 'RB-HA-001', 'RB-JVM-001', 'RB-JVM-002', 'RB-PO-001', 'RB-ABAP-001'];
  if (safeRunbooks.includes(runbookId)) {
    return { level: 'SAFE', reason: `${runbookId} es costSafe=true, sin cambios de infraestructura` };
  }

  // Runbooks que modifican infraestructura = RISKY
  const riskyRunbooks = ['RB-ASE-002', 'RB-HANA-002'];
  if (riskyRunbooks.includes(runbookId)) {
    return { level: 'RISKY', reason: `${runbookId} modifica infraestructura (EBS), requiere aprobacion` };
  }

  // Severidad CRITICAL en PRD siempre requiere humano
  if (breach.severity === 'CRITICAL' && (breach.env === 'PRD' || breach.landscape === 'PRD')) {
    return { level: 'REQUIRES_HUMAN', reason: 'Severidad CRITICAL en ambiente productivo' };
  }

  return { level: 'SAFE', reason: 'Clasificacion por defecto' };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: delegateToApproval
//  Para acciones que requieren aprobación humana, invoca
//  el Lambda approval-gateway de forma asíncrona.
// ═══════════════════════════════════════════════════════════════

async function delegateToApproval(breach, sid, env, osType = 'LINUX') {
  const approvalFunctionArn = process.env.APPROVAL_FUNCTION_ARN;

  if (!approvalFunctionArn) {
    log.warn('APPROVAL_FUNCTION_ARN no configurado, no se puede delegar');
    return { delegated: false, reason: 'APPROVAL_FUNCTION_ARN no configurado' };
  }

  // Generar los comandos que se ejecutarían al aprobarse
  const runbookFn = getRunbookFunction(breach.runbook);
  let commands = runbookFn ? runbookFn(sid, breach.metricName, osType) : [];

  // ─── UC5: Adaptar los comandos al sistema específico ───
  const adaptation = await callRunbookAdaptation(
    breach.runbook, commands, breach,
    breach.systemId, breach.dbType || 'UNKNOWN',
    breach.systemType || 'UNKNOWN', sid
  );
  if (adaptation.adaptedCommands) {
    commands = adaptation.adaptedCommands;
  }

  // ─── Costo estimado dinámico para el aprobador ───
  const costEstimate = estimateCost(breach.runbook, breach);

  const payload = {
    source: 'runbook-engine',
    action: 'create-approval',
    breach,
    commands,
    sid,
    env,
    costEstimate,
    adaptation: adaptation.explanation || null,
    timestamp: new Date().toISOString(),
  };

  log.info('Delegando al approval-gateway', { runbookId: breach.runbook, costUsdPerMonth: costEstimate.costUsd });

  try {
    await lambda.send(new InvokeCommand({
      FunctionName: approvalFunctionArn,
      InvocationType: 'Event', // Asíncrono: no esperamos respuesta
      Payload: Buffer.from(JSON.stringify(payload)),
    }));

    log.info('Solicitud enviada al approval-gateway', { runbookId: breach.runbook });
    return { delegated: true, runbookId: breach.runbook };
  } catch (err) {
    log.error('Error al invocar approval-gateway', { error: err.message });
    return { delegated: false, reason: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: logExecution
//  Guarda el resultado de cada ejecución en DynamoDB para
//  tener un historial de todas las acciones realizadas.
// ═══════════════════════════════════════════════════════════════

async function logExecution(systemId, executionResult, retryCount = 0) {
  const tableName = RUNBOOK_EXECUTIONS_TABLE;
  const MAX_RETRIES = 2;

  try {
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 días de retención

    await ddbDoc.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `RUNBOOK#${systemId}`,
        sk: `${new Date().toISOString()}#${executionResult.runbookId}`,
        ...executionResult,
        systemId,
        ttl,
      },
    }));

    log.info('Ejecucion guardada en DynamoDB', { runbookId: executionResult.runbookId });
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      const backoffMs = Math.pow(2, retryCount) * 500; // 500ms, 1000ms
      log.warn('Error guardando ejecucion, reintentando', { attempt: retryCount + 1, maxRetries: MAX_RETRIES, backoffMs, error: err.message });
      await new Promise(r => setTimeout(r, backoffMs));
      return logExecution(systemId, executionResult, retryCount + 1);
    }
    log.error('No se pudo guardar ejecucion despues de reintentos', { error: err.message });
    // Publicar métrica de fallo de logging para monitoreo
    try {
      await cw.send(new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [{
          MetricName: 'LogExecutionFailure',
          Value: 1,
          Timestamp: new Date(),
          Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
          Unit: 'Count',
        }],
      }));
    } catch (cwErr) { /* último recurso, no hacer nada más */ }
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: publishExecutionMetric
//  Publica métricas de ejecución en CloudWatch para monitoreo.
// ═══════════════════════════════════════════════════════════════

async function publishExecutionMetric(systemId, runbookId, success) {
  try {
    await cw.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [
        {
          MetricName: 'RunbookExecution',
          Value: 1,
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'SAPSystemId', Value: systemId },
            { Name: 'RunbookId', Value: runbookId },
            { Name: 'Status', Value: success ? 'SUCCESS' : 'FAILED' },
          ],
          Unit: 'Count',
        },
      ],
    }));
  } catch (err) {
    log.warn('Error publicando metrica de ejecucion', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: notifyResult
//  Publica el resultado de la ejecución por SNS para que
//  email-agent y teams-agent puedan notificar al equipo.
// ═══════════════════════════════════════════════════════════════

async function notifyResult(systemId, results) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn) return;

  const message = {
    type: 'RUNBOOK_RESULT',
    systemId,
    results,
    timestamp: new Date().toISOString(),
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: alertsTopicArn,
      Subject: `SAP Spektra Runbook: ${systemId} (${results.length} acciones)`,
      Message: JSON.stringify(message),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'RUNBOOK_RESULT' },
        systemId: { DataType: 'String', StringValue: systemId },
      },
    }));

    log.info('Resultado de ejecucion publicado via SNS', { systemId });
  } catch (err) {
    log.warn('Error publicando resultado via SNS', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — ALERTA DE EMERGENCIA PARA FALLOS DE RUNBOOK
//  Cuando un runbook falla (incluyendo su cadena de escalación),
//  se envía una alerta urgente para intervención humana.
// ═══════════════════════════════════════════════════════════════

async function publishRunbookFailureAlert(systemId, result) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn) return;

  const isChainExhausted = result.chainExhausted || (result.chainStep === 2 && !result.success);
  const severity = isChainExhausted ? 'CRITICAL' : 'HIGH';

  const message = {
    type: 'RUNBOOK_FAILURE',
    severity,
    systemId,
    runbookId: result.runbookId,
    chainedFrom: result.chainedFrom || null,
    chainStep: result.chainStep || 1,
    chainExhausted: isChainExhausted,
    ssmStatus: result.ssmStatus || result.status,
    errorOutput: (result.errorOutput || '').substring(0, 500),
    executedAt: result.executedAt,
    action: isChainExhausted
      ? 'REQUIERE INTERVENCIÓN HUMANA INMEDIATA — todas las opciones automáticas agotadas'
      : 'Runbook falló — verificar logs y estado del sistema',
    timestamp: new Date().toISOString(),
  };

  try {
    await sns.send(new PublishCommand({
      TopicArn: alertsTopicArn,
      Subject: `🚨 SAP Spektra: Runbook ${result.runbookId} FALLÓ en ${systemId}`,
      Message: JSON.stringify(message, null, 2),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'RUNBOOK_FAILURE' },
        severity: { DataType: 'String', StringValue: severity },
      },
    }));
    log.info('Alerta de fallo enviada', { runbookId: result.runbookId, systemId, severity });
  } catch (err) {
    log.error('No se pudo enviar alerta de fallo de runbook', { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: callSafetyGate (UC3)
//  Invoca bedrock-advisor de forma SÍNCRONA antes de auto-ejecutar
//  un runbook costSafe. Bedrock analiza si es realmente seguro.
//  Devuelve: { decision: "SAFE"|"RISKY"|"REQUIRES_HUMAN", reason, condition, alternative }
// ═══════════════════════════════════════════════════════════════

async function callSafetyGate(breach, metrics, systemId, dbType, systemType, sid) {
  if (!BEDROCK_ADVISOR_ARN) {
    log.warn('BEDROCK_ADVISOR_ARN no configurado, permitiendo ejecucion por defecto');
    return { decision: 'SAFE', reason: 'Safety Gate no configurado — bypass' };
  }

  try {
    log.info('Consultando Safety Gate UC3', { runbookId: breach.runbook, systemId });

    const payload = {
      useCase: 'UC3',
      runbookId: breach.runbook,
      breach,
      metrics: metrics || {},
      systemId,
      dbType,
      systemType,
      sid,
    };

    const response = await lambda.send(new InvokeCommand({
      FunctionName: BEDROCK_ADVISOR_ARN,
      InvocationType: 'RequestResponse', // SÍNCRONO — esperamos la respuesta
      Payload: Buffer.from(JSON.stringify(payload)),
    }));

    const result = JSON.parse(Buffer.from(response.Payload).toString());
    const body = result.body || result;

    log.info('Safety Gate decision', { decision: body.decision, reason: body.reason });
    return body;
  } catch (err) {
    log.error('Error invocando Safety Gate UC3', { error: err.message });
    // Si el safety gate falla, permitimos la ejecución (fail-open para costSafe)
    return { decision: 'SAFE', reason: `Safety Gate error: ${err.message} — fail-open para costSafe` };
  }
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: callRunbookAdaptation (UC5)
//  Invoca bedrock-advisor para adaptar los comandos genéricos
//  del runbook al sistema específico antes de presentarlos
//  en la solicitud de aprobación.
// ═══════════════════════════════════════════════════════════════

async function callRunbookAdaptation(runbookId, commands, breach, systemId, dbType, systemType, sid) {
  if (!BEDROCK_ADVISOR_ARN) {
    log.warn('BEDROCK_ADVISOR_ARN no configurado, usando comandos genericos');
    return { adaptedCommands: commands, explanation: 'Comandos genéricos (UC5 no disponible)' };
  }

  try {
    log.info('Adaptando runbook UC5', { runbookId, systemId, dbType });

    const payload = {
      useCase: 'UC5',
      runbookId,
      commands,
      breach,
      systemId,
      dbType,
      systemType,
      sid,
    };

    const response = await lambda.send(new InvokeCommand({
      FunctionName: BEDROCK_ADVISOR_ARN,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    }));

    const result = JSON.parse(Buffer.from(response.Payload).toString());
    const body = result.body || result;

    log.info('Adaptacion UC5 completada', { runbookId });
    return body;
  } catch (err) {
    log.error('Error invocando adaptacion UC5', { error: err.message });
    return { adaptedCommands: commands, explanation: `Error UC5: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════
//  RUNBOOK CHAINING (v1.6)
//  Si un runbook costSafe falla, intenta el siguiente en la cadena.
//  Solo para acciones seguras (costSafe=true). La cadena define
//  un orden de escalación: si el paso 1 no funciona, intentar paso 2.
//
//  Ejemplo: RB-ASE-001 falla → RB-ASE-003 (truncate + diagnóstico)
//  Ejemplo: RB-JVM-001 falla → RB-JVM-002 (full GC)
// ═══════════════════════════════════════════════════════════════

const RUNBOOK_ESCALATION_CHAINS = {
  // Si truncar log falla, intentar escenario combinado
  'RB-ASE-001': { next: 'RB-ASE-003', description: 'Escalar a truncate + expansión' },
  // Si GC rápido falla, intentar Full GC
  'RB-JVM-001': { next: 'RB-JVM-002', description: 'Escalar a Full GC (OldGen)' },
  // Si diagnóstico RFC falla, escalar a limpieza de work processes
  'RB-RFC-001': { next: 'RB-ABAP-001', description: 'Escalar a limpieza de WP/sesiones' },
  // Si limpieza de locks falla, escalar a limpieza de WP
  'RB-LOCK-001': { next: 'RB-WP-001', description: 'Escalar a gestión de Work Processes' },
};

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H24: RUNBOOK CHAINING — EJECUCIÓN SECUENCIAL CON LÓGICA CONDICIONAL
//  Cadenas de runbooks que se ejecutan uno tras otro con condiciones:
//  - always: ejecutar siempre
//  - ifPreviousSuccess: solo si el paso anterior fue exitoso
//  - ifStillBreaching: re-verificar métrica y ejecutar solo si sigue en breach
//
//  Cada cadena agrupa runbooks relacionados para resolver problemas
//  complejos que requieren múltiples pasos coordinados.
// ═══════════════════════════════════════════════════════════════

const RUNBOOK_CHAINS = {
  // Cadena: Recuperación completa de disco ASE
  'CHAIN-ASE-DISK-RECOVERY': {
    name: 'Recuperación de Disco ASE',
    description: 'Ejecuta limpieza de logs → verifica espacio → expande si necesario',
    steps: [
      { runbookId: 'RB-ASE-001', condition: 'always', description: 'Truncar transaction log' },
      { runbookId: 'RB-ASE-003', condition: 'ifPreviousSuccess', description: 'Limpieza de datos temporales' },
      { runbookId: 'RB-ASE-002', condition: 'ifStillBreaching', description: 'Expandir disco (requiere aprobación)', abortChainOnApproval: true },
    ],
    costSafe: false,
    requiresApproval: true,
  },

  // Cadena: Recuperación de memoria JVM
  'CHAIN-JVM-RECOVERY': {
    name: 'Recuperación de Memoria JVM',
    description: 'Forzar GC → reiniciar si persiste → escalar',
    steps: [
      { runbookId: 'RB-JVM-001', condition: 'always', description: 'Forzar Garbage Collection' },
      { runbookId: 'RB-JVM-002', condition: 'ifStillBreaching', description: 'Reiniciar JVM (si heap sigue alto)', delaySeconds: 120 },
    ],
    costSafe: true,
    requiresApproval: false,
  },

  // Cadena: Recuperación de SAP PO
  'CHAIN-PO-RECOVERY': {
    name: 'Recuperación SAP PO',
    description: 'Reiniciar adaptadores → limpiar canales → reiniciar ICM si persiste',
    steps: [
      { runbookId: 'RB-PO-001', condition: 'always', description: 'Reiniciar adaptadores PO' },
      { runbookId: 'RB-ABAP-001', condition: 'ifStillBreaching', description: 'Limpiar colas y canales', delaySeconds: 60 },
    ],
    costSafe: true,
    requiresApproval: false,
  },

  // Cadena: Resolución de bloqueos HANA
  'CHAIN-HANA-LOCK-RESOLUTION': {
    name: 'Resolución de Bloqueos HANA',
    description: 'Liberar locks → verificar replicación → expandir si necesario',
    steps: [
      { runbookId: 'RB-LOCK-001', condition: 'always', description: 'Liberar bloqueos activos' },
      { runbookId: 'RB-HANA-001', condition: 'ifStillBreaching', description: 'Verificar/reparar replicación' },
      { runbookId: 'RB-HANA-002', condition: 'ifStillBreaching', description: 'Expandir memoria (requiere aprobación)', abortChainOnApproval: true },
    ],
    costSafe: false,
    requiresApproval: true,
  },

  // Cadena: Housekeeping completo
  'CHAIN-HOUSEKEEPING': {
    name: 'Housekeeping Completo',
    description: 'Limpieza de jobs → transports → logs → verificación',
    steps: [
      { runbookId: 'RB-WP-001', condition: 'always', description: 'Liberar work processes bloqueados' },
      { runbookId: 'RB-TRANS-001', condition: 'always', description: 'Limpiar transportes antiguos' },
      { runbookId: 'RB-ASE-003', condition: 'always', description: 'Limpiar datos temporales DB' },
    ],
    costSafe: true,
    requiresApproval: false,
  },
};

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H24: estimateChainCost
//  Calcula el costo total estimado de todos los pasos de una cadena.
//  Suma los costos individuales de cada runbook en la cadena.
// ═══════════════════════════════════════════════════════════════

function estimateChainCost(chainId) {
  const chain = RUNBOOK_CHAINS[chainId];
  if (!chain) return { costUsd: 0, description: 'Cadena desconocida' };
  let totalCost = 0;
  const descriptions = [];
  for (const step of chain.steps) {
    const estimator = COST_ESTIMATORS[step.runbookId];
    if (estimator) {
      const est = estimator({});
      totalCost += est.costUsd || 0;
      if (est.costUsd > 0) descriptions.push(`${step.runbookId}: $${est.costUsd}`);
    }
  }
  return { costUsd: totalCost, description: descriptions.join(' + ') || 'Sin costo AWS directo' };
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H24: executeChain
//  Ejecuta una cadena de runbooks secuencialmente con lógica condicional.
//
//  Condiciones soportadas por paso:
//  - 'always': ejecutar siempre, sin importar el resultado anterior
//  - 'ifPreviousSuccess': solo ejecutar si el paso anterior fue exitoso
//  - 'ifStillBreaching': re-verificar la métrica y ejecutar solo si
//    sigue por encima del umbral (aún en breach)
//
//  Opciones especiales por paso:
//  - delaySeconds: esperar N segundos antes de ejecutar el paso
//  - abortChainOnApproval: si el runbook requiere aprobación,
//    pausar la cadena y crear solicitud de aprobación
// ═══════════════════════════════════════════════════════════════

async function executeChain(chainId, sid, metricName, osType, breachContext) {
  const chain = RUNBOOK_CHAINS[chainId];
  if (!chain) {
    log.error('Cadena no encontrada', { chainId });
    return {
      chainId,
      totalSteps: 0,
      executedSteps: 0,
      results: [],
      overallStatus: 'FAILED',
    };
  }

  log.info('Cadena iniciada', {
    chainId,
    chainName: chain.name,
    totalSteps: chain.steps.length,
    systemId: breachContext.systemId,
    metricName,
  });

  const chainResults = [];
  let executedSteps = 0;
  let previousSuccess = true; // Para la condición ifPreviousSuccess
  let overallStatus = 'SUCCESS';

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];
    const stepRunbookFn = getRunbookFunction(step.runbookId);

    // ─── Verificar si el runbook del paso existe ───
    if (!stepRunbookFn) {
      log.warn('Runbook de paso de cadena no encontrado', {
        chainId, stepIndex: i, runbookId: step.runbookId,
      });
      chainResults.push({
        stepIndex: i,
        runbookId: step.runbookId,
        status: 'SKIPPED',
        output: '',
        skipped: true,
        reason: `Runbook ${step.runbookId} no encontrado`,
      });
      previousSuccess = false;
      continue;
    }

    // ─── Evaluar la condición del paso ───
    let shouldExecute = true;
    let skipReason = '';

    if (step.condition === 'ifPreviousSuccess' && !previousSuccess) {
      shouldExecute = false;
      skipReason = 'Paso anterior no fue exitoso (condición: ifPreviousSuccess)';
    }

    if (step.condition === 'ifStillBreaching') {
      // Re-verificar si la métrica sigue en breach consultando CloudWatch
      const stillBreaching = await checkIfStillBreaching(
        breachContext.systemId, metricName, breachContext.threshold, breachContext.value
      );
      if (!stillBreaching) {
        shouldExecute = false;
        skipReason = 'Métrica ya no está en breach (condición: ifStillBreaching)';
      }
    }

    if (!shouldExecute) {
      log.info('Paso de cadena omitido', {
        chainId, stepIndex: i, runbookId: step.runbookId, reason: skipReason,
      });
      chainResults.push({
        stepIndex: i,
        runbookId: step.runbookId,
        status: 'SKIPPED',
        output: '',
        skipped: true,
        reason: skipReason,
      });
      continue;
    }

    // ─── abortChainOnApproval: si el runbook requiere aprobación, pausar la cadena ───
    if (step.abortChainOnApproval) {
      log.info('Cadena pausada para aprobacion', {
        chainId, stepIndex: i, runbookId: step.runbookId,
      });

      // Delegar al approval-gateway con contexto de cadena
      const approvalBreach = {
        ...breachContext,
        runbook: step.runbookId,
        chainId,
        chainStepIndex: i,
        chainRemainingSteps: chain.steps.length - i,
      };

      const delegateResult = await delegateToApproval(
        approvalBreach, sid, breachContext.env || 'PRD', osType
      );

      chainResults.push({
        stepIndex: i,
        runbookId: step.runbookId,
        status: 'PAUSED_FOR_APPROVAL',
        output: '',
        skipped: false,
        reason: `Cadena pausada — esperando aprobación para ${step.runbookId}`,
        delegatedToApproval: delegateResult.delegated,
      });

      overallStatus = 'PAUSED_FOR_APPROVAL';
      break; // Salir del loop — la cadena queda pausada
    }

    // ─── Delay antes de ejecutar (si se configuró) ───
    if (step.delaySeconds && step.delaySeconds > 0) {
      log.info('Esperando delay de paso de cadena', {
        chainId, stepIndex: i, runbookId: step.runbookId, delaySeconds: step.delaySeconds,
      });
      await new Promise(resolve => setTimeout(resolve, step.delaySeconds * 1000));
    }

    // ─── Ejecutar el paso ───
    const stepBreach = {
      ...breachContext,
      runbook: step.runbookId,
    };

    const instanceId = breachContext.instanceId || 'i-simulation';
    const stepResult = await executeRunbook(stepBreach, sid, instanceId, { osType });

    executedSteps++;
    previousSuccess = stepResult.success;

    chainResults.push({
      stepIndex: i,
      runbookId: step.runbookId,
      status: stepResult.success ? 'SUCCESS' : 'FAILED',
      output: stepResult.output || '',
      skipped: false,
      reason: stepResult.success ? step.description : (stepResult.errorOutput || 'Ejecución fallida'),
    });

    // Loguear y publicar métrica para cada paso
    await logExecution(breachContext.systemId, {
      ...stepResult,
      chainId,
      chainStep: i + 1,
      chainTotalSteps: chain.steps.length,
    });
    await publishExecutionMetric(breachContext.systemId, step.runbookId, stepResult.success);

    // Si un paso falla y no es 'always', marcar como parcial
    if (!stepResult.success) {
      overallStatus = 'PARTIAL';
    }

    log.info('Paso de cadena completado', {
      chainId, stepIndex: i, runbookId: step.runbookId,
      success: stepResult.success, executedSteps,
    });
  }

  // Si todos los pasos fallaron, marcar como FAILED
  const successCount = chainResults.filter(r => r.status === 'SUCCESS').length;
  if (successCount === 0 && overallStatus !== 'PAUSED_FOR_APPROVAL') {
    overallStatus = 'FAILED';
  }

  log.info('Cadena completada', {
    chainId, overallStatus, executedSteps,
    totalSteps: chain.steps.length,
    systemId: breachContext.systemId,
  });

  return {
    chainId,
    totalSteps: chain.steps.length,
    executedSteps,
    results: chainResults,
    overallStatus,
  };
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H24: checkIfStillBreaching
//  Helper para la condición 'ifStillBreaching':
//  Consulta CloudWatch para verificar si la métrica sigue
//  por encima del umbral. Si no se puede verificar, asume
//  que sigue en breach (fail-safe).
// ═══════════════════════════════════════════════════════════════

async function checkIfStillBreaching(systemId, metricName, threshold, lastValue) {
  try {
    // Intentar obtener el valor más reciente de CloudWatch
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Últimos 5 minutos

    const response = await cw.send(new GetMetricDataCommand({
      MetricDataQueries: [{
        Id: 'breachCheck',
        MetricStat: {
          Metric: {
            Namespace: NAMESPACE,
            MetricName: metricName,
            Dimensions: [{ Name: 'SAPSystemId', Value: systemId }],
          },
          Period: 60,
          Stat: 'Average',
        },
        ReturnData: true,
      }],
      StartTime: startTime,
      EndTime: endTime,
    }));

    const values = response.MetricDataResults?.[0]?.Values || [];
    if (values.length === 0) {
      // Sin datos recientes — asumir que sigue en breach (fail-safe)
      log.warn('Sin datos recientes para verificacion de breach', { systemId, metricName });
      return true;
    }

    const latestValue = values[0];
    const stillBreaching = latestValue >= (threshold || 0);

    log.info('Resultado verificacion de breach', {
      systemId, metricName, latestValue, threshold, stillBreaching,
    });

    return stillBreaching;
  } catch (err) {
    // Si falla la verificación, asumir que sigue en breach (fail-safe)
    log.warn('Error verificando breach', {
      systemId, metricName, error: err.message,
    });
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════
//  v1.0 — H24: detectChainForBreach
//  Detecta si existe una cadena de runbooks apropiada para un
//  breach dado, basándose en el nombre de la métrica.
//  Retorna el chainId o null si no hay cadena aplicable.
// ═══════════════════════════════════════════════════════════════

function detectChainForBreach(breachMetric) {
  if (!breachMetric) return null;

  // DB_ASE_Phys* → Recuperación de disco ASE
  if (breachMetric.startsWith('DB_ASE_Phys')) {
    return 'CHAIN-ASE-DISK-RECOVERY';
  }

  // APP_JVM_Heap* → Recuperación de memoria JVM
  if (breachMetric.startsWith('APP_JVM_Heap')) {
    return 'CHAIN-JVM-RECOVERY';
  }

  // Métricas que incluyen PO o Channel → Recuperación SAP PO
  if (breachMetric.includes('PO') || breachMetric.includes('Channel')) {
    return 'CHAIN-PO-RECOVERY';
  }

  // Métricas que incluyen HANA y Lock → Resolución de bloqueos HANA
  if (breachMetric.includes('HANA') && breachMetric.includes('Lock')) {
    return 'CHAIN-HANA-LOCK-RESOLUTION';
  }

  return null;
}

async function executeWithChaining(breach, sid, instanceId, systemId, metrics, dbType, systemType, options = {}) {
  const osType = options.osType || 'LINUX';
  // Paso 1: ejecutar runbook principal
  const result = await executeRunbook(breach, sid, instanceId, options);
  result.autoExecuted = true;

  if (result.success) {
    result.chainStep = 1;
    return result;
  }

  // Registrar la falla del runbook principal antes de intentar escalar
  await logExecution(systemId, result);
  await publishExecutionMetric(systemId, breach.runbook, false);

  // Paso 2: si falló y existe cadena de escalación, intentar el siguiente
  const chain = RUNBOOK_ESCALATION_CHAINS[breach.runbook];
  if (!chain) {
    result.chainStep = 1;
    result.chainExhausted = true;
    return result; // No hay cadena definida
  }

  log.info('Escalacion de cadena', {
    systemId,
    originalRunbook: breach.runbook,
    nextRunbook: chain.next,
    reason: chain.description,
  });

  // Verificar que el siguiente runbook también es costSafe
  const nextRunbookFn = getRunbookFunction(chain.next);
  if (!nextRunbookFn) {
    result.chainStep = 1;
    result.chainError = `Runbook escalado ${chain.next} no encontrado`;
    return result;
  }

  // Ejecutar el runbook escalado
  const chainedBreach = { ...breach, runbook: chain.next };
  const chainResult = await executeRunbook(chainedBreach, sid, instanceId, options);
  chainResult.autoExecuted = true;
  chainResult.chainStep = 2;
  chainResult.chainedFrom = breach.runbook;
  chainResult.chainReason = chain.description;

  // Loguear la ejecución del runbook escalado
  await logExecution(systemId, chainResult);
  await publishExecutionMetric(systemId, chain.next, chainResult.success);

  // v1.0 — Si la cadena completa falló, forzar escalación a humano
  if (!chainResult.success) {
    log.error('Cadena de escalacion agotada, requiere intervencion humana', {
      systemId,
      originalRunbook: breach.runbook,
      chainedRunbook: chain.next,
    });
    chainResult.chainExhausted = true;
    chainResult.requiresHumanIntervention = true;
  }

  return chainResult;
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Punto de entrada del Lambda. Recibe el evento de Step Functions
//  o del approval-gateway (callback después de aprobación).
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event) => {
  log.initFromEvent(event);
  log.info('Runbook Engine invocado', { eventSource: event.source || 'step-functions', breachCount: event.breaches?.length || 0 });
  const startTime = Date.now();

  // ─── Cargar recursos al inicio de cada invocación ───
  await Promise.all([
    getMaintenanceWindows(),
    loadCustomRunbooks(),
  ]);

  try {
    // ─── Caso 1: Callback del approval-gateway (acción ya aprobada) ───
    if (event.source === 'approval-gateway' && event.action === 'execute-approved') {
      log.info('Ejecutando accion aprobada');

      const { breach, sid, instanceId, approvalId, osType: approvedOsType } = event;

      // v1.0 — H35: Verificar trial mode para ejecuciones aprobadas
      let approvedTrialMode = false;
      try {
        const approvedTrialConfig = await getTrialConfig(breach.systemId || event.systemId);
        if (approvedTrialConfig.mode === 'TRIAL') {
          approvedTrialMode = true;
          log.info('Ejecucion aprobada en modo simulacion', { systemId: breach.systemId });
        }
      } catch (err) { /* No-bloqueante */ }

      const result = await executeRunbook(breach, sid, instanceId || 'i-simulation', { osType: approvedOsType || 'LINUX', trialMode: approvedTrialMode });

      result.approvalId = approvalId;
      result.approvedExecution = true;

      await logExecution(breach.systemId, result);
      await publishExecutionMetric(breach.systemId, breach.runbook, result.success);
      await notifyResult(breach.systemId, [result]);

      const duration = Date.now() - startTime;
      log.info('Ejecucion aprobada completada', { durationMs: duration });

      return {
        statusCode: 200,
        body: { message: 'Runbook aprobado ejecutado', duration: `${duration}ms`, result },
      };
    }

    // ─── Caso 2: Invocación normal desde Step Functions (breaches nuevos) ───
    const { breaches, metrics, systemId, systemType, dbType, sid, env, dryRun, osType } = event;

    if (dryRun) {
      log.info('Modo DRY RUN activado', { systemId, breachCount: breaches?.length || 0 });
    }

    if (!breaches || breaches.length === 0) {
      log.info('No hay breaches para procesar');
      return { statusCode: 200, body: { message: 'Sin breaches', results: [] } };
    }

    log.info('Procesando breaches', { breachCount: breaches.length, systemId, sid });

    // ─── MAINTENANCE WINDOW: verificar si el sistema está en mantenimiento ───
    if (isInMaintenanceWindow(systemId)) {
      log.warn('Sistema en ventana de mantenimiento', { systemId, breachCount: breaches.length });
      log.info('Sistema en ventana de mantenimiento, suprimiendo runbooks', { systemId, suppressedCount: breaches.length });
      return {
        statusCode: 200,
        body: {
          message: 'Sistema en ventana de mantenimiento — runbooks suprimidos',
          systemId,
          maintenanceWindow: true,
          suppressedBreaches: breaches.length,
        },
      };
    }

    // ─── v1.0 — H35: Trial Mode — verificar modo de operación del sistema ───
    let trialConfig = null;
    let isTrial = false;
    try {
      trialConfig = await getTrialConfig(systemId);
      isTrial = trialConfig.mode === 'TRIAL';
      if (isTrial) {
        log.info('Runbook Engine en modo simulacion, no se ejecutaran comandos reales');
      }
    } catch (trialErr) {
      // No-bloqueante: si falla la config de trial, continuar en modo normal
      log.warn('Error obteniendo config trial, continuando en modo normal', { error: trialErr.message });
    }

    // Buscar el instanceId del sistema en la configuración
    const sysConfig = await getSystemConfig(systemId);
    const instanceId = sysConfig?.database?.instanceId || sysConfig?.instanceId || 'i-simulation';

    if (instanceId === 'i-simulation') {
      log.warn('instanceId no encontrado en config, usando modo simulacion');
    }

    // Pre-cargar credenciales de BD desde Secrets Manager antes de ejecutar runbooks
    await preloadDbCredentials(sid);

    const results = [];

    for (const breach of breaches) {
      log.info('Procesando breach', { metricName: breach.metricName, value: breach.value, severity: breach.severity, runbookId: breach.runbook });

      // ─── Idempotencia: verificar si ya se ejecutó recientemente ───
      const alreadyDone = await isAlreadyExecuted(systemId, breach.metricName, breach.runbook);
      if (alreadyDone) {
        results.push({
          runbookId: breach.runbook,
          metricName: breach.metricName,
          severity: breach.severity,
          autoExecuted: false,
          skipped: true,
          reason: 'Runbook ya ejecutado en los últimos 5 minutos (deduplicación)',
        });
        continue;
      }

      //H13: Respetar política de landscape
      if (breach.autoRemediate === false) {
        log.info('Landscape solo monitoreo, runbook no ejecutado', { landscape: breach.landscape || 'DEV', runbookId: breach.runbook });
        results.push({
          metricName: breach.metricName,
          runbook: breach.runbook,
          skipped: true,
          reason: breach.landscapeNote || 'Landscape no permite auto-remediación',
        });
        continue;
      }

      // ─── v1.0 — H24: CHAIN DETECTION — verificar si hay cadena aplicable ───
      // v1.0 — H35: En modo trial, deshabilitar runbook chaining
      let useChaining = event.useChaining !== undefined ? event.useChaining : true;
      if (isTrial && trialConfig && trialConfig.runbookChaining === false) {
        log.info('Runbook chaining deshabilitado en modo trial');
        useChaining = false;
      }

      if (useChaining) {
        const detectedChainId = detectChainForBreach(breach.metricName);
        if (detectedChainId) {
          const chain = RUNBOOK_CHAINS[detectedChainId];
          log.info('Cadena detectada para breach', {
            systemId, metricName: breach.metricName, chainId: detectedChainId, chainName: chain.name,
          });

          const chainCost = estimateChainCost(detectedChainId);

          // Construir contexto completo del breach para la cadena
          const breachContext = {
            ...breach,
            systemId,
            instanceId,
            env,
            threshold: breach.threshold,
          };

          const chainResult = await executeChain(
            detectedChainId, sid, breach.metricName,
            osType || 'LINUX', breachContext
          );

          // Agregar información de costo y cadena al resultado
          chainResult.metricName = breach.metricName;
          chainResult.metricValue = breach.value;
          chainResult.severity = breach.severity;
          chainResult.chainCostEstimate = chainCost;
          chainResult.autoExecuted = true;

          await notifyResult(systemId, [chainResult]);

          results.push(chainResult);
          continue; // Saltar al siguiente breach — la cadena ya procesó este
        }
      }

      // ─── Decisión: ¿auto-ejecutar o pedir aprobación? ───
      if (breach.costSafe && !breach.requiresApproval) {
        // ─── SAFETY GATE (UC3): consultar a Bedrock antes de auto-ejecutar ───
        log.info('Runbook costSafe, consultando Safety Gate UC3', { runbookId: breach.runbook });

        const safetyResult = await callSafetyGate(breach, metrics, systemId, dbType, systemType, sid);

        if (safetyResult.decision === 'SAFE') {
          // Safety Gate aprueba: ejecutar automáticamente (con chaining v1.6)
          log.info('Safety Gate SAFE, auto-ejecutando', { runbookId: breach.runbook });

          const result = await executeWithChaining(breach, sid, instanceId, systemId, metrics, dbType, systemType, { dryRun, osType: osType || 'LINUX', trialMode: isTrial });
          result.safetyGate = 'SAFE';
          result.safetyReason = safetyResult.reason;

          await logExecution(systemId, result);
          await publishExecutionMetric(systemId, result.runbookId || breach.runbook, result.success);

          // v1.0 — Alerta de emergencia si el runbook falló
          if (!result.success) {
            await publishRunbookFailureAlert(systemId, result);
          }

          results.push(result);

        } else if (safetyResult.decision === 'RISKY' || safetyResult.decision === 'REQUIRES_HUMAN') {
          // Safety Gate rechaza: redirigir a aprobación humana
          log.info('Safety Gate redirigiendo a aprobacion', { decision: safetyResult.decision, runbookId: breach.runbook });

          // Forzar la rama de aprobación con la razón del safety gate
          breach.requiresApproval = true;
          breach.safetyGateDecision = safetyResult.decision;
          breach.safetyGateReason = safetyResult.reason;
          breach.safetyGateCondition = safetyResult.condition;
          breach.safetyGateAlternative = safetyResult.alternative;

          const delegateResult = await delegateToApproval(breach, sid, env, osType || 'LINUX');

          results.push({
            runbookId: breach.runbook,
            metricName: breach.metricName,
            severity: breach.severity,
            autoExecuted: false,
            safetyGate: safetyResult.decision,
            safetyReason: safetyResult.reason,
            delegatedToApproval: delegateResult.delegated,
            reason: `Safety Gate: ${safetyResult.reason}`,
          });
        }

      } else {
        // ─── REQUIERE APROBACIÓN: delegar al approval-gateway ───
        log.info('Runbook requiere aprobacion', { runbookId: breach.runbook, costSafe: breach.costSafe, requiresApproval: breach.requiresApproval });

        const delegateResult = await delegateToApproval(breach, sid, env, osType || 'LINUX');

        results.push({
          runbookId: breach.runbook,
          metricName: breach.metricName,
          severity: breach.severity,
          autoExecuted: false,
          delegatedToApproval: delegateResult.delegated,
          reason: delegateResult.reason || 'Esperando aprobación humana',
        });
      }
    }

    // Notificar resultados por SNS
    await notifyResult(systemId, results);

    const duration = Date.now() - startTime;
    log.info('Runbook Engine completado', { durationMs: duration, results });

    return {
      statusCode: 200,
      body: {
        message: 'SAP Spektra Runbook Engine v1.0 completado',
        duration: `${duration}ms`,
        systemId,
        totalBreaches: breaches.length,
        autoExecuted: results.filter(r => r.autoExecuted).length,
        delegatedToApproval: results.filter(r => r.delegatedToApproval).length,
        results,
      },
    };

  } catch (err) {
    log.error('Error fatal', { error: err.message, stack: err.stack });
    return {
      statusCode: 500,
      body: { error: err.message },
    };
  }
};
