// ============================================================================
//  Avvale SAP AlwaysOps v1.0 — Setup Portal — Auto-discovery de configuración SAP via SSM
//  Conecta a instancias EC2 via AWS Systems Manager para leer configuración SAP
// ============================================================================

'use strict';

const { createClients } = require('./utils');
const { SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');

// ── Tiempo máximo de espera para un comando SSM (30 segundos) ──
const SSM_TIMEOUT_MS = 30000;
const SSM_POLL_INTERVAL_MS = 2000;

// ════════════════════════════════════════════════════════════
//  Comandos por plataforma para descubrir configuración SAP
// ════════════════════════════════════════════════════════════

// Script Linux/SLES: Buscar configuración SAP HANA y NetWeaver
// NOTA: Usamos array join para evitar que JS interprete ${} como template expressions
const LINUX_DISCOVERY_SCRIPT = [
  '#!/bin/bash',
  'echo "===SAP_DISCOVERY_START==="',
  '',
  '# 1. Detectar SIDs instalados (buscando en /usr/sap)',
  'echo "---SIDS---"',
  'if [ -d /usr/sap ]; then',
  '  for dir in /usr/sap/*/; do',
  '    sid=$(basename "$dir")',
  '    # Filtrar directorios que no son SIDs reales',
  '    if [[ "$sid" != "tmp" && "$sid" != "shared" && "$sid" != "trans" && ${#sid} -eq 3 ]]; then',
  '      echo "SID:$sid"',
  '    fi',
  '  done',
  'else',
  '  echo "NO_USR_SAP"',
  'fi',
  '',
  '# 2. Detectar HANA',
  'echo "---HANA---"',
  'if command -v hdbsql &>/dev/null; then',
  '  echo "HDBSQL:FOUND"',
  'fi',
  'for ini in /usr/sap/*/SYS/global/hdb/custom/config/global.ini /hana/shared/*/global/hdb/custom/config/global.ini /usr/sap/*/HDB*/global.ini; do',
  '  if [ -f "$ini" ]; then',
  '    echo "GLOBAL_INI:$ini"',
  '    grep -E "^(listenport|internal_hostname|workergroup)" "$ini" 2>/dev/null | head -10',
  '  fi',
  'done',
  '',
  '# 3. Buscar DEFAULT.PFL (perfil SAP por defecto)',
  'echo "---PROFILE---"',
  'for pfl in /usr/sap/*/SYS/profile/DEFAULT.PFL /sapmnt/*/profile/DEFAULT.PFL; do',
  '  if [ -f "$pfl" ]; then',
  '    echo "DEFAULT_PFL:$pfl"',
  '    grep -E "^(SAPSYSTEMNAME|SAPDBHOST|dbs/hdb/dbname|dbs/hdb/schema|rdisp/mshost|rdisp/msserv|icm/server_port_|SAPGLOBALHOST)" "$pfl" 2>/dev/null | head -20',
  '  fi',
  'done',
  '',
  '# 4. Buscar hdbuserstore (credenciales HANA guardadas)',
  'echo "---HDBUSERSTORE---"',
  'for hdbstore in /usr/sap/*/home/.hdb/*/SSFS_HDB.DAT; do',
  '  if [ -f "$hdbstore" ]; then',
  '    echo "HDBSTORE:$hdbstore"',
  '  fi',
  'done',
  '# Intentar ejecutar hdbuserstore list como usuario <sid>adm',
  'for sid_dir in /usr/sap/*/; do',
  '  sid=$(basename "$sid_dir")',
  '  if [[ ${#sid} -eq 3 && "$sid" != "tmp" ]]; then',
  '    sid_lower=$(echo "$sid" | tr \'[:upper:]\' \'[:lower:]\')',
  '    if id "${sid_lower}adm" &>/dev/null; then',
  '      echo "HDBUSERSTORE_LIST:${sid_lower}adm"',
  '      su - "${sid_lower}adm" -c "hdbuserstore list" 2>/dev/null | head -30',
  '    fi',
  '  fi',
  'done',
  '',
  '# 5. Detectar puertos HANA abiertos',
  'echo "---PORTS---"',
  'ss -tlnp 2>/dev/null | grep -E \':(3[0-9]{4})\' | awk \'{print $4}\' | head -10',
  '',
  '# 6. Hostname e IP',
  'echo "---NETWORK---"',
  'echo "HOSTNAME:$(hostname)"',
  'echo "IP:$(hostname -I 2>/dev/null | awk \'{print $1}\')"',
  '',
  '# 7. Detectar tipo de base de datos por procesos',
  'echo "---PROCESSES---"',
  'ps aux 2>/dev/null | grep -E \'(hdb|sapstart|dw.sap|enserver|msg_server)\' | grep -v grep | awk \'{print $11}\' | head -10',
  '',
  'echo "===SAP_DISCOVERY_END==="'
].join('\n');

// Script Windows/PowerShell: Buscar configuración SAP
// NOTA: Usamos array join para evitar que JS interprete $() como template expressions
const WINDOWS_DISCOVERY_SCRIPT = [
  'Write-Output "===SAP_DISCOVERY_START==="',
  '',
  '# 1. Detectar SIDs en C:\\usr\\sap o D:\\usr\\sap',
  'Write-Output "---SIDS---"',
  '$sapDirs = @("C:\\usr\\sap", "D:\\usr\\sap", "E:\\usr\\sap")',
  'foreach ($base in $sapDirs) {',
  '  if (Test-Path $base) {',
  '    Get-ChildItem $base -Directory | Where-Object { $_.Name.Length -eq 3 -and $_.Name -notmatch \'(tmp|shared|trans)\' } | ForEach-Object {',
  '      Write-Output "SID:$($_.Name)"',
  '    }',
  '  }',
  '}',
  '',
  '# 2. Buscar servicios SAP',
  'Write-Output "---SERVICES---"',
  'Get-Service | Where-Object { $_.Name -match \'SAP|HDB|HANA\' } | ForEach-Object {',
  '  Write-Output "SERVICE:$($_.Name)|$($_.Status)"',
  '} | Select-Object -First 15',
  '',
  '# 3. Buscar DEFAULT.PFL',
  'Write-Output "---PROFILE---"',
  'foreach ($base in $sapDirs) {',
  '  Get-ChildItem "$base\\*\\SYS\\profile\\DEFAULT.PFL" -ErrorAction SilentlyContinue | ForEach-Object {',
  '    Write-Output "DEFAULT_PFL:$($_.FullName)"',
  '    Get-Content $_.FullName | Where-Object { $_ -match \'^(SAPSYSTEMNAME|SAPDBHOST|dbs/hdb/dbname|dbs/hdb/schema|rdisp/mshost|icm/server_port_|SAPGLOBALHOST)\' } | Select-Object -First 20',
  '  }',
  '}',
  '',
  '# 4. Buscar configuracion HANA',
  'Write-Output "---HANA---"',
  'foreach ($base in $sapDirs) {',
  '  Get-ChildItem "$base\\*\\SYS\\global\\hdb\\custom\\config\\global.ini" -ErrorAction SilentlyContinue | ForEach-Object {',
  '    Write-Output "GLOBAL_INI:$($_.FullName)"',
  '    Get-Content $_.FullName | Where-Object { $_ -match \'(listenport|internal_hostname|workergroup)\' } | Select-Object -First 10',
  '  }',
  '}',
  '',
  '# 5. Detectar puertos HANA abiertos',
  'Write-Output "---PORTS---"',
  'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -ge 30000 -and $_.LocalPort -le 39999 } | ForEach-Object {',
  '  Write-Output "PORT:$($_.LocalPort)"',
  '} | Select-Object -First 10',
  '',
  '# 6. Hostname e IP',
  'Write-Output "---NETWORK---"',
  'Write-Output "HOSTNAME:$(hostname)"',
  '$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne \'127.0.0.1\' } | Select-Object -First 1).IPAddress',
  'Write-Output "IP:$ip"',
  '',
  '# 7. Registro de Windows - HANA',
  'Write-Output "---REGISTRY---"',
  'Get-ItemProperty "HKLM:\\SOFTWARE\\SAP\\*" -ErrorAction SilentlyContinue | ForEach-Object {',
  '  Write-Output "REG:$($_.PSChildName)"',
  '}',
  '',
  'Write-Output "===SAP_DISCOVERY_END==="'
].join('\n');

// ════════════════════════════════════════════════════════════
//  Funciones principales
// ════════════════════════════════════════════════════════════

/**
 * Ejecutar un comando SSM en una instancia EC2 y esperar el resultado
 * @param {string} region - Región AWS
 * @param {string} instanceId - ID de la instancia EC2
 * @param {string} platform - 'Linux' o 'Windows'
 * @returns {object} - Resultado del descubrimiento SAP
 */
async function discoverSapConfig(region, instanceId, platform) {
  const clients = createClients(region);
  const isWindows = (platform || '').toLowerCase().includes('windows');

  // Elegir el documento SSM y script según plataforma
  const documentName = isWindows ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript';
  const commands = isWindows ? [WINDOWS_DISCOVERY_SCRIPT] : [LINUX_DISCOVERY_SCRIPT];

  console.log(`[SAP-Discovery] Ejecutando en ${instanceId} (${isWindows ? 'Windows' : 'Linux'})...`);

  // 1. Enviar comando SSM
  const sendResult = await clients.ssm.send(new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: documentName,
    Parameters: { commands },
    TimeoutSeconds: 60,
    Comment: 'Avvale SAP AlwaysOps — Auto-descubrimiento de configuración SAP'
  }));

  const commandId = sendResult.Command.CommandId;
  console.log(`[SAP-Discovery] Comando enviado: ${commandId}`);

  // 2. Esperar a que el comando termine (polling)
  const startTime = Date.now();
  let output = '';
  let status = 'Pending';

  while (Date.now() - startTime < SSM_TIMEOUT_MS) {
    await new Promise(resolve => setTimeout(resolve, SSM_POLL_INTERVAL_MS));

    try {
      const invocation = await clients.ssm.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId
      }));

      status = invocation.Status;

      if (status === 'Success') {
        output = invocation.StandardOutputContent || '';
        console.log(`[SAP-Discovery] Comando exitoso (${output.length} chars de output)`);
        break;
      } else if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
        const errorOutput = invocation.StandardErrorContent || '';
        throw new Error(`Comando SSM falló con estado: ${status}. Error: ${errorOutput || 'Sin detalles'}`);
      }
      // Pending, InProgress, Delayed → seguir esperando
    } catch (err) {
      // InvocationDoesNotExist puede pasar si el comando aún no se registró
      if (err.name === 'InvocationDoesNotExist') continue;
      throw err;
    }
  }

  if (status !== 'Success') {
    throw new Error(`Timeout: El comando SSM no completó en ${SSM_TIMEOUT_MS / 1000}s (estado: ${status})`);
  }

  // 3. Parsear el output
  const parsed = parseDiscoveryOutput(output, isWindows);

  // 4. Enriquecer con datos de la instancia SSM/EC2
  parsed.instanceId = instanceId;
  parsed.platform = isWindows ? 'Windows' : 'Linux';

  return parsed;
}

/**
 * Parsear el output del script de descubrimiento
 * @param {string} output - Salida del comando SSM
 * @param {boolean} isWindows - Si es Windows
 * @returns {object} - Datos parseados
 */
function parseDiscoveryOutput(output, isWindows) {
  const result = {
    sids: [],
    hana: { found: false, globalIni: null, config: {} },
    profile: { found: false, path: null, config: {} },
    hdbuserstore: { found: false, entries: [] },
    ports: [],
    network: { hostname: '', ip: '' },
    services: [],
    processes: [],
    // Campos derivados para auto-llenar el formulario
    suggested: {
      dbHost: '',
      dbPort: '',
      dbUser: 'SYSTEM',
      sapClient: '001',
      sapUser: 'SAP_MONITOR'
    }
  };

  if (!output.includes('===SAP_DISCOVERY_START===')) {
    result.error = 'No se recibió output válido del script de descubrimiento';
    return result;
  }

  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  let currentSection = '';

  for (const line of lines) {
    // Detectar secciones
    if (line.startsWith('---') && line.endsWith('---')) {
      currentSection = line.replace(/---/g, '').trim();
      continue;
    }
    if (line.startsWith('===')) continue;

    // Parsear según sección
    switch (currentSection) {
      case 'SIDS':
        if (line.startsWith('SID:')) {
          result.sids.push(line.substring(4));
        }
        break;

      case 'HANA':
        if (line.startsWith('HDBSQL:')) {
          result.hana.found = true;
        }
        if (line.startsWith('GLOBAL_INI:')) {
          result.hana.globalIni = line.substring(11);
          result.hana.found = true;
        }
        if (line.includes('=')) {
          const [key, ...valParts] = line.split('=');
          const val = valParts.join('=').trim();
          if (key.trim()) result.hana.config[key.trim()] = val;
        }
        break;

      case 'PROFILE':
        if (line.startsWith('DEFAULT_PFL:')) {
          result.profile.found = true;
          result.profile.path = line.substring(12);
        }
        if (line.includes('=') && !line.startsWith('DEFAULT_PFL:')) {
          const [key, ...valParts] = line.split('=');
          const val = valParts.join('=').trim();
          if (key.trim()) result.profile.config[key.trim()] = val;
        }
        break;

      case 'HDBUSERSTORE':
        if (line.startsWith('HDBSTORE:')) {
          result.hdbuserstore.found = true;
        }
        if (line.startsWith('HDBUSERSTORE_LIST:')) {
          result.hdbuserstore.found = true;
        }
        // Parsear entradas de hdbuserstore (formato: KEY <name> ENV: host:port USER: user)
        if (line.startsWith('KEY') && line.includes('ENV')) {
          const envMatch = line.match(/ENV\s*:\s*([^;]+)/i);
          const userMatch = line.match(/USER\s*:\s*(\S+)/i);
          if (envMatch) {
            result.hdbuserstore.entries.push({
              env: envMatch[1].trim(),
              user: userMatch ? userMatch[1].trim() : ''
            });
          }
        }
        // Formato multi-línea de hdbuserstore list
        if (line.match(/^\s*ENV\s*:/i)) {
          const env = line.replace(/^\s*ENV\s*:\s*/i, '').trim();
          if (env) {
            const existing = result.hdbuserstore.entries[result.hdbuserstore.entries.length - 1];
            if (existing && !existing.env) existing.env = env;
            else result.hdbuserstore.entries.push({ env, user: '' });
          }
        }
        if (line.match(/^\s*USER\s*:/i)) {
          const user = line.replace(/^\s*USER\s*:\s*/i, '').trim();
          const existing = result.hdbuserstore.entries[result.hdbuserstore.entries.length - 1];
          if (existing) existing.user = user;
        }
        break;

      case 'PORTS':
        // Extraer puertos HANA (30000-39999)
        const portMatch = line.match(/:?(\d{5})/);
        if (portMatch) {
          const port = parseInt(portMatch[1]);
          if (port >= 30000 && port <= 39999 && !result.ports.includes(port)) {
            result.ports.push(port);
          }
        }
        if (line.startsWith('PORT:')) {
          const port = parseInt(line.substring(5));
          if (port && !result.ports.includes(port)) result.ports.push(port);
        }
        break;

      case 'NETWORK':
        if (line.startsWith('HOSTNAME:')) result.network.hostname = line.substring(9);
        if (line.startsWith('IP:')) result.network.ip = line.substring(3).trim();
        break;

      case 'SERVICES':
        if (line.startsWith('SERVICE:')) {
          const [name, status] = line.substring(8).split('|');
          result.services.push({ name, status: status || 'Unknown' });
        }
        break;

      case 'PROCESSES':
        if (line) result.processes.push(line);
        break;
    }
  }

  // ── Derivar sugerencias para auto-llenar formulario ──

  // 0. Extraer SID y tipo de DB de servicios Windows
  //    Patrones: "SAP DBTech-{SID}" → MaxDB, "SAP{SID}_{NN}" → instancia SAP,
  //              "HDB{SID}" o "SAPHDB{NN}" → HANA
  if (result.services.length > 0) {
    for (const svc of result.services) {
      const name = svc.name || '';

      // SAP DBTech-{SID} → MaxDB / SAP ASE
      const dbTechMatch = name.match(/^SAP DBTech-(\w{3})$/i);
      if (dbTechMatch) {
        const sid = dbTechMatch[1].toUpperCase();
        if (!result.sids.includes(sid)) result.sids.push(sid);
        if (!result.suggested.dbType) result.suggested.dbType = 'MAXDB';
      }

      // SAP{SID}_{NN} → Instancia SAP (ej: SAPOMP_00, SAPOMP_0)
      const sapInstMatch = name.match(/^SAP(\w{3})_\d+$/i);
      if (sapInstMatch) {
        const sid = sapInstMatch[1].toUpperCase();
        if (!result.sids.includes(sid)) result.sids.push(sid);
      }

      // SAPDAA_{NN} → Data Archiving Agent (contiene instancia num)
      // SAPHostControl, SAPHostExec → Host Agent (no tiene SID)

      // HDB{SID} o servicios con HDB → HANA
      const hdbMatch = name.match(/^HDB(\w{3})/i);
      if (hdbMatch) {
        result.hana.found = true;
        const sid = hdbMatch[1].toUpperCase();
        if (!result.sids.includes(sid)) result.sids.push(sid);
        result.suggested.dbType = 'HANA';
      }

      // Servicios con "HANA" en el nombre
      if (name.toLowerCase().includes('hana')) {
        result.hana.found = true;
        if (!result.suggested.dbType) result.suggested.dbType = 'HANA';
      }
    }
  }

  // Host: preferir IP del profile SAP, luego IP de la red, luego hostname
  const sapDbHost = result.profile.config['SAPDBHOST'] || result.profile.config['SAPGLOBALHOST'];
  if (sapDbHost) {
    result.suggested.dbHost = sapDbHost;
  } else if (result.network.ip) {
    result.suggested.dbHost = result.network.ip;
  } else if (result.network.hostname) {
    result.suggested.dbHost = result.network.hostname;
  }

  // Puerto: preferir puerto SQL de HANA (30015 para tenant, 30013 para system)
  if (result.ports.length > 0) {
    // Preferir 30015 (SQL tenant) > 30013 (SQL system) > primer puerto encontrado
    const preferred = [30015, 30013];
    const bestPort = preferred.find(p => result.ports.includes(p)) || result.ports[0];
    result.suggested.dbPort = bestPort.toString();
  } else if (result.hana.found) {
    // Si HANA encontrado pero no detectamos puertos, usar default
    result.suggested.dbPort = '30015';
  } else if (result.suggested.dbType === 'MAXDB') {
    // Puerto default MaxDB
    result.suggested.dbPort = '7210';
  }

  // Puerto del listenport en global.ini
  if (result.hana.config.listenport) {
    result.suggested.dbPort = result.hana.config.listenport;
  }

  // Si tiene hdbuserstore entries, usar el primer host:port
  if (result.hdbuserstore.entries.length > 0) {
    const firstEntry = result.hdbuserstore.entries[0];
    if (firstEntry.env) {
      // Formato: hostname:30015 o hostname:30015,hostname2:30015
      const parts = firstEntry.env.split(',')[0].split(':');
      if (parts.length === 2) {
        result.suggested.dbHost = parts[0];
        result.suggested.dbPort = parts[1];
      }
    }
    if (firstEntry.user) {
      result.suggested.dbUser = firstEntry.user;
    }
  }

  // SID del perfil SAP
  if (result.profile.config['SAPSYSTEMNAME']) {
    result.suggested.sid = result.profile.config['SAPSYSTEMNAME'];
  } else if (result.sids.length > 0) {
    // Filtrar SIDs genéricos (DAA = Data Archiving Agent)
    const realSids = result.sids.filter(s => !['DAA', 'HOS', 'CTR'].includes(s));
    if (realSids.length > 0) {
      result.suggested.sid = realSids[0];
    } else if (result.sids.length > 0) {
      result.suggested.sid = result.sids[0];
    }
  }

  // Schema de HANA
  if (result.profile.config['dbs/hdb/schema']) {
    result.suggested.dbSchema = result.profile.config['dbs/hdb/schema'];
  }

  // DB Name
  if (result.profile.config['dbs/hdb/dbname']) {
    result.suggested.dbName = result.profile.config['dbs/hdb/dbname'];
  }

  // Determinar tipo de DB (si no se detectó por servicios)
  if (!result.suggested.dbType) {
    if (result.hana.found || result.ports.some(p => p >= 30000 && p <= 39999)) {
      result.suggested.dbType = 'HANA';
    }
  }

  // OS Type sugerido
  result.suggested.osType = isWindows ? 'windows' : 'linux';

  return result;
}

/**
 * Listar instancias SSM disponibles y con agente online
 * @param {string} region - Región AWS
 * @returns {Array} - Lista de instancias con SSM activo
 */
async function listSsmInstances(region) {
  const clients = createClients(region);
  const { DescribeInstanceInformationCommand } = require('@aws-sdk/client-ssm');

  const ssmResult = await clients.ssm.send(new DescribeInstanceInformationCommand({ MaxResults: 50 }));
  return (ssmResult.InstanceInformationList || []).map(i => ({
    instanceId: i.InstanceId,
    name: i.Name || i.ComputerName || i.InstanceId,
    platform: i.PlatformType,
    platformName: i.PlatformName,
    platformVersion: i.PlatformVersion,
    ipAddress: i.IPAddress,
    computerName: i.ComputerName,
    pingStatus: i.PingStatus,
    agentVersion: i.AgentVersion,
    isOnline: i.PingStatus === 'Online'
  }));
}

/**
 * Descubrimiento profundo via Lambda discovery-engine.
 * Invoca el Lambda desplegado para obtener clasificacion completa
 * (roles ASCS/ERS/PAS/AAS, kernel, HA, HSR, landscape).
 * @param {string} region - Region AWS
 * @param {string[]} instanceIds - IDs de instancias EC2
 * @returns {Object} - Resultado del discovery-engine
 */
async function discoverSapConfigDeep(region, instanceIds) {
  const clients = createClients(region);
  const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

  const lambdaClient = new LambdaClient({ region });
  const functionName = 'sap-alwaysops-discovery-engine';

  try {
    const result = await lambdaClient.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ instanceIds }),
    }));

    const responsePayload = JSON.parse(Buffer.from(result.Payload).toString());
    if (responsePayload.statusCode === 200) {
      const body = typeof responsePayload.body === 'string'
        ? JSON.parse(responsePayload.body)
        : responsePayload.body;
      return { success: true, ...body };
    }

    return { success: false, error: responsePayload.body || 'Error en discovery-engine' };
  } catch (err) {
    // Si el Lambda no esta desplegado, hacer fallback al discovery basico
    if (err.name === 'ResourceNotFoundException') {
      console.warn('[SAP Discovery] Lambda discovery-engine no encontrada, usando discovery basico');
      const results = [];
      for (const instanceId of instanceIds) {
        const basic = await discoverSapConfig(region, instanceId, 'Linux');
        results.push({ instanceId, ...basic });
      }
      return { success: true, instances: results, fallback: true };
    }
    throw err;
  }
}

module.exports = { discoverSapConfig, discoverSapConfigDeep, listSsmInstances, parseDiscoveryOutput };
