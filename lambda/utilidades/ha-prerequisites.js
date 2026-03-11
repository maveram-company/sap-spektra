'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.5 — HA Prerequisites Validation
//  Modulo de validacion de 9 prerequisitos obligatorios antes
//  de cualquier operacion HA (failover/takeover/failback).
//
//  Cada check es independiente: si uno falla, los demas
//  continuan ejecutandose. La operacion se bloquea solo si
//  algun check con required=true tiene status=FAIL.
//
//  Uso:
//    const { runAllPrerequisites, runSinglePrerequisite } = require('./ha-prerequisites');
//    const result = await runAllPrerequisites('SAP-PRD-01', context);
//    if (!result.requiredPassed) throw new Error('Prerequisitos fallidos');
// ═══════════════════════════════════════════════════════════════

const createLogger = require('./logger');
const { PrerequisiteStatus, createPrerequisiteResult } = require('./ha-types');
const { registry, hasDriver } = require('./ha-drivers/driver-registry');

// Lazy-require modulos con dependencias AWS SDK para permitir ejecucion en mock mode
// sin necesidad de tener @aws-sdk instalado (e.g., en tests unitarios).
let _isSidLocked;
function getIsSidLocked() {
  if (!_isSidLocked) {
    try { _isSidLocked = require('./execution-lock').isSidLocked; }
    catch { _isSidLocked = async () => false; }
  }
  return _isSidLocked;
}
let _evaluatePolicy;
function getEvaluatePolicy() {
  if (!_evaluatePolicy) {
    try { _evaluatePolicy = require('./policy-engine').evaluatePolicy; }
    catch { _evaluatePolicy = async () => ({ allowed: true }); }
  }
  return _evaluatePolicy;
}

// Logger estructurado para este modulo
const log = createLogger('ha-prerequisites');

// Determinar si estamos en modo mock
const isMock = () => process.env.MOCK === 'true';

// ─── Definicion de los 9 checks ───────────────────────────────

/**
 * Mapa de checks disponibles.
 * Cada entrada tiene: displayName, description, required, remediation, y la funcion del check.
 * Esto permite correr checks individuales por nombre con runSinglePrerequisite.
 */
const CHECKS_REGISTRY = {
  checkReplicationHealth: {
    displayName: 'Salud de Replicacion DB',
    description: 'Verifica que la replicacion de base de datos esta activa y sincronizada',
    required: true,
    remediation: 'Verificar estado de replicacion con systemReplicationStatus.py o el comando equivalente del motor de BD. Esperar sincronizacion completa antes de proceder.',
    fn: checkReplicationHealth,
  },
  checkClusterHealth: {
    displayName: 'Salud del Cluster (Pacemaker/Corosync)',
    description: 'Verifica que Pacemaker y Corosync estan online y el cluster es saludable',
    required: false,
    remediation: 'Ejecutar "crm status" o "pcs status" en los nodos del cluster. Verificar que todos los nodos estan Online y no hay recursos detenidos.',
    fn: checkClusterHealth,
  },
  checkNetworkConnectivity: {
    displayName: 'Conectividad de Red entre Nodos',
    description: 'Verifica conectividad de red (ping/SSH) entre los nodos primario y secundario',
    required: true,
    remediation: 'Verificar Security Groups, NACLs y Route Tables en AWS. Confirmar que SSM Agent esta activo en ambos nodos.',
    fn: checkNetworkConnectivity,
  },
  checkDiskSpace: {
    displayName: 'Espacio en Disco',
    description: 'Verifica que hay minimo 20% de espacio libre en ambos nodos',
    required: true,
    remediation: 'Liberar espacio en disco eliminando logs antiguos, traces o backups obsoletos. Considerar expandir volumenes EBS si es necesario.',
    fn: checkDiskSpace,
  },
  checkSapStatus: {
    displayName: 'Estado de SAP',
    description: 'Verifica que SAP esta corriendo y respondiendo correctamente',
    required: true,
    remediation: 'Verificar estado de SAP con sapcontrol. Revisar logs en /usr/sap/<SID>/D<NR>/work/. Reiniciar SAP si es necesario antes del failover.',
    fn: checkSapStatus,
  },
  checkBackupRecent: {
    displayName: 'Backup Reciente',
    description: 'Verifica que existe un backup completado en las ultimas 24 horas',
    required: true,
    remediation: 'Ejecutar un backup completo de la base de datos antes de proceder. Comando: hdbsql -U SYSTEM "BACKUP DATA USING FILE (\'pre_failover\')".',
    fn: checkBackupRecent,
  },
  checkMaintenanceWindow: {
    displayName: 'Ventana de Mantenimiento',
    description: 'Verifica que la operacion se ejecuta dentro de la ventana de cambios o tiene bypass aprobado',
    required: false,
    remediation: 'Programar la operacion dentro de la ventana de mantenimiento definida, o solicitar un bypass de emergencia a traves del flujo de aprobacion.',
    fn: checkMaintenanceWindow,
  },
  checkNoActiveOperations: {
    displayName: 'Sin Operaciones Activas',
    description: 'Verifica que no hay otra operacion HA en progreso para este sistema',
    required: true,
    remediation: 'Esperar a que la operacion HA actual finalice. Si la operacion esta colgada, liberar el lock manualmente desde la consola de DynamoDB.',
    fn: checkNoActiveOperations,
  },
  checkDriversAvailable: {
    displayName: 'Drivers HA Disponibles',
    description: 'Verifica que los drivers requeridos estan registrados y saludables en el registry',
    required: true,
    remediation: 'Verificar que los drivers necesarios (network, DB, SAP) estan registrados en el DriverRegistry. Revisar la configuracion del sistema HA.',
    fn: checkDriversAvailable,
  },
};

// ─── Implementacion de cada check ─────────────────────────────

/**
 * Check 1: Verificar que la replicacion de BD esta activa y sincronizada.
 * Delega al driver de BD si esta disponible; si no, usa context.replicationStatus.
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkReplicationHealth(systemId, context) {
  const checkName = 'checkReplicationHealth';
  const meta = CHECKS_REGISTRY[checkName];

  // --- Modo mock: retornar PASS inmediatamente ---
  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: '[MOCK] Replicacion de BD activa y sincronizada (SOK)',
      remediation: '',
    });
  }

  try {
    // Intentar delegar al driver de BD si esta registrado
    const dbStrategy = context.dbStrategy || context.dbType || null;
    if (dbStrategy && hasDriver('DB', dbStrategy)) {
      log.info(`${checkName}: delegando a driver DB:${dbStrategy}`, { systemId });
      const dbDriver = registry.getDriver('DB', dbStrategy);

      // Si el driver implementa checkPrerequisites, usar ese resultado
      if (typeof dbDriver.checkPrerequisites === 'function') {
        const driverChecks = await dbDriver.checkPrerequisites(context);
        // Buscar el check de replicacion en los resultados del driver
        const replicationCheck = driverChecks.find(
          c => c.name === 'replication_health' || c.name === 'checkReplicationHealth'
        );

        if (replicationCheck) {
          log.info(`${checkName}: resultado del driver DB`, {
            systemId,
            status: replicationCheck.status,
          });
          return createPrerequisiteResult({
            name: checkName,
            displayName: meta.displayName,
            description: meta.description,
            status: replicationCheck.status,
            required: meta.required,
            details: `[Driver DB:${dbStrategy}] ${replicationCheck.details}`,
            remediation: replicationCheck.remediation || meta.remediation,
          });
        }
      }
    }

    // Fallback: verificar context.replicationStatus directamente
    const replStatus = context.replicationStatus || context.replication_status || null;

    if (!replStatus) {
      log.warn(`${checkName}: no se pudo determinar estado de replicacion`, { systemId });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.FAIL,
        required: meta.required,
        details: 'No se pudo obtener estado de replicacion: ni driver DB disponible ni replicationStatus en contexto',
        remediation: meta.remediation,
      });
    }

    // Evaluar el estado de replicacion
    const healthyStatuses = ['SOK', 'ACTIVE', 'SYNCING', 'SYNCHRONIZED'];
    const isHealthy = healthyStatuses.includes(replStatus.toUpperCase());
    const isSyncing = replStatus.toUpperCase() === 'SYNCING';

    if (isHealthy && !isSyncing) {
      log.info(`${checkName}: replicacion saludable`, { systemId, replStatus });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.PASS,
        required: meta.required,
        details: `Replicacion activa y sincronizada: ${replStatus}`,
        remediation: '',
      });
    }

    if (isSyncing) {
      log.warn(`${checkName}: replicacion en proceso de sincronizacion`, { systemId, replStatus });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.WARN,
        required: meta.required,
        details: `Replicacion en proceso de sincronizacion: ${replStatus}. Considerar esperar antes de proceder.`,
        remediation: 'Esperar a que la sincronizacion finalice (estado SOK) antes de ejecutar la operacion HA.',
      });
    }

    // Estado no saludable
    log.error(`${checkName}: replicacion no saludable`, { systemId, replStatus });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.FAIL,
      required: meta.required,
      details: `Replicacion no saludable: ${replStatus}`,
      remediation: meta.remediation,
    });
  } catch (err) {
    log.error(`${checkName}: error inesperado`, { systemId, error: err.message, stack: err.stack });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.FAIL,
      required: meta.required,
      details: `Error verificando replicacion: ${err.message}`,
      remediation: meta.remediation,
    });
  }
}

/**
 * Check 2: Verificar salud del cluster Pacemaker/Corosync.
 * Se salta (SKIP) si no hay cluster configurado en el contexto.
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkClusterHealth(systemId, context) {
  const checkName = 'checkClusterHealth';
  const meta = CHECKS_REGISTRY[checkName];

  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: '[MOCK] Cluster Pacemaker/Corosync saludable, todos los nodos Online',
      remediation: '',
    });
  }

  try {
    // Verificar si hay cluster configurado
    const clusterConfigured = context.clusterEnabled === true
      || context.haCluster === true
      || context.networkStrategy === 'PACEMAKER_VIP';

    if (!clusterConfigured) {
      log.info(`${checkName}: cluster no configurado, saltando`, { systemId });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.SKIP,
        required: meta.required,
        details: 'Cluster Pacemaker/Corosync no configurado para este sistema. Check omitido.',
        remediation: '',
      });
    }

    // Evaluar estado del cluster desde el contexto
    const clusterStatus = context.clusterStatus || context.cluster_status || null;

    if (!clusterStatus) {
      log.warn(`${checkName}: estado del cluster no disponible`, { systemId });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.WARN,
        required: meta.required,
        details: 'Estado del cluster no disponible en el contexto. Verificar manualmente con "crm status".',
        remediation: meta.remediation,
      });
    }

    // Evaluar health del cluster
    const healthyStates = ['ONLINE', 'HEALTHY', 'OK', 'ACTIVE'];
    const isHealthy = healthyStates.includes(clusterStatus.toUpperCase());

    const resultStatus = isHealthy ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL;
    const details = isHealthy
      ? `Cluster saludable: ${clusterStatus}. Todos los nodos reportan estado Online.`
      : `Cluster no saludable: ${clusterStatus}. Hay nodos offline o recursos detenidos.`;

    log.info(`${checkName}: resultado`, { systemId, status: resultStatus, clusterStatus });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: resultStatus,
      required: meta.required,
      details,
      remediation: isHealthy ? '' : meta.remediation,
    });
  } catch (err) {
    log.error(`${checkName}: error inesperado`, { systemId, error: err.message, stack: err.stack });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.WARN,
      required: meta.required,
      details: `Error verificando cluster: ${err.message}`,
      remediation: meta.remediation,
    });
  }
}

/**
 * Check 3: Verificar conectividad de red entre nodos (ping/SSH via SSM o mock).
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkNetworkConnectivity(systemId, context) {
  const checkName = 'checkNetworkConnectivity';
  const meta = CHECKS_REGISTRY[checkName];

  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: '[MOCK] Conectividad de red verificada: ping y SSH exitosos entre nodos',
      remediation: '',
    });
  }

  try {
    // Obtener IPs/hostnames de los nodos
    const sourceNode = context.sourceNode || {};
    const targetNode = context.targetNode || {};
    const sourceIp = sourceNode.ip || sourceNode.hostname || context.sourceIp || null;
    const targetIp = targetNode.ip || targetNode.hostname || context.targetIp || null;
    const sourceInstanceId = sourceNode.instanceId || context.sourceInstanceId || null;

    if (!sourceIp || !targetIp) {
      log.warn(`${checkName}: IPs de nodos no disponibles`, { systemId, sourceIp, targetIp });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.WARN,
        required: meta.required,
        details: 'No se pudieron determinar las IPs de los nodos para verificar conectividad. Verificar manualmente.',
        remediation: meta.remediation,
      });
    }

    // Si hay SSM disponible y un instanceId, intentar ping via SSM
    if (sourceInstanceId && context.ssmClient) {
      const { ssmRunWithBackoff } = require('./ssm-poller');
      const pingCmd = `ping -c 3 -W 5 ${targetIp}`;
      const pingResult = await ssmRunWithBackoff(
        context.ssmClient,
        sourceInstanceId,
        [pingCmd],
        { commandTimeoutSeconds: 30, maxWaitMs: 45000, logger: log }
      );

      if (pingResult.success) {
        log.info(`${checkName}: conectividad verificada via SSM`, { systemId, sourceIp, targetIp });
        return createPrerequisiteResult({
          name: checkName,
          displayName: meta.displayName,
          description: meta.description,
          status: PrerequisiteStatus.PASS,
          required: meta.required,
          details: `Conectividad verificada: ping de ${sourceIp} a ${targetIp} exitoso.`,
          remediation: '',
        });
      }

      log.warn(`${checkName}: ping fallo via SSM`, { systemId, output: pingResult.errorOutput });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.FAIL,
        required: meta.required,
        details: `Ping de ${sourceIp} a ${targetIp} fallo: ${pingResult.errorOutput || pingResult.status}`,
        remediation: meta.remediation,
      });
    }

    // Sin SSM: verificar desde el contexto si hay info de conectividad
    const connectivityStatus = context.networkConnectivity || context.connectivity || null;
    if (connectivityStatus) {
      const isOk = connectivityStatus === true || connectivityStatus === 'OK' || connectivityStatus === 'CONNECTED';
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: isOk ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
        required: meta.required,
        details: isOk
          ? `Conectividad entre nodos confirmada: ${sourceIp} <-> ${targetIp}`
          : `Conectividad entre nodos fallo: ${connectivityStatus}`,
        remediation: isOk ? '' : meta.remediation,
      });
    }

    // Sin forma de verificar: advertencia
    log.warn(`${checkName}: no se pudo verificar conectividad automaticamente`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.WARN,
      required: meta.required,
      details: `No se pudo verificar conectividad automaticamente entre ${sourceIp} y ${targetIp}. Sin SSM client en contexto.`,
      remediation: meta.remediation,
    });
  } catch (err) {
    log.error(`${checkName}: error inesperado`, { systemId, error: err.message, stack: err.stack });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.FAIL,
      required: meta.required,
      details: `Error verificando conectividad de red: ${err.message}`,
      remediation: meta.remediation,
    });
  }
}

/**
 * Check 4: Verificar espacio en disco minimo 20% libre en ambos nodos.
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkDiskSpace(systemId, context) {
  const checkName = 'checkDiskSpace';
  const meta = CHECKS_REGISTRY[checkName];
  const MIN_FREE_PERCENT = 20;

  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: `[MOCK] Espacio en disco suficiente: >=${MIN_FREE_PERCENT}% libre en ambos nodos`,
      remediation: '',
    });
  }

  try {
    // Verificar espacio desde el contexto (puede venir del collector o de SSM)
    const diskInfo = context.diskSpace || context.disk || null;

    if (diskInfo) {
      // diskInfo puede ser: { source: { freePercent: 45 }, target: { freePercent: 32 } }
      // o: { freePercent: 40 } (general)
      // o: un numero directo (porcentaje libre)
      let sourceFree = null;
      let targetFree = null;

      if (typeof diskInfo === 'number') {
        sourceFree = diskInfo;
        targetFree = diskInfo;
      } else if (typeof diskInfo === 'object') {
        if (diskInfo.source && diskInfo.target) {
          sourceFree = diskInfo.source.freePercent || diskInfo.source.free_percent || diskInfo.source;
          targetFree = diskInfo.target.freePercent || diskInfo.target.free_percent || diskInfo.target;
        } else {
          sourceFree = diskInfo.freePercent || diskInfo.free_percent || null;
          targetFree = sourceFree;
        }
      }

      // Convertir a numeros si vienen como strings
      if (typeof sourceFree === 'string') sourceFree = parseFloat(sourceFree);
      if (typeof targetFree === 'string') targetFree = parseFloat(targetFree);

      if (sourceFree !== null && targetFree !== null && !isNaN(sourceFree) && !isNaN(targetFree)) {
        const sourceOk = sourceFree >= MIN_FREE_PERCENT;
        const targetOk = targetFree >= MIN_FREE_PERCENT;
        const allOk = sourceOk && targetOk;

        const detailParts = [];
        detailParts.push(`Nodo source: ${sourceFree.toFixed(1)}% libre${sourceOk ? ' (OK)' : ' (INSUFICIENTE)'}`);
        detailParts.push(`Nodo target: ${targetFree.toFixed(1)}% libre${targetOk ? ' (OK)' : ' (INSUFICIENTE)'}`);

        log.info(`${checkName}: resultado`, { systemId, sourceFree, targetFree, allOk });
        return createPrerequisiteResult({
          name: checkName,
          displayName: meta.displayName,
          description: meta.description,
          status: allOk ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
          required: meta.required,
          details: `Minimo requerido: ${MIN_FREE_PERCENT}%. ${detailParts.join('. ')}.`,
          remediation: allOk ? '' : meta.remediation,
        });
      }
    }

    // Sin informacion de disco disponible
    log.warn(`${checkName}: informacion de disco no disponible`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.WARN,
      required: meta.required,
      details: `No se pudo obtener informacion de espacio en disco. Verificar manualmente que hay >=${MIN_FREE_PERCENT}% libre.`,
      remediation: meta.remediation,
    });
  } catch (err) {
    log.error(`${checkName}: error inesperado`, { systemId, error: err.message, stack: err.stack });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.FAIL,
      required: meta.required,
      details: `Error verificando espacio en disco: ${err.message}`,
      remediation: meta.remediation,
    });
  }
}

/**
 * Check 5: Verificar que SAP esta corriendo y respondiendo.
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkSapStatus(systemId, context) {
  const checkName = 'checkSapStatus';
  const meta = CHECKS_REGISTRY[checkName];

  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: '[MOCK] SAP corriendo y respondiendo correctamente. Todos los procesos GREEN.',
      remediation: '',
    });
  }

  try {
    // Intentar verificar via driver SAP si esta disponible
    const sapStrategy = context.sapStrategy || 'sap-services';
    if (hasDriver('SAP', sapStrategy)) {
      log.info(`${checkName}: delegando health check a driver SAP:${sapStrategy}`, { systemId });
      const sapDriver = registry.getDriver('SAP', sapStrategy);

      if (typeof sapDriver.healthCheck === 'function') {
        const health = await sapDriver.healthCheck(context);
        const isHealthy = health.healthy === true;

        return createPrerequisiteResult({
          name: checkName,
          displayName: meta.displayName,
          description: meta.description,
          status: isHealthy ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
          required: meta.required,
          details: isHealthy
            ? `SAP ${context.sid || ''} corriendo y respondiendo. Procesos: ${health.processes || 'OK'}`
            : `SAP ${context.sid || ''} no saludable: ${health.error || 'sin detalles'}`,
          remediation: isHealthy ? '' : meta.remediation,
        });
      }
    }

    // Fallback: verificar desde el contexto
    const sapStatus = context.sapStatus || context.sap_status || null;

    if (!sapStatus) {
      log.warn(`${checkName}: estado de SAP no disponible`, { systemId });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.WARN,
        required: meta.required,
        details: 'Estado de SAP no disponible en contexto ni via driver. Verificar manualmente con sapcontrol.',
        remediation: meta.remediation,
      });
    }

    // Evaluar estado
    const runningStates = ['RUNNING', 'GREEN', 'ACTIVE', 'OK', 'STARTED'];
    const isRunning = runningStates.includes(sapStatus.toUpperCase());

    log.info(`${checkName}: resultado`, { systemId, sapStatus, isRunning });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: isRunning ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
      required: meta.required,
      details: isRunning
        ? `SAP corriendo correctamente: ${sapStatus}`
        : `SAP no esta corriendo: ${sapStatus}`,
      remediation: isRunning ? '' : meta.remediation,
    });
  } catch (err) {
    log.error(`${checkName}: error inesperado`, { systemId, error: err.message, stack: err.stack });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.FAIL,
      required: meta.required,
      details: `Error verificando estado de SAP: ${err.message}`,
      remediation: meta.remediation,
    });
  }
}

/**
 * Check 6: Verificar que existe un backup reciente (menos de 24 horas).
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkBackupRecent(systemId, context) {
  const checkName = 'checkBackupRecent';
  const meta = CHECKS_REGISTRY[checkName];
  const MAX_BACKUP_AGE_HOURS = 24;
  const MAX_BACKUP_AGE_MS = MAX_BACKUP_AGE_HOURS * 60 * 60 * 1000;

  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: `[MOCK] Ultimo backup hace 4 horas. Dentro del limite de ${MAX_BACKUP_AGE_HOURS}h.`,
      remediation: '',
    });
  }

  try {
    // Verificar info de backup desde contexto
    const lastBackup = context.lastBackupTimestamp
      || context.lastBackup
      || context.backup_timestamp
      || null;

    if (!lastBackup) {
      log.warn(`${checkName}: timestamp del ultimo backup no disponible`, { systemId });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.WARN,
        required: meta.required,
        details: `No se encontro informacion del ultimo backup. Verificar manualmente que hay un backup de menos de ${MAX_BACKUP_AGE_HOURS}h.`,
        remediation: meta.remediation,
      });
    }

    // Calcular edad del backup
    const backupDate = new Date(lastBackup);
    if (isNaN(backupDate.getTime())) {
      log.warn(`${checkName}: formato de fecha de backup invalido`, { systemId, lastBackup });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.WARN,
        required: meta.required,
        details: `Formato de fecha de backup invalido: ${lastBackup}. No se puede determinar la edad.`,
        remediation: meta.remediation,
      });
    }

    const ageMs = Date.now() - backupDate.getTime();
    const ageHours = ageMs / (60 * 60 * 1000);
    const isRecent = ageMs < MAX_BACKUP_AGE_MS;

    log.info(`${checkName}: resultado`, { systemId, ageHours: ageHours.toFixed(1), isRecent });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: isRecent ? PrerequisiteStatus.PASS : PrerequisiteStatus.FAIL,
      required: meta.required,
      details: isRecent
        ? `Ultimo backup hace ${ageHours.toFixed(1)} horas. Dentro del limite de ${MAX_BACKUP_AGE_HOURS}h.`
        : `Ultimo backup hace ${ageHours.toFixed(1)} horas. Excede el limite de ${MAX_BACKUP_AGE_HOURS}h.`,
      remediation: isRecent ? '' : meta.remediation,
    });
  } catch (err) {
    log.error(`${checkName}: error inesperado`, { systemId, error: err.message, stack: err.stack });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.FAIL,
      required: meta.required,
      details: `Error verificando backup reciente: ${err.message}`,
      remediation: meta.remediation,
    });
  }
}

/**
 * Check 7: Verificar que la operacion esta dentro de la ventana de mantenimiento
 * o que tiene un bypass aprobado.
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkMaintenanceWindow(systemId, context) {
  const checkName = 'checkMaintenanceWindow';
  const meta = CHECKS_REGISTRY[checkName];

  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: '[MOCK] Dentro de ventana de mantenimiento aprobada',
      remediation: '',
    });
  }

  try {
    // Verificar si hay bypass de emergencia aprobado
    const bypassApproved = context.maintenanceBypass === true
      || context.emergencyBypass === true
      || context.bypassApproved === true;

    if (bypassApproved) {
      log.info(`${checkName}: bypass de emergencia aprobado`, { systemId });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.PASS,
        required: meta.required,
        details: 'Bypass de ventana de mantenimiento aprobado. Operacion autorizada fuera de ventana.',
        remediation: '',
      });
    }

    // Consultar al policy engine si la operacion esta permitida
    const policyContext = {
      environment: context.environment || context.env || 'PRD',
      haEnabled: true,
      operationType: context.operationType || 'TAKEOVER',
      maintenanceWindow: true,
    };

    const policyResult = await getEvaluatePolicy()('ha_operation', policyContext);

    if (policyResult.allowed) {
      log.info(`${checkName}: operacion permitida por politica`, { systemId, reason: policyResult.reason });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.PASS,
        required: meta.required,
        details: `Operacion permitida por politica: ${policyResult.reason}`,
        remediation: '',
      });
    }

    // Verificar ventana de mantenimiento manual
    const maintenanceWindow = context.maintenanceWindow || null;
    if (maintenanceWindow) {
      const now = new Date();
      const windowStart = maintenanceWindow.start ? new Date(maintenanceWindow.start) : null;
      const windowEnd = maintenanceWindow.end ? new Date(maintenanceWindow.end) : null;

      if (windowStart && windowEnd && now >= windowStart && now <= windowEnd) {
        log.info(`${checkName}: dentro de ventana de mantenimiento`, { systemId });
        return createPrerequisiteResult({
          name: checkName,
          displayName: meta.displayName,
          description: meta.description,
          status: PrerequisiteStatus.PASS,
          required: meta.required,
          details: `Dentro de ventana de mantenimiento: ${windowStart.toISOString()} - ${windowEnd.toISOString()}`,
          remediation: '',
        });
      }

      log.warn(`${checkName}: fuera de ventana de mantenimiento`, { systemId });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.WARN,
        required: meta.required,
        details: `Fuera de ventana de mantenimiento. Ventana: ${windowStart ? windowStart.toISOString() : '?'} - ${windowEnd ? windowEnd.toISOString() : '?'}. Hora actual: ${now.toISOString()}.`,
        remediation: meta.remediation,
      });
    }

    // Sin ventana de mantenimiento configurada y politica no permitida
    log.warn(`${checkName}: sin ventana de mantenimiento definida`, { systemId, policyAction: policyResult.action });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.WARN,
      required: meta.required,
      details: `Sin ventana de mantenimiento configurada. Politica: ${policyResult.action} - ${policyResult.reason}`,
      remediation: meta.remediation,
    });
  } catch (err) {
    log.error(`${checkName}: error inesperado`, { systemId, error: err.message, stack: err.stack });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.WARN,
      required: meta.required,
      details: `Error verificando ventana de mantenimiento: ${err.message}`,
      remediation: meta.remediation,
    });
  }
}

/**
 * Check 8: Verificar que no hay otra operacion HA activa para este sistema.
 * Usa el modulo execution-lock para consultar el estado del lock.
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkNoActiveOperations(systemId, context) {
  const checkName = 'checkNoActiveOperations';
  const meta = CHECKS_REGISTRY[checkName];

  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: '[MOCK] No hay operaciones HA activas para este sistema',
      remediation: '',
    });
  }

  try {
    // Extraer SID del systemId o del contexto
    const sid = context.sid || systemId.split('-')[1] || systemId;

    log.info(`${checkName}: verificando lock para SID: ${sid}`, { systemId });
    const lockStatus = await getIsSidLocked()(sid);

    if (lockStatus.locked) {
      log.warn(`${checkName}: SID bloqueado por otra operacion`, {
        systemId,
        sid,
        executionId: lockStatus.executionId,
        lockedAt: lockStatus.lockedAt,
      });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.FAIL,
        required: meta.required,
        details: `Hay una operacion HA activa: executionId=${lockStatus.executionId}, iniciada: ${lockStatus.lockedAt}. Esperar a que termine.`,
        remediation: meta.remediation,
      });
    }

    log.info(`${checkName}: no hay operaciones activas`, { systemId, sid });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: `No hay operaciones HA activas para SID: ${sid}. El sistema esta libre.`,
      remediation: '',
    });
  } catch (err) {
    log.error(`${checkName}: error verificando lock`, { systemId, error: err.message, stack: err.stack });
    // Si no podemos verificar el lock, es mejor bloquear la operacion
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.FAIL,
      required: meta.required,
      details: `Error verificando operaciones activas: ${err.message}. Por seguridad, bloqueando operacion.`,
      remediation: meta.remediation,
    });
  }
}

/**
 * Check 9: Verificar que los drivers HA requeridos estan registrados y saludables.
 *
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito
 */
async function checkDriversAvailable(systemId, context) {
  const checkName = 'checkDriversAvailable';
  const meta = CHECKS_REGISTRY[checkName];

  if (isMock()) {
    log.info(`[MOCK] ${checkName} - simulando PASS`, { systemId });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: '[MOCK] Todos los drivers HA requeridos estan registrados y saludables',
      remediation: '',
    });
  }

  try {
    // Determinar que drivers se necesitan
    const networkStrategy = context.networkStrategy || 'eip';
    const dbStrategy = context.dbStrategy || context.dbType || 'hana-sr';
    const sapStrategy = context.sapStrategy || 'sap-services';

    const requiredDrivers = [
      { type: 'NETWORK', name: networkStrategy, label: 'Red' },
      { type: 'DB', name: dbStrategy, label: 'Base de Datos' },
      { type: 'SAP', name: sapStrategy, label: 'SAP Services' },
    ];

    const missing = [];
    const found = [];
    const healthResults = [];

    for (const driver of requiredDrivers) {
      const registered = hasDriver(driver.type, driver.name);
      if (!registered) {
        missing.push(`${driver.label} (${driver.type}:${driver.name})`);
        continue;
      }

      found.push(`${driver.label} (${driver.type}:${driver.name})`);

      // Verificar health del driver si es posible
      try {
        const driverInstance = registry.getDriver(driver.type, driver.name);
        if (typeof driverInstance.healthCheck === 'function') {
          const health = await driverInstance.healthCheck(context);
          healthResults.push({
            driver: `${driver.type}:${driver.name}`,
            healthy: health.healthy !== false,
            details: health.healthy !== false ? 'saludable' : (health.error || 'no saludable'),
          });
        }
      } catch (healthErr) {
        healthResults.push({
          driver: `${driver.type}:${driver.name}`,
          healthy: false,
          details: `error en health check: ${healthErr.message}`,
        });
      }
    }

    // Evaluar resultado
    if (missing.length > 0) {
      log.warn(`${checkName}: drivers faltantes`, { systemId, missing });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.FAIL,
        required: meta.required,
        details: `Drivers no registrados: ${missing.join(', ')}. Registrados: ${found.length > 0 ? found.join(', ') : 'ninguno'}.`,
        remediation: meta.remediation,
      });
    }

    // Todos registrados, verificar health
    const unhealthyDrivers = healthResults.filter(h => !h.healthy);
    if (unhealthyDrivers.length > 0) {
      const unhealthyDetails = unhealthyDrivers.map(u => `${u.driver}: ${u.details}`).join('; ');
      log.warn(`${checkName}: drivers no saludables`, { systemId, unhealthyDrivers });
      return createPrerequisiteResult({
        name: checkName,
        displayName: meta.displayName,
        description: meta.description,
        status: PrerequisiteStatus.WARN,
        required: meta.required,
        details: `Todos los drivers registrados pero algunos no saludables: ${unhealthyDetails}`,
        remediation: 'Verificar la configuracion y conectividad de los drivers que reportan problemas de salud.',
      });
    }

    log.info(`${checkName}: todos los drivers disponibles y saludables`, { systemId, found });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.PASS,
      required: meta.required,
      details: `Todos los drivers registrados y saludables: ${found.join(', ')}.`,
      remediation: '',
    });
  } catch (err) {
    log.error(`${checkName}: error inesperado`, { systemId, error: err.message, stack: err.stack });
    return createPrerequisiteResult({
      name: checkName,
      displayName: meta.displayName,
      description: meta.description,
      status: PrerequisiteStatus.FAIL,
      required: meta.required,
      details: `Error verificando drivers HA: ${err.message}`,
      remediation: meta.remediation,
    });
  }
}

// ─── Funciones principales de orquestacion ────────────────────

/**
 * Ejecuta los 9 checks de prerequisitos para una operacion HA.
 * Cada check se ejecuta de forma independiente; si uno falla,
 * los demas continuan ejecutandose.
 *
 * @param {string} systemId - ID del sistema SAP (e.g., 'SAP-PRD-01')
 * @param {Object} context - Contexto de la operacion HA con info de nodos, drivers, etc.
 * @returns {Promise<Object>} Resultado consolidado:
 *   {
 *     systemId: string,
 *     allPassed: boolean,       - true si TODOS los checks pasaron (PASS o SKIP)
 *     requiredPassed: boolean,  - true si todos los checks con required=true pasaron (no FAIL)
 *     checks: HAPrerequisite[], - Arreglo con los 9 resultados individuales
 *     timestamp: string         - ISO timestamp de la ejecucion
 *   }
 */
async function runAllPrerequisites(systemId, context = {}) {
  const startTime = Date.now();
  log.setSystemId(systemId);
  log.info('Iniciando validacion de prerequisitos HA', {
    systemId,
    mock: isMock(),
    checkCount: Object.keys(CHECKS_REGISTRY).length,
  });

  const checkNames = Object.keys(CHECKS_REGISTRY);
  const checks = [];

  // Ejecutar cada check de forma independiente (secuencialmente para
  // evitar saturar SSM/DynamoDB con llamadas simultaneas)
  for (const checkName of checkNames) {
    const checkMeta = CHECKS_REGISTRY[checkName];
    try {
      log.info(`Ejecutando check: ${checkName}`, { systemId, displayName: checkMeta.displayName });
      const result = await checkMeta.fn(systemId, context);
      checks.push(result);
      log.info(`Check completado: ${checkName}`, {
        systemId,
        status: result.status,
        required: result.required,
      });
    } catch (err) {
      // Proteccion maxima: si el check lanza excepcion no capturada,
      // registrar como FAIL y continuar con los demas
      log.error(`Check ${checkName} lanzo excepcion no capturada`, {
        systemId,
        error: err.message,
        stack: err.stack,
      });
      checks.push(createPrerequisiteResult({
        name: checkName,
        displayName: checkMeta.displayName,
        description: checkMeta.description,
        status: PrerequisiteStatus.FAIL,
        required: checkMeta.required,
        details: `Excepcion no capturada en check: ${err.message}`,
        remediation: checkMeta.remediation,
      }));
    }
  }

  // Evaluar resultados consolidados
  const allPassed = checks.every(
    c => c.status === PrerequisiteStatus.PASS || c.status === PrerequisiteStatus.SKIP
  );
  const requiredPassed = checks.every(
    c => !c.required || c.status !== PrerequisiteStatus.FAIL
  );

  const durationMs = Date.now() - startTime;
  const failedRequired = checks.filter(c => c.required && c.status === PrerequisiteStatus.FAIL);
  const warnings = checks.filter(c => c.status === PrerequisiteStatus.WARN);
  const skipped = checks.filter(c => c.status === PrerequisiteStatus.SKIP);

  log.info('Validacion de prerequisitos HA completada', {
    systemId,
    allPassed,
    requiredPassed,
    durationMs,
    totalChecks: checks.length,
    passed: checks.filter(c => c.status === PrerequisiteStatus.PASS).length,
    failed: checks.filter(c => c.status === PrerequisiteStatus.FAIL).length,
    failedRequiredCount: failedRequired.length,
    warnings: warnings.length,
    skipped: skipped.length,
  });

  // Emitir metrica de prerequisitos
  log.metric('HAPrerequisitesResult', requiredPassed ? 1 : 0, 'Count', {
    systemId,
    allPassed: String(allPassed),
    requiredPassed: String(requiredPassed),
  });

  if (!requiredPassed) {
    log.warn('OPERACION HA BLOQUEADA: prerequisitos obligatorios fallidos', {
      systemId,
      failedRequired: failedRequired.map(c => ({
        name: c.name,
        details: c.details,
      })),
    });
  }

  return {
    systemId,
    allPassed,
    requiredPassed,
    checks,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Ejecuta un unico check de prerequisito por nombre.
 * Util para re-validar un check individual despues de una accion correctiva.
 *
 * @param {string} checkName - Nombre del check (e.g., 'checkReplicationHealth')
 * @param {string} systemId - ID del sistema SAP
 * @param {Object} context - Contexto de la operacion HA
 * @returns {Promise<Object>} Resultado del prerequisito individual (HAPrerequisite)
 * @throws {Error} Si el nombre del check no existe
 */
async function runSinglePrerequisite(checkName, systemId, context = {}) {
  log.setSystemId(systemId);

  const checkEntry = CHECKS_REGISTRY[checkName];
  if (!checkEntry) {
    const available = Object.keys(CHECKS_REGISTRY).join(', ');
    throw new Error(`Check desconocido: '${checkName}'. Checks disponibles: ${available}`);
  }

  log.info(`Ejecutando check individual: ${checkName}`, {
    systemId,
    displayName: checkEntry.displayName,
    mock: isMock(),
  });

  try {
    const result = await checkEntry.fn(systemId, context);
    log.info(`Check individual completado: ${checkName}`, {
      systemId,
      status: result.status,
      required: result.required,
    });
    return result;
  } catch (err) {
    log.error(`Check individual ${checkName} lanzo excepcion`, {
      systemId,
      error: err.message,
      stack: err.stack,
    });
    return createPrerequisiteResult({
      name: checkName,
      displayName: checkEntry.displayName,
      description: checkEntry.description,
      status: PrerequisiteStatus.FAIL,
      required: checkEntry.required,
      details: `Excepcion ejecutando check: ${err.message}`,
      remediation: checkEntry.remediation,
    });
  }
}

// ─── Exports ──────────────────────────────────────────────────

module.exports = {
  runAllPrerequisites,
  runSinglePrerequisite,
  // Exportar tambien el registro de checks para introspection/testing
  CHECKS_REGISTRY,
};
