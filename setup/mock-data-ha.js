'use strict';

// =================================================================
//  Avvale SAP AlwaysOps v1.5 — Mock Data HA
//  Datos simulados para el sistema de Alta Disponibilidad (HA).
//  Incluye sistemas con configuracion HA, prerequisitos mock,
//  historial de operaciones y configuraciones de drivers.
//  Uso: Importar desde server.js para rutas HA mock.
// =================================================================

const crypto = require('crypto');

// ─── Sistemas SAP con configuracion HA ───
// Tres escenarios: PRD (sano), QAS (degradado), DEV (sin HA)
const HA_SYSTEMS = [
  {
    // Sistema productivo con HA completo y saludable
    systemId: 'SAP-PRD-01',
    sid: 'PRD',
    haEnabled: true,
    haStatus: 'HEALTHY',
    networkStrategy: 'PACEMAKER_VIP',
    dbType: 'HANA',
    dbVersion: '2.00.070',
    replicationMode: 'SYNC',
    replicationStatus: 'SOK',
    primaryNode: {
      instanceId: 'i-0abc123primary',
      hostname: 'sap-prd-01a',
      ip: '10.0.1.10',
      zone: 'us-east-1a',
      role: 'PRIMARY',
      sapStatus: 'RUNNING',
      hanaStatus: 'RUNNING',
    },
    secondaryNode: {
      instanceId: 'i-0abc123secondary',
      hostname: 'sap-prd-01b',
      ip: '10.0.2.10',
      zone: 'us-east-1b',
      role: 'SECONDARY',
      sapStatus: 'STANDBY',
      hanaStatus: 'RUNNING',
    },
    vipAddress: '10.0.0.100',
    instanceNumber: '00',
    logShippingDelta: '0.2s',
    lastHealthCheck: new Date(Date.now() - 60000).toISOString(),
    lastFailover: null,
    createdAt: '2025-06-15T10:00:00.000Z',
  },
  {
    // Sistema QAS degradado — replicacion con warning
    systemId: 'SAP-QAS-200',
    sid: 'QAS',
    haEnabled: true,
    haStatus: 'DEGRADED',
    networkStrategy: 'EIP',
    dbType: 'HANA',
    dbVersion: '2.00.065',
    replicationMode: 'SYNCMEM',
    replicationStatus: 'SFAIL',
    primaryNode: {
      instanceId: 'i-0def456primary',
      hostname: 'sap-qas-01a',
      ip: '10.0.3.10',
      zone: 'us-east-1a',
      role: 'PRIMARY',
      sapStatus: 'RUNNING',
      hanaStatus: 'RUNNING',
    },
    secondaryNode: {
      instanceId: 'i-0def456secondary',
      hostname: 'sap-qas-01b',
      ip: '10.0.4.10',
      zone: 'us-east-1b',
      role: 'SECONDARY',
      sapStatus: 'STANDBY',
      hanaStatus: 'WARNING',
    },
    vipAddress: null,
    eipAllocationId: 'eipalloc-0abc123mock',
    instanceNumber: '01',
    logShippingDelta: '45.7s',
    lastHealthCheck: new Date(Date.now() - 300000).toISOString(),
    lastFailover: '2025-11-20T14:30:00.000Z',
    createdAt: '2025-04-10T08:00:00.000Z',
  },
  {
    // Sistema DEV sin HA configurado
    systemId: 'SAP-DEV-300',
    sid: 'DEV',
    haEnabled: false,
    haStatus: 'NOT_CONFIGURED',
    networkStrategy: null,
    dbType: 'HANA',
    dbVersion: '2.00.070',
    replicationMode: null,
    replicationStatus: null,
    primaryNode: {
      instanceId: 'i-0ghi789primary',
      hostname: 'sap-dev-01',
      ip: '10.0.5.10',
      zone: 'us-east-1a',
      role: 'SINGLE',
      sapStatus: 'RUNNING',
      hanaStatus: 'RUNNING',
    },
    secondaryNode: null,
    vipAddress: null,
    instanceNumber: '00',
    logShippingDelta: null,
    lastHealthCheck: new Date(Date.now() - 120000).toISOString(),
    lastFailover: null,
    createdAt: '2025-08-01T12:00:00.000Z',
  },
];

// ─── Resultados de prerequisitos por sistema ───
// Estos se retornan cuando se consultan los prerequisitos de un sistema
const PREREQUISITES_BY_SYSTEM = {
  'SAP-PRD-01': [
    {
      name: 'replication_health',
      displayName: 'Replicacion HANA SR',
      description: 'Verifica que HANA System Replication esta activo y sincronizado',
      status: 'PASS',
      required: true,
      details: 'SR activo, modo SYNC, estado SOK. Delta log shipping: 0.2s',
      lastChecked: new Date().toISOString(),
      remediation: '',
    },
    {
      name: 'hana_running',
      displayName: 'HANA Corriendo',
      description: 'Verifica que HANA esta corriendo en ambos nodos',
      status: 'PASS',
      required: true,
      details: 'HANA corriendo en sap-prd-01a (PRIMARY) y sap-prd-01b (SECONDARY)',
      lastChecked: new Date().toISOString(),
      remediation: '',
    },
    {
      name: 'sap_status_source',
      displayName: 'SAP Status (source)',
      description: 'Verifica que SAP esta corriendo en nodo source',
      status: 'PASS',
      required: true,
      details: 'SAP PRD corriendo en source (i-0abc123primary) - 8 procesos GREEN',
      lastChecked: new Date().toISOString(),
      remediation: '',
    },
    {
      name: 'network_vip',
      displayName: 'VIP Pacemaker Configurada',
      description: 'Verifica que la VIP esta activa y asociada al nodo primario',
      status: 'PASS',
      required: true,
      details: 'VIP 10.0.0.100 activa en sap-prd-01a (Pacemaker resource rsc_ip_PRD_HDB00)',
      lastChecked: new Date().toISOString(),
      remediation: '',
    },
    {
      name: 'disk_space',
      displayName: 'Espacio en Disco',
      description: 'Verifica espacio disponible para logs de SAP y HANA',
      status: 'PASS',
      required: false,
      details: '/usr/sap: 45% utilizado, /hana/log: 32% utilizado, /hana/data: 67% utilizado',
      lastChecked: new Date().toISOString(),
      remediation: '',
    },
    {
      name: 'iam_permissions',
      displayName: 'Permisos IAM',
      description: 'Verifica que el rol IAM tiene permisos para HA operations',
      status: 'PASS',
      required: true,
      details: 'Permisos verificados: ec2:*, ssm:SendCommand, ssm:GetCommandInvocation',
      lastChecked: new Date().toISOString(),
      remediation: '',
    },
  ],
  'SAP-QAS-200': [
    {
      name: 'replication_health',
      displayName: 'Replicacion HANA SR',
      description: 'Verifica que HANA System Replication esta activo y sincronizado',
      status: 'FAIL',
      required: true,
      details: 'SR en estado SFAIL. Replicacion no sincronizada. Delta log shipping: 45.7s',
      lastChecked: new Date().toISOString(),
      remediation: 'Verificar estado de SR con systemReplicationStatus.py. Investigar causa del SFAIL en el secondary.',
    },
    {
      name: 'hana_running',
      displayName: 'HANA Corriendo',
      description: 'Verifica que HANA esta corriendo en ambos nodos',
      status: 'WARN',
      required: true,
      details: 'HANA corriendo en source pero con warnings en secondary (sap-qas-01b)',
      lastChecked: new Date().toISOString(),
      remediation: 'Verificar logs de HANA en nodo secundario: /usr/sap/QAS/HDB01/sap-qas-01b/trace/',
    },
    {
      name: 'sap_status_source',
      displayName: 'SAP Status (source)',
      description: 'Verifica que SAP esta corriendo en nodo source',
      status: 'PASS',
      required: true,
      details: 'SAP QAS corriendo en source (i-0def456primary) - 8 procesos GREEN',
      lastChecked: new Date().toISOString(),
      remediation: '',
    },
    {
      name: 'network_eip',
      displayName: 'Elastic IP Existe',
      description: 'Verifica que el EIP existe y esta asociado',
      status: 'PASS',
      required: true,
      details: 'EIP eipalloc-0abc123mock asociada a i-0def456primary (IP publica: 52.10.20.30)',
      lastChecked: new Date().toISOString(),
      remediation: '',
    },
  ],
  'SAP-DEV-300': [
    {
      name: 'ha_not_configured',
      displayName: 'HA No Configurado',
      description: 'Este sistema no tiene HA configurado',
      status: 'SKIP',
      required: false,
      details: 'Sistema SAP-DEV-300 es single-node. HA no aplica.',
      lastChecked: new Date().toISOString(),
      remediation: 'Configurar un nodo secundario para habilitar HA.',
    },
  ],
};

// ─── Historial de operaciones mock ───
// Operaciones pasadas para mostrar en la UI
const OPERATION_HISTORY = [
  {
    operationId: 'op-mock-001',
    systemId: 'SAP-PRD-01',
    sid: 'PRD',
    operationType: 'TAKEOVER',
    status: 'COMPLETED',
    triggeredBy: 'admin@empresa.com',
    reason: 'Mantenimiento planificado de nodo primario',
    networkStrategy: 'PACEMAKER_VIP',
    dbStrategy: 'HANA_SR',
    sapStrategy: 'SAP_SERVICES',
    sourceNode: { instanceId: 'i-0abc123primary', hostname: 'sap-prd-01a' },
    targetNode: { instanceId: 'i-0abc123secondary', hostname: 'sap-prd-01b' },
    timestamps: {
      createdAt: '2025-09-15T08:00:00.000Z',
      startedAt: '2025-09-15T08:01:00.000Z',
      completedAt: '2025-09-15T08:04:30.000Z',
      cancelledAt: null,
    },
    estimatedDurationMs: 180000,
    actualDurationMs: 210000,
    executedSteps: [
      { stepId: 's-001', name: 'Adquirir lock de operacion', status: 'COMPLETED', durationMs: 500 },
      { stepId: 's-002', name: 'Capturar estado previo', status: 'COMPLETED', durationMs: 2000 },
      { stepId: 's-003', name: 'Detener SAP en source', status: 'COMPLETED', durationMs: 45000 },
      { stepId: 's-004', name: 'Takeover HANA SR', status: 'COMPLETED', durationMs: 65000 },
      { stepId: 's-005', name: 'Switch VIP a target', status: 'COMPLETED', durationMs: 3000 },
      { stepId: 's-006', name: 'Iniciar SAP en target', status: 'COMPLETED', durationMs: 85000 },
      { stepId: 's-007', name: 'Verificar post-takeover', status: 'COMPLETED', durationMs: 5000 },
      { stepId: 's-008', name: 'Liberar lock', status: 'COMPLETED', durationMs: 300 },
    ],
    rollbackReason: null,
    error: null,
  },
  {
    operationId: 'op-mock-002',
    systemId: 'SAP-QAS-200',
    sid: 'QAS',
    operationType: 'FAILOVER',
    status: 'FAILED',
    triggeredBy: 'SYSTEM',
    reason: 'Fallo detectado en nodo primario (heartbeat timeout)',
    networkStrategy: 'EIP',
    dbStrategy: 'HANA_SR',
    sapStrategy: 'SAP_SERVICES',
    sourceNode: { instanceId: 'i-0def456primary', hostname: 'sap-qas-01a' },
    targetNode: { instanceId: 'i-0def456secondary', hostname: 'sap-qas-01b' },
    timestamps: {
      createdAt: '2025-11-20T14:28:00.000Z',
      startedAt: '2025-11-20T14:28:30.000Z',
      completedAt: '2025-11-20T14:35:00.000Z',
      cancelledAt: null,
    },
    estimatedDurationMs: 240000,
    actualDurationMs: 390000,
    executedSteps: [
      { stepId: 's-010', name: 'Adquirir lock de operacion', status: 'COMPLETED', durationMs: 800 },
      { stepId: 's-011', name: 'Capturar estado previo', status: 'COMPLETED', durationMs: 3000 },
      { stepId: 's-012', name: 'Detener SAP en source', status: 'COMPLETED', durationMs: 30000 },
      { stepId: 's-013', name: 'Takeover HANA SR', status: 'FAILED', durationMs: 120000 },
      { stepId: 's-014', name: 'Rollback: Reiniciar SAP en source', status: 'COMPLETED', durationMs: 90000 },
      { stepId: 's-015', name: 'Liberar lock', status: 'COMPLETED', durationMs: 500 },
    ],
    rollbackReason: 'HANA SR takeover fallo: SR no sincronizado (SFAIL)',
    error: { message: 'HANA SR takeover fallo: estado SFAIL no permite takeover seguro' },
  },
  {
    operationId: 'op-mock-003',
    systemId: 'SAP-PRD-01',
    sid: 'PRD',
    operationType: 'FAILBACK',
    status: 'COMPLETED',
    triggeredBy: 'admin@empresa.com',
    reason: 'Failback a nodo original tras mantenimiento',
    networkStrategy: 'PACEMAKER_VIP',
    dbStrategy: 'HANA_SR',
    sapStrategy: 'SAP_SERVICES',
    sourceNode: { instanceId: 'i-0abc123secondary', hostname: 'sap-prd-01b' },
    targetNode: { instanceId: 'i-0abc123primary', hostname: 'sap-prd-01a' },
    timestamps: {
      createdAt: '2025-09-15T18:00:00.000Z',
      startedAt: '2025-09-15T18:01:00.000Z',
      completedAt: '2025-09-15T18:05:15.000Z',
      cancelledAt: null,
    },
    estimatedDurationMs: 200000,
    actualDurationMs: 255000,
    executedSteps: [
      { stepId: 's-020', name: 'Adquirir lock de operacion', status: 'COMPLETED', durationMs: 400 },
      { stepId: 's-021', name: 'Capturar estado previo', status: 'COMPLETED', durationMs: 1500 },
      { stepId: 's-022', name: 'Detener SAP en source (prd-01b)', status: 'COMPLETED', durationMs: 50000 },
      { stepId: 's-023', name: 'Takeover HANA SR a prd-01a', status: 'COMPLETED', durationMs: 70000 },
      { stepId: 's-024', name: 'Switch VIP a prd-01a', status: 'COMPLETED', durationMs: 2500 },
      { stepId: 's-025', name: 'Iniciar SAP en prd-01a', status: 'COMPLETED', durationMs: 90000 },
      { stepId: 's-026', name: 'Registrar prd-01b como secundario', status: 'COMPLETED', durationMs: 35000 },
      { stepId: 's-027', name: 'Verificar post-failback', status: 'COMPLETED', durationMs: 4000 },
      { stepId: 's-028', name: 'Liberar lock', status: 'COMPLETED', durationMs: 300 },
    ],
    rollbackReason: null,
    error: null,
  },
];

// ─── Configuraciones de drivers mock ───
// Define que drivers estan disponibles y su configuracion
const DRIVER_CONFIGS = {
  network: [
    {
      driverType: 'NETWORK',
      driverName: 'mock-network',
      version: '1.0.0-mock',
      config: {
        strategy: 'PACEMAKER_VIP',
        minDelayMs: 2000,
        maxDelayMs: 5000,
      },
      enabled: true,
      description: 'Mock Network Driver — Simula EIP/Route53/VIP switch con delays configurables',
    },
  ],
  db: [
    {
      driverType: 'DB',
      driverName: 'mock-db',
      version: '1.0.0-mock',
      config: {
        sid: 'HDB',
        instanceNumber: '00',
        replicationMode: 'SYNC',
        minDelayMs: 3000,
        maxDelayMs: 8000,
      },
      enabled: true,
      description: 'Mock DB Driver — Simula HANA SR takeover con estados intermedios realistas',
    },
  ],
  sap: [
    {
      driverType: 'SAP',
      driverName: 'mock-sap',
      version: '1.0.0-mock',
      config: {
        sid: 'PRD',
        instanceNumber: '00',
        minDelayMs: 5000,
        maxDelayMs: 10000,
      },
      enabled: true,
      description: 'Mock SAP Driver — Simula stop/start SAP con listas de procesos realistas',
    },
  ],
};

// ─── Planillas de pasos para operaciones ───
// Template de steps que se usan al crear operaciones nuevas
const STEP_TEMPLATES = {
  TAKEOVER: [
    { order: 1, name: 'Adquirir lock de operacion', driverType: 'SYSTEM', driverName: 'system', action: 'acquireLock', timeoutMs: 30000, canRollback: true },
    { order: 2, name: 'Capturar estado previo', driverType: 'SYSTEM', driverName: 'system', action: 'capturePreState', timeoutMs: 60000, canRollback: false },
    { order: 3, name: 'Detener SAP en source', driverType: 'SAP', driverName: 'mock-sap', action: 'stopOnSource', timeoutMs: 300000, canRollback: true },
    { order: 4, name: 'Takeover HANA SR', driverType: 'DB', driverName: 'mock-db', action: 'takeover', timeoutMs: 300000, canRollback: true },
    { order: 5, name: 'Switch red a target', driverType: 'NETWORK', driverName: 'mock-network', action: 'switchToTarget', timeoutMs: 120000, canRollback: true },
    { order: 6, name: 'Iniciar SAP en target', driverType: 'SAP', driverName: 'mock-sap', action: 'startOnTarget', timeoutMs: 300000, canRollback: true },
    { order: 7, name: 'Verificar post-takeover', driverType: 'SYSTEM', driverName: 'system', action: 'verifyPostTakeover', timeoutMs: 120000, canRollback: false },
    { order: 8, name: 'Liberar lock', driverType: 'SYSTEM', driverName: 'system', action: 'releaseLock', timeoutMs: 30000, canRollback: false },
  ],
  FAILOVER: [
    { order: 1, name: 'Adquirir lock emergencia', driverType: 'SYSTEM', driverName: 'system', action: 'acquireLock', timeoutMs: 10000, canRollback: true },
    { order: 2, name: 'Capturar estado previo', driverType: 'SYSTEM', driverName: 'system', action: 'capturePreState', timeoutMs: 30000, canRollback: false },
    { order: 3, name: 'Forzar detener SAP en source', driverType: 'SAP', driverName: 'mock-sap', action: 'stopOnSource', timeoutMs: 120000, canRollback: true },
    { order: 4, name: 'Takeover HANA SR (emergencia)', driverType: 'DB', driverName: 'mock-db', action: 'takeover', timeoutMs: 300000, canRollback: true },
    { order: 5, name: 'Switch red a target', driverType: 'NETWORK', driverName: 'mock-network', action: 'switchToTarget', timeoutMs: 60000, canRollback: true },
    { order: 6, name: 'Iniciar SAP en target', driverType: 'SAP', driverName: 'mock-sap', action: 'startOnTarget', timeoutMs: 300000, canRollback: true },
    { order: 7, name: 'Verificar post-failover', driverType: 'SYSTEM', driverName: 'system', action: 'verifyPostFailover', timeoutMs: 120000, canRollback: false },
    { order: 8, name: 'Liberar lock', driverType: 'SYSTEM', driverName: 'system', action: 'releaseLock', timeoutMs: 30000, canRollback: false },
  ],
  FAILBACK: [
    { order: 1, name: 'Adquirir lock de operacion', driverType: 'SYSTEM', driverName: 'system', action: 'acquireLock', timeoutMs: 30000, canRollback: true },
    { order: 2, name: 'Capturar estado previo', driverType: 'SYSTEM', driverName: 'system', action: 'capturePreState', timeoutMs: 60000, canRollback: false },
    { order: 3, name: 'Detener SAP en nodo actual', driverType: 'SAP', driverName: 'mock-sap', action: 'stopOnSource', timeoutMs: 300000, canRollback: true },
    { order: 4, name: 'Takeover HANA SR a nodo original', driverType: 'DB', driverName: 'mock-db', action: 'takeover', timeoutMs: 300000, canRollback: true },
    { order: 5, name: 'Switch red a nodo original', driverType: 'NETWORK', driverName: 'mock-network', action: 'switchToTarget', timeoutMs: 120000, canRollback: true },
    { order: 6, name: 'Iniciar SAP en nodo original', driverType: 'SAP', driverName: 'mock-sap', action: 'startOnTarget', timeoutMs: 300000, canRollback: true },
    { order: 7, name: 'Registrar nodo secundario', driverType: 'DB', driverName: 'mock-db', action: 'registerAsSecondary', timeoutMs: 300000, canRollback: false },
    { order: 8, name: 'Verificar post-failback', driverType: 'SYSTEM', driverName: 'system', action: 'verifyPostTakeover', timeoutMs: 120000, canRollback: false },
    { order: 9, name: 'Liberar lock', driverType: 'SYSTEM', driverName: 'system', action: 'releaseLock', timeoutMs: 30000, canRollback: false },
  ],
};

// ─── Funciones helper para generar datos ───

/** Crear un ID de operacion unico */
function generateOperationId() {
  return `op-${crypto.randomUUID().substring(0, 8)}`;
}

/** Crear steps planificados a partir de un template */
function generatePlannedSteps(operationType, systemConfig) {
  const template = STEP_TEMPLATES[operationType];
  if (!template) return [];

  return template.map(tmpl => ({
    stepId: `step-${crypto.randomUUID().substring(0, 8)}`,
    order: tmpl.order,
    name: tmpl.name,
    driverType: tmpl.driverType,
    driverName: tmpl.driverName,
    action: tmpl.action,
    config: {
      systemId: systemConfig.systemId,
      sid: systemConfig.sid,
      instanceNumber: systemConfig.instanceNumber,
      sourceNode: systemConfig.primaryNode,
      targetNode: systemConfig.secondaryNode,
    },
    status: 'PENDING',
    timeoutMs: tmpl.timeoutMs,
    canRollback: tmpl.canRollback,
    result: null,
    evidence: null,
    timestamps: { startedAt: null, completedAt: null },
    durationMs: 0,
  }));
}

/** Crear nueva operacion HA mock */
function createMockOperation({ systemId, operationType, triggeredBy, reason }) {
  const system = HA_SYSTEMS.find(s => s.systemId === systemId);
  if (!system) return null;
  if (!system.haEnabled) return null;

  const operationId = generateOperationId();
  const plannedSteps = generatePlannedSteps(operationType, system);

  // Estimar duracion basado en los timeouts de los steps
  const estimatedDurationMs = plannedSteps.reduce((sum, s) => sum + Math.min(s.timeoutMs, 60000), 0);

  return {
    pk: `HA_OP#${operationId}`,
    sk: 'META',
    operationId,
    systemId: system.systemId,
    sid: system.sid,
    operationType: operationType || 'TAKEOVER',
    status: 'PLANNED',
    triggeredBy: triggeredBy || 'mock-user@empresa.com',
    reason: reason || 'Operacion mock creada para pruebas',
    plannedSteps,
    executedSteps: [],
    evidencePack: { entries: [], hash: null },
    networkStrategy: system.networkStrategy,
    dbStrategy: 'HANA_SR',
    sapStrategy: 'SAP_SERVICES',
    sourceNode: system.primaryNode,
    targetNode: system.secondaryNode,
    timestamps: {
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
    },
    estimatedDurationMs,
    rollbackReason: null,
    error: null,
  };
}

/** Buscar sistema por ID */
function findSystemById(systemId) {
  return HA_SYSTEMS.find(s => s.systemId === systemId) || null;
}

/** Obtener todos los drivers disponibles como lista plana */
function getAllDriverConfigs() {
  return [
    ...DRIVER_CONFIGS.network,
    ...DRIVER_CONFIGS.db,
    ...DRIVER_CONFIGS.sap,
  ];
}

module.exports = {
  // Datos base
  HA_SYSTEMS,
  PREREQUISITES_BY_SYSTEM,
  OPERATION_HISTORY,
  DRIVER_CONFIGS,
  STEP_TEMPLATES,

  // Funciones helper
  generateOperationId,
  generatePlannedSteps,
  createMockOperation,
  findSystemById,
  getAllDriverConfigs,
};
