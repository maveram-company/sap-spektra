'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — Discovery Engine
//  Motor de descubrimiento profundo de instancias SAP.
//
//  Capacidades:
//  - Detecta roles SAP (ASCS, ERS, PAS, AAS, Web Dispatcher)
//  - Detecta version de kernel SAP
//  - Detecta cluster HA (Pacemaker/corosync)
//  - Detecta HANA System Replication (HSR) primary/secondary
//  - Persiste en DynamoDB: discovered-instances + landscape-topology
//
//  Triggers:
//  - Invocacion directa desde wizard/dashboard-api
//  - EventBridge semanal (opcional)
// ═══════════════════════════════════════════════════════════════

const log = require('../utilidades/logger')('discovery-engine');
const { classifyAllInstances } = require('./classifier');

const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ssm = new SSMClient({});
const ec2 = new EC2Client({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const INSTANCES_TABLE = process.env.DISCOVERED_INSTANCES_TABLE || 'sap-alwaysops-discovered-instances';
const TOPOLOGY_TABLE = process.env.LANDSCAPE_TOPOLOGY_TABLE || 'sap-alwaysops-landscape-topology';
const SSM_TIMEOUT = 60;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 55000;

// ═══════════════════════════════════════════════════════════════
//  SCRIPT SSM — Descubrimiento profundo (Linux)
//  Extiende la deteccion basica con: roles, kernel, HA, HSR
// ═══════════════════════════════════════════════════════════════

const DEEP_DISCOVERY_LINUX = `#!/bin/bash
echo "===DEEP_DISCOVERY_START==="

# ─── 1. SIDs detectados ───
echo "---SIDS---"
for d in /usr/sap/*/; do
  sid=$(basename "$d")
  if [[ "$sid" =~ ^[A-Z][A-Z0-9]{2}$ ]] && [[ ! "$sid" =~ ^(tmp|shared|trans)$ ]]; then
    echo "SID:$sid"
  fi
done

# ─── 2. Perfiles de instancia (roles ASCS/ERS/PAS/AAS) ───
echo "---PROFILES---"
for pfl in /usr/sap/*/SYS/profile/*_*; do
  [ -f "$pfl" ] || continue
  echo "PROFILE_FILE:$pfl"
  grep -E "^(INSTANCE_NAME|SAPSYSTEM|SAPSYSTEMNAME|Start_Program|rdisp/mshost|rdisp/msserv)" "$pfl" 2>/dev/null
done

# ─── 3. Version del kernel SAP ───
echo "---KERNEL---"
for exe in /usr/sap/*/D*/exe/disp+work /usr/sap/*/ASCS*/exe/disp+work /usr/sap/*/SCS*/exe/disp+work; do
  [ -x "$exe" ] || continue
  echo "KERNEL_EXE:$exe"
  "$exe" -v 2>/dev/null | head -5
  break
done

# ─── 4. HANA Detection ───
echo "---HANA---"
for ini in /usr/sap/*/SYS/global/hdb/custom/config/global.ini /hana/shared/*/global/hdb/custom/config/global.ini; do
  [ -f "$ini" ] || continue
  echo "GLOBAL_INI:$ini"
  grep -E "^(listenport|internal_hostname|workergroup)" "$ini" 2>/dev/null
done

# ─── 5. HANA System Replication (HSR) ───
echo "---HSR---"
for siddir in /usr/sap/*/HDB*; do
  [ -d "$siddir" ] || continue
  sid=$(echo "$siddir" | sed 's|/usr/sap/\\([^/]*\\)/.*|\\1|')
  sidlower=$(echo "$sid" | tr '[:upper:]' '[:lower:]')
  su - "\${sidlower}adm" -c "hdbnsutil -sr_state" 2>/dev/null | head -20
done

# ─── 6. Cluster HA (Pacemaker/Corosync) ───
echo "---HA_CLUSTER---"
if command -v crm_mon &>/dev/null; then
  crm_mon -1 --inactive 2>/dev/null | head -40
elif command -v pcs &>/dev/null; then
  pcs status 2>/dev/null | head -40
fi

# ─── 7. Procesos SAP activos ───
echo "---PROCESSES---"
ps aux 2>/dev/null | grep -E '(hdb|sapstart|disp.work|enserver|msg_server|enrepserver|sapwebdisp|saprouter|j2ee|jstart|icman)' | grep -v grep | awk '{print $11}'

# ─── 8. Puertos escuchando (rango SAP) ───
echo "---PORTS---"
ss -tlnp 2>/dev/null | grep -oE ':[0-9]+' | sort -u | grep -E ':(3[0-9]{4}|5[0-9]{4}|8[0-9]{3})' | sed 's/:/PORT:/'

# ─── 9. Red ───
echo "---NETWORK---"
echo "HOSTNAME:$(hostname)"
echo "IP:$(hostname -I 2>/dev/null | awk '{print $1}')"

# ─── 10. Montajes de disco ───
echo "---MOUNTS---"
df -h 2>/dev/null | grep -E '(/usr/sap|/hana|/sapmnt|/oracle)' | awk '{print "MOUNT:"$6"|"$2"|"$3"|"$5}'

echo "===DEEP_DISCOVERY_END==="
`;

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: runSsmCommand
//  Ejecuta un comando SSM en una instancia y espera resultado.
// ═══════════════════════════════════════════════════════════════

async function runSsmCommand(instanceId) {
  log.info('Ejecutando SSM command', { instanceId });

  const sendResult = await ssm.send(new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: { commands: [DEEP_DISCOVERY_LINUX] },
    TimeoutSeconds: SSM_TIMEOUT,
    Comment: 'SAP Spektra - Deep Discovery',
  }));

  const commandId = sendResult.Command.CommandId;
  const startTime = Date.now();

  // Poll hasta que el comando termine
  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const invocation = await ssm.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      }));

      if (invocation.Status === 'Success') {
        log.info('SSM command exitoso', { instanceId, duration: `${Date.now() - startTime}ms` });
        return { success: true, output: invocation.StandardOutputContent || '' };
      }
      if (['Failed', 'TimedOut', 'Cancelled'].includes(invocation.Status)) {
        log.error('SSM command fallido', { instanceId, status: invocation.Status });
        return { success: false, error: `SSM status: ${invocation.Status}`, output: invocation.StandardErrorContent || '' };
      }
    } catch (err) {
      if (!err.name?.includes('InvocationDoesNotExist')) throw err;
    }
  }

  return { success: false, error: 'SSM command timeout' };
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: parseDeepDiscovery
//  Parsea el output del script de descubrimiento profundo.
// ═══════════════════════════════════════════════════════════════

function parseDeepDiscovery(output, instanceId) {
  const facts = {
    instanceId,
    sids: [],
    profiles: [],
    kernelVersion: null,
    hana: { found: false },
    hsrState: null,
    haCluster: null,
    processes: [],
    ports: [],
    hostname: '',
    ip: '',
    os: 'linux',
    mounts: [],
  };

  let section = '';
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('===')) continue;

    // Detectar secciones
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      section = trimmed.replace(/---/g, '').trim();
      continue;
    }

    switch (section) {
      case 'SIDS':
        if (trimmed.startsWith('SID:')) {
          facts.sids.push(trimmed.split(':')[1]);
        }
        break;

      case 'PROFILES': {
        if (trimmed.startsWith('PROFILE_FILE:')) {
          facts.profiles.push({ profilePath: trimmed.split(':').slice(1).join(':'), profileName: '' });
        } else if (trimmed.includes('=')) {
          const [key, ...valParts] = trimmed.split('=');
          const val = valParts.join('=').trim();
          const lastProfile = facts.profiles[facts.profiles.length - 1];
          if (lastProfile) {
            if (key.trim() === 'INSTANCE_NAME') lastProfile.instanceName = val;
            if (key.trim() === 'SAPSYSTEM') lastProfile.instanceNumber = val;
            if (key.trim() === 'SAPSYSTEMNAME') lastProfile.sid = val;
            if (key.trim() === 'Start_Program') lastProfile.startProgram = val;
          }
        }
        break;
      }

      case 'KERNEL':
        if (trimmed.startsWith('KERNEL_EXE:')) break;
        if (trimmed.includes('kernel release') || trimmed.includes('patch number')) {
          if (!facts.kernelVersion) facts.kernelVersion = {};
          if (trimmed.includes('kernel release')) {
            facts.kernelVersion.release = trimmed.split(/\s+/).pop();
          }
          if (trimmed.includes('patch number')) {
            facts.kernelVersion.patchNumber = trimmed.split(/\s+/).pop();
          }
        }
        break;

      case 'HANA':
        if (trimmed.startsWith('GLOBAL_INI:')) {
          facts.hana.found = true;
          facts.hana.globalIni = trimmed.split(':').slice(1).join(':');
        } else if (trimmed.includes('=')) {
          const [k, v] = trimmed.split('=').map(s => s.trim());
          if (!facts.hana.config) facts.hana.config = {};
          facts.hana.config[k] = v;
        }
        break;

      case 'HSR':
        if (trimmed.includes('mode:')) {
          const modeMatch = trimmed.match(/mode:\s*(\w+)/);
          if (modeMatch) {
            facts.hsrState = facts.hsrState || {};
            facts.hsrState.mode = modeMatch[1].toLowerCase();
          }
        }
        if (trimmed.includes('site id:')) {
          facts.hsrState = facts.hsrState || {};
          facts.hsrState.siteId = trimmed.match(/site id:\s*(\d+)/)?.[1];
        }
        if (trimmed.includes('site name:')) {
          facts.hsrState = facts.hsrState || {};
          facts.hsrState.siteName = trimmed.match(/site name:\s*(\S+)/)?.[1];
        }
        break;

      case 'HA_CLUSTER':
        if (!facts.haCluster) facts.haCluster = { type: 'pacemaker', resources: [] };
        if (trimmed.includes('Current DC:')) {
          facts.haCluster.currentDC = trimmed.split('Current DC:')[1].trim().split(/\s/)[0];
        }
        if (trimmed.match(/^\*?\s*(Master|Slave|Started|Stopped)/)) {
          facts.haCluster.resources.push(trimmed);
        }
        // Detectar si este nodo es Master o Slave
        if (trimmed.includes('Master') && trimmed.includes(facts.hostname)) {
          facts.haCluster.localRole = 'master';
        }
        if (trimmed.includes('Slave') && trimmed.includes(facts.hostname)) {
          facts.haCluster.localRole = 'slave';
        }
        break;

      case 'PROCESSES':
        if (trimmed && !trimmed.startsWith('USER')) {
          const procName = trimmed.split('/').pop();
          if (procName) facts.processes.push(procName);
        }
        break;

      case 'PORTS':
        if (trimmed.startsWith('PORT:')) {
          const port = parseInt(trimmed.split(':')[1]);
          if (!isNaN(port)) facts.ports.push(port);
        }
        break;

      case 'NETWORK':
        if (trimmed.startsWith('HOSTNAME:')) facts.hostname = trimmed.split(':')[1];
        if (trimmed.startsWith('IP:')) facts.ip = trimmed.split(':')[1];
        break;

      case 'MOUNTS':
        if (trimmed.startsWith('MOUNT:')) {
          const [, mountPoint, size, used, usePct] = trimmed.split('|');
          facts.mounts.push({ mountPoint: mountPoint || '', size: size || '', used: used || '', usePct: usePct || '' });
        }
        break;
    }
  }

  // Derivar instanceNumber del primer perfil
  if (facts.profiles.length > 0 && facts.profiles[0].instanceNumber) {
    facts.instanceNumber = parseInt(facts.profiles[0].instanceNumber);
  }

  return facts;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: persistResults
//  Guarda resultados en DynamoDB (instances + topology).
// ═══════════════════════════════════════════════════════════════

async function persistResults(classifiedInstances, landscapes) {
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 3600; // 90 dias

  // Persistir instancias descubiertas
  for (const inst of classifiedInstances) {
    // LATEST record
    await ddbDoc.send(new PutCommand({
      TableName: INSTANCES_TABLE,
      Item: {
        pk: `INSTANCE#${inst.instanceId}`,
        sk: 'LATEST',
        ...inst,
        lastSeen: now,
        ttl,
      },
    }));

    // HISTORY record
    await ddbDoc.send(new PutCommand({
      TableName: INSTANCES_TABLE,
      Item: {
        pk: `INSTANCE#${inst.instanceId}`,
        sk: `HISTORY#${now}`,
        ...inst,
        lastSeen: now,
        ttl,
      },
    }));
  }

  // Persistir landscape topology
  for (const [sid, landscape] of Object.entries(landscapes)) {
    for (const inst of landscape.instances) {
      await ddbDoc.send(new PutCommand({
        TableName: TOPOLOGY_TABLE,
        Item: {
          pk: `LANDSCAPE#${sid}`,
          sk: `INSTANCE#${inst.instanceId}`,
          sid,
          ...inst,
          lastUpdated: now,
          ttl,
        },
      }));
    }
  }

  log.info('Resultados persistidos en DynamoDB', {
    instanceCount: classifiedInstances.length,
    landscapeCount: Object.keys(landscapes).length,
  });
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: getEC2Details
//  Obtiene metadatos de EC2 (tags, tipo, AZ).
// ═══════════════════════════════════════════════════════════════

async function getEC2Details(instanceIds) {
  try {
    const result = await ec2.send(new DescribeInstancesCommand({
      InstanceIds: instanceIds,
    }));
    const details = {};
    for (const reservation of (result.Reservations || [])) {
      for (const instance of (reservation.Instances || [])) {
        const tags = {};
        (instance.Tags || []).forEach(t => { tags[t.Key] = t.Value; });
        details[instance.InstanceId] = {
          instanceType: instance.InstanceType,
          availabilityZone: instance.Placement?.AvailabilityZone,
          privateIp: instance.PrivateIpAddress,
          platform: instance.Platform || 'linux',
          name: tags.Name || '',
          tags,
        };
      }
    }
    return details;
  } catch (err) {
    log.warn('No se pudieron obtener detalles EC2', { error: err.message });
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Recibe lista de instanceIds, ejecuta descubrimiento profundo,
//  clasifica, y persiste resultados.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('Discovery Engine invocado', { event: JSON.stringify(event).substring(0, 200) });
  const startTime = Date.now();

  try {
    // Obtener instanceIds del evento
    const instanceIds = event.instanceIds || [];
    if (instanceIds.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere instanceIds (array)' }) };
    }

    log.info(`Descubriendo ${instanceIds.length} instancias`);

    // 1. Obtener detalles EC2
    const ec2Details = await getEC2Details(instanceIds);

    // 2. Ejecutar SSM en paralelo (max 5 a la vez)
    const batchSize = 5;
    const allFacts = [];

    for (let i = 0; i < instanceIds.length; i += batchSize) {
      const batch = instanceIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (instanceId) => {
          const ssmResult = await runSsmCommand(instanceId);
          if (!ssmResult.success) {
            log.warn('SSM fallido para instancia', { instanceId, error: ssmResult.error });
            return null;
          }
          const facts = parseDeepDiscovery(ssmResult.output, instanceId);

          // Enriquecer con datos EC2
          const ec2Info = ec2Details[instanceId] || {};
          facts.ec2 = ec2Info;
          if (!facts.hostname) facts.hostname = ec2Info.name || instanceId;
          if (!facts.ip) facts.ip = ec2Info.privateIp || '';

          return facts;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          allFacts.push(result.value);
        }
      }
    }

    // 3. Clasificar todas las instancias
    const { instances: classifiedInstances, landscapes } = classifyAllInstances(allFacts);

    // 4. Persistir resultados
    await persistResults(classifiedInstances, landscapes);

    // 5. Emitir metrica de duracion
    const duration = Date.now() - startTime;
    log.metric('DiscoveryDuration', duration, 'Milliseconds', { Component: 'discovery-engine' });
    log.info('Discovery completado', { duration: `${duration}ms`, instancesDiscovered: classifiedInstances.length });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        instancesDiscovered: classifiedInstances.length,
        landscapesDetected: Object.keys(landscapes).length,
        instances: classifiedInstances,
        landscapes,
        duration: `${duration}ms`,
      }),
    };

  } catch (err) {
    log.error('Error fatal en Discovery Engine', { error: err.message, stack: err.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
