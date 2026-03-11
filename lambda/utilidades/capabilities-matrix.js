'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.4 — Capabilities Matrix
//  Genera y consulta la matriz de capacidades por SID/host.
//  Cero misterio: toda limitacion tiene explicacion + next action.
// ═══════════════════════════════════════════════════════════════

/**
 * Construye la matriz de capacidades desde los resultados de discovery.
 *
 * @param {object} discoveryResult - Resultado del discovery-engine
 * @returns {object} - Matriz de capacidades con reasonCode y howToFix
 */
function buildCapabilitiesFromDiscovery(discoveryResult) {
  const caps = {
    canDiscover: { enabled: true, reasonCode: 'OK', howToFix: null },
    canRunSSM: { enabled: false, reasonCode: 'UNKNOWN', howToFix: 'Verificar que SSM Agent esta instalado y el tag Project=SAP-AlwaysOps esta asignado' },
    canCollectDBMetrics: { enabled: false, reasonCode: 'UNKNOWN', howToFix: 'Ejecutar discovery para detectar tipo de BD' },
    canExecuteRunbooks: { enabled: false, reasonCode: 'UNKNOWN', howToFix: 'Verificar permisos SSM y credenciales de BD en Secrets Manager' },
    canMonitorHA: { enabled: false, reasonCode: 'NO_HA_DETECTED', howToFix: 'Configurar HA cluster (Pacemaker/WSFC) si aplica' },
    requiresAgent: { enabled: true, reasonCode: 'SSM_AGENT_REQUIRED', howToFix: null },
    dbType: 'unknown',
    osType: 'unknown',
    product: 'unknown',
    haEnabled: false,
  };

  if (!discoveryResult) return caps;

  // SSM connectivity
  if (discoveryResult.sids && discoveryResult.sids.length > 0) {
    caps.canRunSSM = { enabled: true, reasonCode: 'SSM_CONNECTED', howToFix: null };
    caps.canDiscover = { enabled: true, reasonCode: 'DISCOVERY_COMPLETE', howToFix: null };
  }

  // OS type
  if (discoveryResult.hostname) {
    caps.osType = discoveryResult.platform || (discoveryResult.hostname.includes('win') ? 'WINDOWS' : 'LINUX');
  }

  // DB type detection
  if (discoveryResult.hana && discoveryResult.hana.found) {
    caps.dbType = 'HANA';
    caps.canCollectDBMetrics = { enabled: true, reasonCode: 'HANA_DETECTED', howToFix: null };
  } else if (discoveryResult.profiles) {
    const hasASE = discoveryResult.profiles.some(p => (p.components || '').includes('ASE'));
    const hasMaxDB = discoveryResult.profiles.some(p => (p.components || '').includes('MaxDB'));
    if (hasASE) {
      caps.dbType = 'ASE';
      caps.canCollectDBMetrics = { enabled: true, reasonCode: 'ASE_DETECTED', howToFix: null };
    } else if (hasMaxDB) {
      caps.dbType = 'MAXDB';
      caps.canCollectDBMetrics = { enabled: true, reasonCode: 'MAXDB_DETECTED', howToFix: null };
    }
  }

  // Runbook execution capability
  if (caps.canRunSSM.enabled && caps.canCollectDBMetrics.enabled) {
    caps.canExecuteRunbooks = { enabled: true, reasonCode: 'FULLY_CAPABLE', howToFix: null };
  } else if (caps.canRunSSM.enabled) {
    caps.canExecuteRunbooks = {
      enabled: true,
      reasonCode: 'PARTIAL_NO_DB',
      howToFix: 'Runbooks de BD no disponibles hasta que se detecte el tipo de BD',
    };
  }

  // HA monitoring
  if (discoveryResult.haCluster && discoveryResult.haCluster.type) {
    caps.haEnabled = true;
    caps.canMonitorHA = { enabled: true, reasonCode: 'HA_CLUSTER_DETECTED', howToFix: null };
  } else if (discoveryResult.hsrState && discoveryResult.hsrState.mode !== 'none') {
    caps.haEnabled = true;
    caps.canMonitorHA = { enabled: true, reasonCode: 'HSR_DETECTED', howToFix: null };
  }

  // Product detection
  if (discoveryResult.product) {
    caps.product = discoveryResult.product;
  } else if (discoveryResult.sids && discoveryResult.profiles) {
    // Inferir producto desde los perfiles
    const hasJava = discoveryResult.profiles.some(p => (p.instanceName || '').includes('J'));
    const hasABAP = discoveryResult.profiles.some(p => (p.instanceName || '').includes('D'));
    if (hasJava && hasABAP) caps.product = 'SAP NetWeaver (ABAP+Java)';
    else if (hasJava) caps.product = 'SAP Java';
    else if (hasABAP) caps.product = 'SAP ABAP';
    else caps.product = 'unknown';
  }

  return caps;
}

/**
 * Verifica si un runbook se puede ejecutar en un SID/host.
 *
 * @param {object} capabilities - Matriz de capacidades
 * @param {string} runbookId - ID del runbook a verificar
 * @returns {{allowed: boolean, missing: string[], howToFix: string[]}}
 */
function canExecuteRunbook(capabilities, runbookId) {
  const missing = [];
  const howToFix = [];

  // Verificar SSM
  if (!capabilities.canRunSSM?.enabled) {
    missing.push('SSM connectivity');
    howToFix.push(capabilities.canRunSSM?.howToFix || 'Instalar SSM Agent');
  }

  // Verificar si es runbook de BD
  const dbRunbooks = ['RB-ASE-001', 'RB-ASE-002', 'RB-ASE-003', 'RB-HANA-001', 'RB-HANA-002', 'RB-HA-001', 'RB-MAXDB-001'];
  if (dbRunbooks.includes(runbookId) && !capabilities.canCollectDBMetrics?.enabled) {
    missing.push('DB metrics collection');
    howToFix.push(capabilities.canCollectDBMetrics?.howToFix || 'Verificar tipo de BD');
  }

  // Verificar si es runbook de HA
  const haRunbooks = ['RB-HA-001'];
  if (haRunbooks.includes(runbookId) && !capabilities.canMonitorHA?.enabled) {
    missing.push('HA monitoring');
    howToFix.push(capabilities.canMonitorHA?.howToFix || 'Configurar HA cluster');
  }

  return {
    allowed: missing.length === 0,
    missing,
    howToFix,
  };
}

module.exports = {
  buildCapabilitiesFromDiscovery,
  canExecuteRunbook,
};
