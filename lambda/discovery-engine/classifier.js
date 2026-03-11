'use strict';

// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.0 — SAP Instance Classifier
//  Reglas deterministas para clasificar instancias SAP
//  a partir de facts (procesos, perfiles, configuracion).
//
//  Input:  facts = { processes, profiles, hana, haCluster, ... }
//  Output: { product, role, instanceNumber, haStatus, ... }
// ═══════════════════════════════════════════════════════════════

const log = require('../utilidades/logger')('classifier');

// ═══════════════════════════════════════════════════════════════
//  REGLAS DE CLASIFICACION
//  Orden importa: la primera regla que matchea gana.
// ═══════════════════════════════════════════════════════════════

const CLASSIFICATION_RULES = [
  // ─── HANA Database ───
  {
    id: 'HANA_PRIMARY',
    product: 'SAP HANA',
    role: 'HANA Primary',
    match: (f) => f.hana?.found && f.hsrState?.mode === 'primary',
  },
  {
    id: 'HANA_SECONDARY',
    product: 'SAP HANA',
    role: 'HANA Secondary',
    match: (f) => f.hana?.found && (f.hsrState?.mode === 'sync' || f.hsrState?.mode === 'async' || f.hsrState?.mode === 'syncmem'),
  },
  {
    id: 'HANA_STANDALONE',
    product: 'SAP HANA',
    role: 'HANA Standalone',
    match: (f) => f.hana?.found && !f.hsrState?.mode,
  },

  // ─── SAP Central Services ───
  {
    id: 'ASCS',
    product: 'SAP NetWeaver',
    role: 'ASCS',
    match: (f) => hasProfile(f, 'ASCS') || (hasProcess(f, 'msg_server') && hasProcess(f, 'enserver')),
  },
  {
    id: 'ERS',
    product: 'SAP NetWeaver',
    role: 'ERS',
    match: (f) => hasProfile(f, 'ERS') || hasProcess(f, 'enrepserver'),
  },
  {
    id: 'SCS_JAVA',
    product: 'SAP NetWeaver Java',
    role: 'SCS',
    match: (f) => hasProfile(f, 'SCS') && hasProcess(f, 'jstart'),
  },

  // ─── Application Servers ───
  {
    id: 'PAS',
    product: 'SAP NetWeaver',
    role: 'PAS',
    match: (f) => hasProcess(f, 'disp+work') && isPrimaryAppServer(f),
  },
  {
    id: 'AAS',
    product: 'SAP NetWeaver',
    role: 'AAS',
    match: (f) => hasProcess(f, 'disp+work') && !isPrimaryAppServer(f),
  },

  // ─── Web Dispatcher ───
  {
    id: 'WEBDISP',
    product: 'SAP Web Dispatcher',
    role: 'Web Dispatcher',
    match: (f) => hasProcess(f, 'sapwebdisp'),
  },

  // ─── SAP PO/PI (Java Stack) ───
  {
    id: 'PO_PI',
    product: 'SAP PO/PI',
    role: 'Java Application Server',
    match: (f) => hasProcess(f, 'jstart') || hasProcess(f, 'j2ee'),
  },

  // ─── SAP Router ───
  {
    id: 'SAPROUTER',
    product: 'SAP Router',
    role: 'SAP Router',
    match: (f) => hasProcess(f, 'saprouter'),
  },
];

// ═══════════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════

function hasProcess(facts, processName) {
  if (!facts.processes || !Array.isArray(facts.processes)) return false;
  return facts.processes.some(p =>
    p.toLowerCase().includes(processName.toLowerCase())
  );
}

function hasProfile(facts, roleName) {
  if (!facts.profiles || !Array.isArray(facts.profiles)) return false;
  return facts.profiles.some(p =>
    p.instanceName?.includes(roleName) || p.profileName?.includes(roleName)
  );
}

function isPrimaryAppServer(facts) {
  // PAS es tipicamente instancia 00 o la primera instancia ABAP
  if (!facts.profiles) return true; // Sin perfiles, asumir PAS
  const abapProfiles = facts.profiles.filter(p =>
    p.instanceName && !p.instanceName.includes('ASCS') && !p.instanceName.includes('ERS')
  );
  if (abapProfiles.length === 0) return true;
  // Instancia con numero mas bajo = PAS
  const instanceNums = abapProfiles.map(p => {
    const match = p.instanceName?.match(/(\d+)$/);
    return match ? parseInt(match[1]) : 99;
  });
  const minInstance = Math.min(...instanceNums);
  const thisInstance = facts.instanceNumber || 0;
  return thisInstance <= minInstance;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN PRINCIPAL: classify
//  Recibe facts de una instancia y retorna la clasificacion.
// ═══════════════════════════════════════════════════════════════

function classify(facts) {
  for (const rule of CLASSIFICATION_RULES) {
    try {
      if (rule.match(facts)) {
        log.info('Instancia clasificada', {
          instanceId: facts.instanceId,
          ruleId: rule.id,
          product: rule.product,
          role: rule.role,
        });
        return {
          product: rule.product,
          role: rule.role,
          ruleId: rule.id,
          confidence: 'high',
        };
      }
    } catch (err) {
      log.warn(`Error evaluando regla ${rule.id}`, { error: err.message });
    }
  }

  // Clasificacion generica si no matchea ninguna regla
  const product = facts.sids?.length > 0 ? 'SAP System' : 'Unknown';
  log.info('Instancia sin clasificacion especifica', {
    instanceId: facts.instanceId,
    product,
  });
  return {
    product,
    role: 'Unknown',
    ruleId: 'UNKNOWN',
    confidence: 'low',
  };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: classifyAllInstances
//  Clasifica multiples instancias y agrupa por SID/landscape.
// ═══════════════════════════════════════════════════════════════

function classifyAllInstances(instancesFacts) {
  const results = [];
  const landscapes = {};

  for (const facts of instancesFacts) {
    const classification = classify(facts);

    const result = {
      instanceId: facts.instanceId,
      hostname: facts.hostname || '',
      ip: facts.ip || '',
      os: facts.os || 'linux',
      sids: facts.sids || [],
      ...classification,
      kernelVersion: facts.kernelVersion || null,
      haCluster: facts.haCluster || null,
      hsrState: facts.hsrState || null,
      mounts: facts.mounts || [],
      discoveredAt: new Date().toISOString(),
    };

    results.push(result);

    // Agrupar por SID para landscape topology
    for (const sid of (facts.sids || [])) {
      if (!landscapes[sid]) {
        landscapes[sid] = { sid, instances: [] };
      }
      landscapes[sid].instances.push({
        instanceId: facts.instanceId,
        role: classification.role,
        product: classification.product,
        haCluster: facts.haCluster || null,
        peerInstanceId: facts.haCluster?.peerInstanceId || null,
        primarySecondary: classification.role.includes('Primary') ? 'primary' :
                         classification.role.includes('Secondary') ? 'secondary' : null,
      });
    }
  }

  return { instances: results, landscapes };
}

module.exports = { classify, classifyAllInstances, CLASSIFICATION_RULES };
