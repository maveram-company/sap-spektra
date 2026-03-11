/**
 * scan-orchestrator.js
 *
 * Modulo de orquestacion de escaneo para el wizard de configuracion de SAP Spektra.
 * Gestiona el escaneo paralelo (con control de concurrencia) de instancias EC2
 * para descubrir productos SAP instalados.
 *
 * Exporta: ScanManager (clase)
 */

'use strict';

const EventEmitter = require('events');
const crypto = require('crypto');

// ── Estados posibles de un escaneo ──────────────────────────────────────────
const SCAN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAIL: 'fail',
};

// ── Fases del escaneo (en orden) con su porcentaje de progreso ──────────────
const SCAN_PHASES = [
  { key: 'OS', label: 'OS facts', progress: 10 },
  { key: 'SAP', label: 'SAP discovery', progress: 40 },
  { key: 'Kernel', label: 'Kernel version', progress: 60 },
  { key: 'HA', label: 'HA/cluster detection', progress: 80 },
  { key: 'Classify', label: 'Final classification', progress: 100 },
];

// ── Datos mock realistas para modo simulacion ───────────────────────────────
const MOCK_SAP_PRODUCTS = [
  {
    sid: 'PRD',
    type: 'ABAP',
    version: 'SAP NetWeaver 7.52',
    kernel: '753',
    kernelPatch: '1100',
    dbType: 'HANA',
    dbVersion: '2.00.059.00',
    haEnabled: true,
    haType: 'Pacemaker',
    instances: [
      { nr: '00', type: 'ASCS', host: 'sapascs01', status: 'GREEN' },
      { nr: '01', type: 'PAS', host: 'sappas01', status: 'GREEN' },
    ],
    confidence: 'high',
  },
  {
    sid: 'QAS',
    type: 'ABAP',
    version: 'SAP S/4HANA 2021',
    kernel: '785',
    kernelPatch: '200',
    dbType: 'HANA',
    dbVersion: '2.00.070.00',
    haEnabled: false,
    haType: null,
    instances: [
      { nr: '00', type: 'ASCS', host: 'sapqas01', status: 'GREEN' },
      { nr: '10', type: 'PAS', host: 'sapqas01', status: 'GREEN' },
    ],
    confidence: 'high',
  },
  {
    sid: 'DEV',
    type: 'JAVA',
    version: 'SAP NetWeaver 7.50',
    kernel: '749',
    kernelPatch: '900',
    dbType: 'ASE',
    dbVersion: '16.0.04.04',
    haEnabled: false,
    haType: null,
    instances: [
      { nr: '00', type: 'SCS', host: 'sapdev01', status: 'YELLOW' },
      { nr: '01', type: 'J', host: 'sapdev01', status: 'GREEN' },
    ],
    confidence: 'high',
  },
];

// ── Datos mock para cuando no se encuentra Host Agent ────────────────────────
const MOCK_FALLBACK_RESULT = {
  sid: 'UNK',
  type: 'Unknown',
  version: 'No detectado — Host Agent no encontrado',
  kernel: null,
  kernelPatch: null,
  dbType: null,
  dbVersion: null,
  haEnabled: false,
  haType: null,
  instances: [],
  confidence: 'medium',
};

// ── Clase Semaphore para control de concurrencia ────────────────────────────
/**
 * Semaforo simple basado en promesas.
 * Permite limitar la cantidad de tareas que se ejecutan al mismo tiempo.
 */
class Semaphore {
  /**
   * @param {number} max - Numero maximo de tareas concurrentes
   */
  constructor(max) {
    this._max = max;
    this._current = 0;
    this._queue = []; // Cola de funciones resolve esperando turno
  }

  /**
   * Adquirir un slot del semaforo. Si no hay slots disponibles, espera.
   * @returns {Promise<void>}
   */
  acquire() {
    if (this._current < this._max) {
      this._current++;
      return Promise.resolve();
    }
    // No hay slots: encolar y esperar
    return new Promise((resolve) => {
      this._queue.push(resolve);
    });
  }

  /**
   * Liberar un slot del semaforo. Permite que la siguiente tarea en cola avance.
   */
  release() {
    if (this._queue.length > 0) {
      // Dar el slot a la siguiente tarea en cola
      const next = this._queue.shift();
      next();
    } else {
      this._current--;
    }
  }
}

// ── Clase principal: ScanManager ────────────────────────────────────────────
/**
 * Gestiona el ciclo de vida de los escaneos de instancias EC2.
 *
 * Eventos emitidos:
 *   - 'scan:queued'    → { scanId, instanceId }
 *   - 'scan:started'   → { scanId, instanceId }
 *   - 'scan:phase'     → { scanId, instanceId, phase, progress }
 *   - 'scan:success'   → { scanId, instanceId, results }
 *   - 'scan:fail'      → { scanId, instanceId, error }
 *   - 'scan:cancelled' → { scanId, instanceId }
 *   - 'batch:complete' → { total, success, fail }
 */
class ScanManager extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.mockMode=true] - Si es true, simula el escaneo con datos falsos
   * @param {number}  [options.concurrency=3] - Numero maximo de escaneos simultaneos
   * @param {number}  [options.phaseDelayMin=200] - Retardo minimo por fase en modo mock (ms)
   * @param {number}  [options.phaseDelayMax=800] - Retardo maximo por fase en modo mock (ms)
   * @param {Object}  [options.lambdaClient=null] - Cliente AWS Lambda para deep scan (modo real)
   * @param {string}  [options.discoveryFunctionName] - Nombre de la funcion Lambda discovery-engine
   */
  constructor(options = {}) {
    super();

    // Configuracion con valores por defecto
    this._mockMode = options.mockMode !== undefined ? options.mockMode : true;
    this._concurrency = options.concurrency || 3;
    this._phaseDelayMin = options.phaseDelayMin || 200;
    this._phaseDelayMax = options.phaseDelayMax || 800;
    this._lambdaClient = options.lambdaClient || null;
    this._discoveryFunctionName = options.discoveryFunctionName || 'sap-alwaysops-discovery-engine';

    // Almacen interno de escaneos: Map<scanId, ScanEntry>
    this._scans = new Map();

    // Semaforo para controlar concurrencia
    this._semaphore = new Semaphore(this._concurrency);
  }

  // ── Metodos publicos ────────────────────────────────────────────────────

  /**
   * Iniciar el escaneo de una sola instancia EC2.
   *
   * @param {string} instanceId - ID de la instancia EC2 (ej: i-0abc123def456)
   * @param {string} region - Region AWS (ej: us-east-1)
   * @param {string} platform - Plataforma del SO (ej: Linux, Windows)
   * @returns {string} scanId - Identificador unico del escaneo
   */
  startScan(instanceId, region, platform) {
    const scanId = this._generateScanId();

    // Crear entrada de escaneo con estado inicial
    const entry = {
      scanId,
      instanceId,
      region,
      platform: platform || 'Linux',
      status: SCAN_STATUS.QUEUED,
      progress: 0,
      phases: {},
      results: null,
      error: null,
      startedAt: null,
      completedAt: null,
      _cancelled: false, // Bandera interna para cancelacion
    };

    // Inicializar todas las fases como pendientes
    for (const phase of SCAN_PHASES) {
      entry.phases[phase.key] = { status: 'pending', data: null };
    }

    this._scans.set(scanId, entry);
    this.emit('scan:queued', { scanId, instanceId });

    // Lanzar el escaneo de forma asincrona (no bloqueante)
    this._executeScan(entry).catch((err) => {
      // Error inesperado no capturado — marcar como fallido
      this._failScan(entry, `Error interno inesperado: ${err.message}`);
    });

    return scanId;
  }

  /**
   * Iniciar escaneo de multiples instancias en lote con control de concurrencia.
   *
   * @param {Array<Object>} instances - Lista de instancias. Cada una: { instanceId, platform }
   * @param {string} region - Region AWS
   * @returns {Array<{ instanceId: string, scanId: string }>}
   */
  startBatchScan(instances, region) {
    if (!Array.isArray(instances) || instances.length === 0) {
      throw new Error('Se requiere al menos una instancia para el escaneo en lote');
    }

    const results = [];

    for (const inst of instances) {
      const scanId = this.startScan(inst.instanceId, region, inst.platform);
      results.push({ instanceId: inst.instanceId, scanId });
    }

    // Monitorear cuando todos los escaneos del lote terminen
    this._monitorBatch(results.map((r) => r.scanId));

    return results;
  }

  /**
   * Obtener el estado actual de un escaneo especifico.
   *
   * @param {string} scanId
   * @returns {Object|null} Estado del escaneo o null si no existe
   */
  getScanStatus(scanId) {
    const entry = this._scans.get(scanId);
    if (!entry) return null;

    return {
      scanId: entry.scanId,
      instanceId: entry.instanceId,
      status: entry.status,
      progress: entry.progress,
      phases: { ...entry.phases },
      results: entry.results,
      error: entry.error,
    };
  }

  /**
   * Obtener el estado de todos los escaneos activos.
   *
   * @returns {Array<Object>} Lista de estados de escaneo
   */
  getAllScans() {
    const all = [];
    for (const entry of this._scans.values()) {
      all.push(this.getScanStatus(entry.scanId));
    }
    return all;
  }

  /**
   * Cancelar un escaneo en ejecucion.
   *
   * @param {string} scanId
   * @returns {boolean} true si se cancelo, false si no se encontro o ya termino
   */
  cancelScan(scanId) {
    const entry = this._scans.get(scanId);
    if (!entry) return false;

    // Solo se pueden cancelar escaneos en cola o en ejecucion
    if (entry.status !== SCAN_STATUS.QUEUED && entry.status !== SCAN_STATUS.RUNNING) {
      return false;
    }

    entry._cancelled = true;
    entry.status = SCAN_STATUS.FAIL;
    entry.error = 'Escaneo cancelado por el usuario';
    entry.completedAt = new Date().toISOString();

    this.emit('scan:cancelled', { scanId, instanceId: entry.instanceId });
    return true;
  }

  /**
   * Reintentar todos los escaneos que fallaron.
   *
   * @returns {Array<{ instanceId: string, scanId: string }>} Nuevos escaneos creados
   */
  retryFailed() {
    const failed = [];

    for (const entry of this._scans.values()) {
      if (entry.status === SCAN_STATUS.FAIL) {
        failed.push({
          instanceId: entry.instanceId,
          region: entry.region,
          platform: entry.platform,
        });
      }
    }

    if (failed.length === 0) return [];

    // Eliminar los escaneos fallidos del mapa
    for (const [scanId, entry] of this._scans.entries()) {
      if (entry.status === SCAN_STATUS.FAIL) {
        this._scans.delete(scanId);
      }
    }

    // Relanzar cada uno
    const retried = [];
    for (const inst of failed) {
      const newScanId = this.startScan(inst.instanceId, inst.region, inst.platform);
      retried.push({ instanceId: inst.instanceId, scanId: newScanId });
    }

    return retried;
  }

  /**
   * Limpiar todo el estado de escaneo. Cancela los que esten en progreso.
   */
  reset() {
    // Cancelar escaneos activos
    for (const entry of this._scans.values()) {
      if (entry.status === SCAN_STATUS.QUEUED || entry.status === SCAN_STATUS.RUNNING) {
        entry._cancelled = true;
      }
    }

    this._scans.clear();
    this._semaphore = new Semaphore(this._concurrency);
  }

  // ── Metodos privados ───────────────────────────────────────────────────

  /**
   * Generar un ID unico para el escaneo.
   * @returns {string}
   */
  _generateScanId() {
    return `scan-${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * Ejecutar el escaneo completo de una instancia.
   * Espera por un slot del semaforo antes de comenzar.
   *
   * @param {Object} entry - Entrada de escaneo del mapa interno
   */
  async _executeScan(entry) {
    // Esperar a que haya un slot disponible en el semaforo
    await this._semaphore.acquire();

    try {
      // Verificar si fue cancelado mientras esperaba en la cola
      if (entry._cancelled) return;

      // Cambiar estado a "en ejecucion"
      entry.status = SCAN_STATUS.RUNNING;
      entry.startedAt = new Date().toISOString();
      this.emit('scan:started', { scanId: entry.scanId, instanceId: entry.instanceId });

      if (this._mockMode) {
        await this._executeMockScan(entry);
      } else {
        await this._executeRealScan(entry);
      }
    } finally {
      // Siempre liberar el slot del semaforo, pase lo que pase
      this._semaphore.release();
    }
  }

  /**
   * Ejecutar escaneo en modo mock (simulacion con datos falsos).
   * Simula cada fase con un retardo aleatorio realista.
   *
   * @param {Object} entry
   */
  async _executeMockScan(entry) {
    for (const phase of SCAN_PHASES) {
      // Verificar cancelacion antes de cada fase
      if (entry._cancelled) return;

      // Marcar la fase como en progreso
      entry.phases[phase.key] = { status: 'running', data: null };
      entry.progress = phase.progress;
      this.emit('scan:phase', {
        scanId: entry.scanId,
        instanceId: entry.instanceId,
        phase: phase.key,
        progress: phase.progress,
      });

      // Simular el tiempo que tarda cada fase
      const delay = this._randomDelay();
      await this._sleep(delay);

      // Verificar cancelacion despues del delay
      if (entry._cancelled) return;

      // Generar datos mock para esta fase
      const phaseData = this._generateMockPhaseData(phase.key, entry);
      entry.phases[phase.key] = { status: 'done', data: phaseData };
    }

    // Escaneo completado con exito — compilar resultados
    const results = this._compileMockResults(entry);
    entry.status = SCAN_STATUS.SUCCESS;
    entry.results = results;
    entry.progress = 100;
    entry.completedAt = new Date().toISOString();

    this.emit('scan:success', {
      scanId: entry.scanId,
      instanceId: entry.instanceId,
      results,
    });
  }

  /**
   * Ejecutar escaneo en modo real usando sap-discovery.js y Lambda.
   *
   * @param {Object} entry
   */
  async _executeRealScan(entry) {
    try {
      // ── Fase OS: Obtener datos del sistema operativo ──────────────────
      if (entry._cancelled) return;
      this._updatePhase(entry, 'OS', 'running');

      let sapDiscovery;
      try {
        sapDiscovery = require('./sap-discovery');
      } catch (err) {
        throw new Error(
          'No se pudo cargar el modulo sap-discovery.js. ' +
          'Verificar que el archivo existe en el directorio lib/'
        );
      }

      let basicConfig;
      try {
        basicConfig = await sapDiscovery.discoverSapConfig(entry.instanceId, entry.region);
      } catch (err) {
        // Detectar errores de permisos SSM
        if (this._isSSMPermissionError(err)) {
          throw new Error(
            'Error de permisos SSM: Verificar que SSM Agent este instalado y online. ' +
            `Detalle: ${err.message}`
          );
        }
        // Detectar errores de timeout
        if (this._isTimeoutError(err)) {
          throw new Error(
            `Timeout durante el escaneo de ${entry.instanceId}. ` +
            'Sugerencia: Verificar conectividad de la instancia y reintentar el escaneo.'
          );
        }
        throw err;
      }

      this._updatePhase(entry, 'OS', 'done', {
        os: basicConfig.os || null,
        hostname: basicConfig.hostname || null,
      });

      // ── Fase SAP: Descubrimiento de productos SAP ────────────────────
      if (entry._cancelled) return;
      this._updatePhase(entry, 'SAP', 'running');

      const sapData = {
        sids: basicConfig.sids || [],
        instances: basicConfig.instances || [],
        profiles: basicConfig.profiles || [],
      };

      // Verificar si hay Host Agent disponible
      const hasHostAgent = basicConfig.hostAgent !== false && basicConfig.hostAgent != null;
      if (!hasHostAgent) {
        // Sin Host Agent: resultado parcial con confianza media
        sapData.confidence = 'medium';
        sapData.warning = 'Host Agent no encontrado. Resultados basados en deteccion por filesystem.';
      }

      this._updatePhase(entry, 'SAP', 'done', sapData);

      // ── Fase Kernel: Version del kernel SAP ──────────────────────────
      if (entry._cancelled) return;
      this._updatePhase(entry, 'Kernel', 'running');

      const kernelData = {
        version: basicConfig.kernel || null,
        patchLevel: basicConfig.kernelPatch || null,
      };
      this._updatePhase(entry, 'Kernel', 'done', kernelData);

      // ── Fase HA: Deteccion de alta disponibilidad / cluster ──────────
      if (entry._cancelled) return;
      this._updatePhase(entry, 'HA', 'running');

      const haData = {
        enabled: basicConfig.haEnabled || false,
        type: basicConfig.haType || null,
        nodes: basicConfig.haNodes || [],
      };
      this._updatePhase(entry, 'HA', 'done', haData);

      // ── Fase Classify: Clasificacion final (deep scan con Lambda) ────
      if (entry._cancelled) return;
      this._updatePhase(entry, 'Classify', 'running');

      let classification = null;

      if (this._lambdaClient && this._discoveryFunctionName) {
        try {
          classification = await this._invokeDiscoveryLambda(entry, basicConfig);
        } catch (lambdaErr) {
          // Lambda no disponible — usar clasificacion basica
          classification = {
            source: 'local',
            note: `Lambda no disponible: ${lambdaErr.message}`,
          };
        }
      } else {
        classification = { source: 'local', note: 'Lambda no configurada' };
      }

      this._updatePhase(entry, 'Classify', 'done', classification);

      // ── Compilar resultados finales ──────────────────────────────────
      const results = {
        instanceId: entry.instanceId,
        region: entry.region,
        platform: entry.platform,
        os: entry.phases.OS.data,
        sap: entry.phases.SAP.data,
        kernel: entry.phases.Kernel.data,
        ha: entry.phases.HA.data,
        classification: entry.phases.Classify.data,
        confidence: hasHostAgent ? 'high' : 'medium',
        scannedAt: new Date().toISOString(),
      };

      entry.status = SCAN_STATUS.SUCCESS;
      entry.results = results;
      entry.progress = 100;
      entry.completedAt = new Date().toISOString();

      this.emit('scan:success', {
        scanId: entry.scanId,
        instanceId: entry.instanceId,
        results,
      });
    } catch (err) {
      this._failScan(entry, err.message);
    }
  }

  /**
   * Invocar la funcion Lambda discovery-engine para deep scan.
   *
   * @param {Object} entry - Entrada de escaneo
   * @param {Object} basicConfig - Configuracion basica obtenida del escaneo local
   * @returns {Promise<Object>} Resultado de la clasificacion
   */
  async _invokeDiscoveryLambda(entry, basicConfig) {
    const payload = {
      instanceId: entry.instanceId,
      region: entry.region,
      platform: entry.platform,
      basicConfig,
    };

    const params = {
      FunctionName: this._discoveryFunctionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    };

    const response = await this._lambdaClient.invoke(params).promise();

    if (response.FunctionError) {
      throw new Error(`Lambda error: ${response.FunctionError}`);
    }

    const result = JSON.parse(response.Payload);
    return result;
  }

  /**
   * Actualizar el estado de una fase especifica y emitir evento.
   *
   * @param {Object} entry
   * @param {string} phaseKey - Clave de la fase (OS, SAP, Kernel, HA, Classify)
   * @param {string} status - Estado de la fase (running, done)
   * @param {*} [data=null] - Datos resultantes de la fase
   */
  _updatePhase(entry, phaseKey, status, data = null) {
    entry.phases[phaseKey] = { status, data };

    // Calcular progreso basado en la fase
    const phaseInfo = SCAN_PHASES.find((p) => p.key === phaseKey);
    if (phaseInfo) {
      entry.progress = phaseInfo.progress;
    }

    this.emit('scan:phase', {
      scanId: entry.scanId,
      instanceId: entry.instanceId,
      phase: phaseKey,
      progress: entry.progress,
    });
  }

  /**
   * Marcar un escaneo como fallido y emitir evento.
   *
   * @param {Object} entry
   * @param {string} errorMessage
   */
  _failScan(entry, errorMessage) {
    entry.status = SCAN_STATUS.FAIL;
    entry.error = errorMessage;
    entry.completedAt = new Date().toISOString();

    this.emit('scan:fail', {
      scanId: entry.scanId,
      instanceId: entry.instanceId,
      error: errorMessage,
    });
  }

  /**
   * Generar datos mock para una fase especifica del escaneo.
   *
   * @param {string} phaseKey
   * @param {Object} entry
   * @returns {Object} Datos simulados para la fase
   */
  _generateMockPhaseData(phaseKey, entry) {
    switch (phaseKey) {
      case 'OS':
        return {
          os: entry.platform === 'Windows' ? 'Windows Server 2019' : 'SUSE Linux Enterprise Server 15 SP4',
          hostname: `ip-${entry.instanceId.replace('i-', '').substring(0, 8)}`,
          arch: 'x86_64',
          cpus: [4, 8, 16][Math.floor(Math.random() * 3)],
          memoryGb: [16, 32, 64, 128][Math.floor(Math.random() * 4)],
        };

      case 'SAP': {
        // Elegir un producto SAP mock aleatorio
        const mockProduct = MOCK_SAP_PRODUCTS[Math.floor(Math.random() * MOCK_SAP_PRODUCTS.length)];
        return {
          sids: [mockProduct.sid],
          type: mockProduct.type,
          version: mockProduct.version,
          dbType: mockProduct.dbType,
          dbVersion: mockProduct.dbVersion,
          instances: mockProduct.instances,
        };
      }

      case 'Kernel':
        return {
          version: ['753', '785', '749', '777'][Math.floor(Math.random() * 4)],
          patchLevel: String(Math.floor(Math.random() * 1200)),
          compiledOn: '2024-11-15',
        };

      case 'HA': {
        const haEnabled = Math.random() > 0.5;
        return {
          enabled: haEnabled,
          type: haEnabled ? ['Pacemaker', 'WSFC', 'SUSE HAE'][Math.floor(Math.random() * 3)] : null,
          nodes: haEnabled
            ? [
                { name: 'node-primary', role: 'master', status: 'online' },
                { name: 'node-standby', role: 'slave', status: 'online' },
              ]
            : [],
        };
      }

      case 'Classify':
        return {
          landscape: ['Production', 'Quality', 'Development'][Math.floor(Math.random() * 3)],
          tier: ['App Server', 'DB Server', 'Central Services'][Math.floor(Math.random() * 3)],
          classification: 'SAP Application Server',
          source: 'mock',
        };

      default:
        return null;
    }
  }

  /**
   * Compilar los resultados finales de un escaneo mock a partir de las fases completadas.
   *
   * @param {Object} entry
   * @returns {Object} Resultados consolidados del escaneo
   */
  _compileMockResults(entry) {
    const osData = entry.phases.OS.data || {};
    const sapData = entry.phases.SAP.data || {};
    const kernelData = entry.phases.Kernel.data || {};
    const haData = entry.phases.HA.data || {};
    const classifyData = entry.phases.Classify.data || {};

    return {
      instanceId: entry.instanceId,
      region: entry.region,
      platform: entry.platform,
      os: osData,
      sap: {
        sid: sapData.sids ? sapData.sids[0] : null,
        type: sapData.type,
        version: sapData.version,
        dbType: sapData.dbType,
        dbVersion: sapData.dbVersion,
        instances: sapData.instances || [],
      },
      kernel: {
        version: kernelData.version,
        patchLevel: kernelData.patchLevel,
      },
      ha: {
        enabled: haData.enabled || false,
        type: haData.type || null,
        nodes: haData.nodes || [],
      },
      classification: classifyData,
      confidence: 'high',
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * Monitorear un lote de escaneos y emitir evento cuando todos terminen.
   *
   * @param {Array<string>} scanIds - Lista de IDs de escaneo del lote
   */
  _monitorBatch(scanIds) {
    const checkComplete = () => {
      let total = scanIds.length;
      let successCount = 0;
      let failCount = 0;
      let pending = 0;

      for (const id of scanIds) {
        const entry = this._scans.get(id);
        if (!entry) {
          // Escaneo fue eliminado (reset) — contar como fallido
          failCount++;
          continue;
        }

        switch (entry.status) {
          case SCAN_STATUS.SUCCESS:
            successCount++;
            break;
          case SCAN_STATUS.FAIL:
            failCount++;
            break;
          default:
            pending++;
            break;
        }
      }

      if (pending === 0) {
        // Todos los escaneos del lote terminaron
        this.emit('batch:complete', {
          total,
          success: successCount,
          fail: failCount,
        });
      } else {
        // Verificar de nuevo en 500ms
        setTimeout(checkComplete, 500);
      }
    };

    // Iniciar verificacion periodica
    setTimeout(checkComplete, 500);
  }

  /**
   * Verificar si un error es de permisos SSM.
   *
   * @param {Error} err
   * @returns {boolean}
   */
  _isSSMPermissionError(err) {
    const msg = (err.message || '').toLowerCase();
    const code = (err.code || '').toLowerCase();
    return (
      msg.includes('ssm') ||
      msg.includes('systems manager') ||
      msg.includes('access denied') ||
      msg.includes('not authorized') ||
      code === 'accessdeniedexception' ||
      code === 'invalidinstanceid' ||
      code === 'targetnotconnected'
    );
  }

  /**
   * Verificar si un error es de timeout.
   *
   * @param {Error} err
   * @returns {boolean}
   */
  _isTimeoutError(err) {
    const msg = (err.message || '').toLowerCase();
    const code = (err.code || '').toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('time out') ||
      code === 'invocationtimedout' ||
      code === 'requesttimeout'
    );
  }

  /**
   * Generar un retardo aleatorio dentro del rango configurado (para modo mock).
   *
   * @returns {number} Retardo en milisegundos
   */
  _randomDelay() {
    return Math.floor(
      Math.random() * (this._phaseDelayMax - this._phaseDelayMin) + this._phaseDelayMin
    );
  }

  /**
   * Pausa asincrona (sleep) por los milisegundos indicados.
   *
   * @param {number} ms - Milisegundos
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── Exportar ────────────────────────────────────────────────────────────────
module.exports = { ScanManager };
