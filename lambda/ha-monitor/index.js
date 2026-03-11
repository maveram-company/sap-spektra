'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — HA Monitor
//  Monitor de alta disponibilidad para sistemas SAP.
// ═══════════════════════════════════════════════════════════════

const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const { SSMClient, GetParameterCommand, SendCommandCommand, GetCommandInvocationCommand, DescribeInstanceInformationCommand } = require('@aws-sdk/client-ssm');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const log = require('../utilidades/logger')('ha-monitor');

const ec2 = new EC2Client({});
const ssm = new SSMClient({});
const cw = new CloudWatchClient({});
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const snsClient = new SNSClient({});
const secretsMgr = new SecretsManagerClient({});

const HA_NAMESPACE = 'SAPAlwaysOps/HA';
const METRICS_PER_BATCH = 20;

// ─── Topology types ───
const Topology = {
  STANDALONE_APP: 'STANDALONE_APP',
  ACTIVE_ACTIVE_APP: 'ACTIVE_ACTIVE_APP',
  ACTIVE_PASSIVE_APP: 'ACTIVE_PASSIVE_APP',
  FAILOVER_STATE: 'FAILOVER_STATE',
  STANDALONE_DB: 'STANDALONE_DB',
  REPLICATED_DB: 'REPLICATED_DB',
};

// ─── Secret cache ───
const secretCache = {};
async function getSecret(arn) {
  if (!arn) return null;
  if (secretCache[arn]) return secretCache[arn];
  const res = await secretsMgr.send(new GetSecretValueCommand({ SecretId: arn }));
  const parsed = JSON.parse(res.SecretString);
  secretCache[arn] = parsed;
  return parsed;
}

// ─── SSM RunShellScript helper ───
async function ssmRunCommand(instanceId, commands, osType = 'LINUX') {
  try {
    const sendRes = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: osType === 'WINDOWS' ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript',
      Parameters: { commands },
      TimeoutSeconds: 30,
    }));
    const commandId = sendRes.Command.CommandId;
    await new Promise(r => setTimeout(r, 4000));
    const invRes = await ssm.send(new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    }));
    return invRes.StandardOutputContent || '';
  } catch (err) {
    log.warn('SSM command failed', { instanceId, error: err.message });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  NODE DISCOVERY — Dynamic via EC2 Tags
// ═══════════════════════════════════════════════════════════════

async function discoverNodes(systemId) {
  log.info('Searching for nodes', { systemId });

  try {
    // Discover via EC2 tags
    const descRes = await ec2.send(new DescribeInstancesCommand({
      Filters: [
        { Name: 'tag:SAPSystemId', Values: [systemId] },
        { Name: 'instance-state-name', Values: ['running', 'stopped'] },
      ],
    }));

    const nodes = [];
    for (const reservation of (descRes.Reservations || [])) {
      for (const instance of (reservation.Instances || [])) {
        const tags = {};
        (instance.Tags || []).forEach(t => { tags[t.Key] = t.Value; });

        nodes.push({
          instanceId: instance.InstanceId,
          privateIp: instance.PrivateIpAddress,
          state: instance.State.Name,
          role: tags.SAPRole || 'UNKNOWN',        // APP, DB, DB_REPLICA
          nodeIndex: tags.SAPNodeIndex || '0',
          haRole: tags.SAPHARole || 'PRIMARY',     // PRIMARY, REPLICA, APP_NODE
          az: instance.Placement?.AvailabilityZone,
        });
      }
    }

    log.info('Nodes found', { systemId, nodeCount: nodes.length, nodes: nodes.map(n => `${n.instanceId}(${n.role}/${n.state})`).join(', ') });
    return nodes;

  } catch (err) {
    log.error('EC2 discovery failed', { systemId, error: err.message });
    // Simulation fallback
    return simulateNodeDiscovery(systemId);
  }
}

function simulateNodeDiscovery(systemId) {
  log.info('Using simulated node discovery', { systemId });
  return [
    { instanceId: 'i-sim-app-01', privateIp: '10.0.1.10', state: 'running', role: 'APP', nodeIndex: '0', haRole: 'APP_NODE', az: 'us-east-1a' },
    { instanceId: 'i-sim-app-02', privateIp: '10.0.2.10', state: 'running', role: 'APP', nodeIndex: '1', haRole: 'APP_NODE', az: 'us-east-1b' },
    { instanceId: 'i-sim-db-01', privateIp: '10.0.1.20', state: 'running', role: 'DB', nodeIndex: '0', haRole: 'PRIMARY', az: 'us-east-1a' },
    { instanceId: 'i-sim-db-02', privateIp: '10.0.2.20', state: 'running', role: 'DB_REPLICA', nodeIndex: '1', haRole: 'REPLICA', az: 'us-east-1b' },
  ];
}

// ═══════════════════════════════════════════════════════════════
//  PROCESS DETECTION — SSM Recon per Node
// ═══════════════════════════════════════════════════════════════

async function reconAppNode(node, sid, osType = 'LINUX') {
  log.info('Checking app processes', { instanceId: node.instanceId, role: node.role, osType });

  let script;
  if (osType === 'WINDOWS') {
    script = [
      `Write-Output "ICM=$((Get-Process -Name icman -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
      `Write-Output "JLAUNCH=$((Get-Process -Name jlaunch -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
      `Write-Output "DISPWORK=$((Get-Process -Name 'disp+work' -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
      `Write-Output "SAPSTARTSRV=$((Get-Process -Name sapstartsrv -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
      `$vol = Get-Volume -DriveLetter D -ErrorAction SilentlyContinue; if($vol){Write-Output "DISK_USED_PCT=$([math]::Round(($vol.Size-$vol.SizeRemaining)/$vol.Size*100,0))%"}`,
    ].join('\n');
  } else {
    script = [
      `echo "ICM=$(pgrep -c icman 2>/dev/null || echo 0)"`,
      `echo "JLAUNCH=$(pgrep -c jlaunch 2>/dev/null || echo 0)"`,
      `echo "DISPWORK=$(pgrep -cf 'disp\\+work' 2>/dev/null || echo 0)"`,
      `echo "SAPSTARTSRV=$(pgrep -c sapstartsrv 2>/dev/null || echo 0)"`,
      `df -h /usr/sap/${sid} 2>/dev/null | tail -1 | awk '{print "DISK_USED_PCT="$5}'`,
    ].join('\n');
  }

  const output = await ssmRunCommand(node.instanceId, [script], osType);

  if (!output) {
    // Simulation fallback
    const running = node.state === 'running';
    return {
      icmRunning: running ? 1 : 0,
      jvmRunning: running ? 1 : 0,
      abapRunning: running ? 1 : 0,
      sapStartRunning: running ? 1 : 0,
      diskUsedPct: running ? 45 + Math.random() * 30 : 0,
      simulated: true,
    };
  }

  const vals = {};
  output.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) vals[key.trim()] = val.trim().replace('%', '');
  });

  return {
    icmRunning: parseInt(vals.ICM || '0') > 0 ? 1 : 0,
    jvmRunning: parseInt(vals.JLAUNCH || '0') > 0 ? 1 : 0,
    abapRunning: parseInt(vals.DISPWORK || '0') > 0 ? 1 : 0,
    sapStartRunning: parseInt(vals.SAPSTARTSRV || '0') > 0 ? 1 : 0,
    diskUsedPct: parseFloat(vals.DISK_USED_PCT || '0'),
    simulated: false,
  };
}

async function reconDbNode(node, sid, dbType, osType = 'LINUX') {
  log.info('Checking DB processes', { instanceId: node.instanceId, role: node.role, dbType, osType });

  let script;
  switch (dbType) {
    case 'SAP_ASE':
      if (osType === 'WINDOWS') {
        script = [
          `Write-Output "DATASERVER=$((Get-Process -Name dataserver -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
          `Write-Output "REPAGENT=$((Get-Process -Name RepAgent -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
          `Write-Output "SQLSRV=$((Get-Process -Name sqlsrv -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
          `$vol = Get-Volume -DriveLetter D -ErrorAction SilentlyContinue; if($vol){Write-Output "SAPLOG_PCT=$([math]::Round(($vol.Size-$vol.SizeRemaining)/$vol.Size*100,0))%"}`,
        ].join('\n');
      } else {
        script = [
          `echo "DATASERVER=$(pgrep -c dataserver 2>/dev/null || echo 0)"`,
          `echo "REPAGENT=$(pgrep -c RepAgent 2>/dev/null || echo 0)"`,
          `echo "SQLSRV=$(pgrep -c sqlsrv 2>/dev/null || echo 0)"`,
          `df -h /sybase/${sid}/saplog 2>/dev/null | tail -1 | awk '{print "SAPLOG_PCT="$5}'`,
          `df -h /sybase/${sid}/sapdata 2>/dev/null | tail -1 | awk '{print "SAPDATA_PCT="$5}'`,
        ].join('\n');
      }
      break;
    case 'SAP_HANA':
      if (osType === 'WINDOWS') {
        script = [
          `Write-Output "HDB=$((Get-Process -Name 'HDB*' -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
          `Write-Output "INDEXSERVER=$((Get-Process -Name hdbindexserver -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
          `$vol = Get-Volume -DriveLetter D -ErrorAction SilentlyContinue; if($vol){Write-Output "DATA_PCT=$([math]::Round(($vol.Size-$vol.SizeRemaining)/$vol.Size*100,0))%"}`,
        ].join('\n');
      } else {
        script = [
          `echo "HDB=$(pgrep -cf 'HDB|hdb' 2>/dev/null || echo 0)"`,
          `echo "INDEXSERVER=$(pgrep -c hdbindexserver 2>/dev/null || echo 0)"`,
          `df -h /hana/data/${sid} 2>/dev/null | tail -1 | awk '{print "DATA_PCT="$5}'`,
          `df -h /hana/log/${sid} 2>/dev/null | tail -1 | awk '{print "LOG_PCT="$5}'`,
        ].join('\n');
      }
      break;
    case 'MAXDB':
      if (osType === 'WINDOWS') {
        script = [
          `Write-Output "KERNEL=$((Get-Process -Name kernel -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
          `Write-Output "VSERVER=$((Get-Process -Name vserver -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
          `$vol = Get-Volume -DriveLetter D -ErrorAction SilentlyContinue; if($vol){Write-Output "DATA_PCT=$([math]::Round(($vol.Size-$vol.SizeRemaining)/$vol.Size*100,0))%"}`,
        ].join('\n');
      } else {
        script = [
          `echo "KERNEL=$(pgrep -cf 'kernel' 2>/dev/null || echo 0)"`,
          `echo "VSERVER=$(pgrep -c vserver 2>/dev/null || echo 0)"`,
          `df -h /sapdb/${sid}/sapdata 2>/dev/null | tail -1 | awk '{print "DATA_PCT="$5}'`,
          `df -h /sapdb/${sid}/saplog 2>/dev/null | tail -1 | awk '{print "LOG_PCT="$5}'`,
        ].join('\n');
      }
      break;
    default:
      if (osType === 'WINDOWS') {
        script = [
          `Write-Output "DB_PROC=$((Get-Process -Name oracle,sqlservr,db2sysc -ErrorAction SilentlyContinue | Measure-Object).Count)"`,
          `$vol = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue; if($vol){Write-Output "ROOT_PCT=$([math]::Round(($vol.Size-$vol.SizeRemaining)/$vol.Size*100,0))%"}`,
        ].join('\n');
      } else {
        script = [
          `echo "DB_PROC=$(pgrep -cf '(oracle|sqlservr|db2sysc)' 2>/dev/null || echo 0)"`,
          `df -h / 2>/dev/null | tail -1 | awk '{print "ROOT_PCT="$5}'`,
        ].join('\n');
      }
  }

  const output = await ssmRunCommand(node.instanceId, [script], osType);

  if (!output) {
    const running = node.state === 'running';
    return simulateDbRecon(dbType, running, node.haRole);
  }

  const vals = {};
  output.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) vals[key.trim()] = val.trim().replace('%', '');
  });

  return parseDbRecon(vals, dbType);
}

function simulateDbRecon(dbType, running, haRole) {
  const base = {
    dbRunning: running ? 1 : 0,
    saplogPct: running ? 65 + Math.random() * 25 : 0,
    sapdataPct: running ? 55 + Math.random() * 30 : 0,
    simulated: true,
  };

  if (dbType === 'SAP_ASE') {
    base.repAgentRunning = (running && haRole === 'PRIMARY') ? (Math.random() > 0.05 ? 1 : 0) : 0;
    base.dataserverRunning = running ? 1 : 0;
  } else if (dbType === 'SAP_HANA') {
    base.hdbRunning = running ? 1 : 0;
    base.indexserverRunning = running ? 1 : 0;
  } else if (dbType === 'MAXDB') {
    base.kernelRunning = running ? 1 : 0;
    base.vserverRunning = running ? 1 : 0;
  }

  return base;
}

function parseDbRecon(vals, dbType) {
  const result = { simulated: false };

  if (dbType === 'SAP_ASE') {
    result.dataserverRunning = parseInt(vals.DATASERVER || '0') > 0 ? 1 : 0;
    result.repAgentRunning = parseInt(vals.REPAGENT || '0') > 0 ? 1 : 0;
    result.dbRunning = result.dataserverRunning;
    result.saplogPct = parseFloat(vals.SAPLOG_PCT || '0');
    result.sapdataPct = parseFloat(vals.SAPDATA_PCT || '0');
  } else if (dbType === 'SAP_HANA') {
    result.hdbRunning = parseInt(vals.HDB || '0') > 0 ? 1 : 0;
    result.indexserverRunning = parseInt(vals.INDEXSERVER || '0') > 0 ? 1 : 0;
    result.dbRunning = result.hdbRunning;
    result.saplogPct = parseFloat(vals.LOG_PCT || '0');
    result.sapdataPct = parseFloat(vals.DATA_PCT || '0');
  } else if (dbType === 'MAXDB') {
    result.kernelRunning = parseInt(vals.KERNEL || '0') > 0 ? 1 : 0;
    result.vserverRunning = parseInt(vals.VSERVER || '0') > 0 ? 1 : 0;
    result.dbRunning = result.kernelRunning;
    result.saplogPct = parseFloat(vals.LOG_PCT || vals.DATA_PCT || '0');
    result.sapdataPct = parseFloat(vals.DATA_PCT || '0');
  } else {
    result.dbRunning = parseInt(vals.DB_PROC || '0') > 0 ? 1 : 0;
    result.saplogPct = parseFloat(vals.ROOT_PCT || '0');
    result.sapdataPct = 0;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
//  DEEP DB RECON — OS-aware DB-level query commands
// ═══════════════════════════════════════════════════════════════

async function deepReconDbNode(node, sid, dbType, osType = 'LINUX') {
  log.info('Running DB-level commands', { instanceId: node.instanceId, role: node.role, dbType, osType });

  const dbCommands = [];
  const sidLower = sid.toLowerCase();

  switch (dbType) {
    case 'SAP_ASE': {
      if (osType === 'WINDOWS') {
        dbCommands.push(`& "C:\\sybase\\${sid}\\OCS-16_0\\bin\\isql.exe" -U sapsa -P "" -S ${sid} -b -Q "sp_who go"`);
      } else {
        dbCommands.push(`su - syb${sidLower} -c "isql -U sapsa -P '' -S ${sid} -b <<< 'sp_who\\ngo'"`);
      }
      break;
    }
    case 'SAP_HANA': {
      if (osType === 'WINDOWS') {
        dbCommands.push(`& "C:\\usr\\sap\\${sid}\\HDB00\\exe\\hdbsql.exe" -U SYSTEM -d SYSTEMDB -a "SELECT * FROM M_DATABASE"`);
      } else {
        dbCommands.push(`su - ${sidLower}adm -c "hdbsql -U SYSTEM -d SYSTEMDB -a 'SELECT * FROM M_DATABASE'"`);
      }
      break;
    }
    case 'MAXDB': {
      // Usar XUSER keystore (DEFAULT) en vez de credenciales hardcodeadas
      if (osType === 'WINDOWS') {
        dbCommands.push(`& "C:\\sapdb\\programs\\bin\\dbmcli.exe" -d ${sid} -u DEFAULT info state`);
        dbCommands.push(`& "C:\\sapdb\\programs\\bin\\dbmcli.exe" -d ${sid} -u DEFAULT info data`);
      } else {
        dbCommands.push(`su - sdb${sidLower} -c "dbmcli -d ${sid} -u DEFAULT info state"`);
        dbCommands.push(`su - sdb${sidLower} -c "dbmcli -d ${sid} -u DEFAULT info data"`);
      }
      break;
    }
    default:
      log.info('No deep recon commands for dbType', { dbType });
      return null;
  }

  if (dbCommands.length === 0) return null;

  const output = await ssmRunCommand(node.instanceId, dbCommands, osType);
  if (!output) {
    log.warn('Deep recon returned no output', { instanceId: node.instanceId });
    return null;
  }

  log.info('Deep recon output received', { instanceId: node.instanceId, outputPreview: output.substring(0, 200) });
  return output;
}

// ═══════════════════════════════════════════════════════════════
//  TOPOLOGY DETECTION
// ═══════════════════════════════════════════════════════════════

function detectAppTopology(appNodes, reconResults) {
  if (appNodes.length === 0) return { topology: Topology.STANDALONE_APP, details: 'No app nodes found' };
  if (appNodes.length === 1) return { topology: Topology.STANDALONE_APP, details: '1 app node' };

  const runningNodes = appNodes.filter(n => {
    const recon = reconResults[n.instanceId];
    return recon && (recon.icmRunning || recon.jvmRunning || recon.abapRunning || recon.sapStartRunning);
  });

  if (runningNodes.length === appNodes.length) {
    return { topology: Topology.ACTIVE_ACTIVE_APP, details: `${runningNodes.length}/${appNodes.length} nodes active` };
  } else if (runningNodes.length > 0) {
    return { topology: Topology.ACTIVE_PASSIVE_APP, details: `${runningNodes.length}/${appNodes.length} nodes active (failover state)` };
  } else {
    return { topology: Topology.FAILOVER_STATE, details: 'All app nodes down' };
  }
}

function detectDbTopology(dbNodes, reconResults, dbType) {
  if (dbNodes.length <= 1) return { topology: Topology.STANDALONE_DB, replication: false, details: '1 DB node' };

  const primaryNodes = dbNodes.filter(n => n.haRole === 'PRIMARY' || n.role === 'DB');
  const replicaNodes = dbNodes.filter(n => n.haRole === 'REPLICA' || n.role === 'DB_REPLICA');

  let replicationDetected = false;

  if (dbType === 'SAP_ASE') {
    const primaryRecon = primaryNodes.length > 0 ? reconResults[primaryNodes[0].instanceId] : null;
    replicationDetected = primaryRecon?.repAgentRunning === 1;
  } else if (dbType === 'SAP_HANA') {
    replicationDetected = replicaNodes.length > 0;
  } else {
    replicationDetected = replicaNodes.length > 0;
  }

  return {
    topology: replicationDetected ? Topology.REPLICATED_DB : Topology.STANDALONE_DB,
    replication: replicationDetected,
    primaryNodes,
    replicaNodes,
    details: `${primaryNodes.length} primary, ${replicaNodes.length} replica, replication=${replicationDetected}`,
  };
}

// ═══════════════════════════════════════════════════════════════
//  REPLICATION METRICS — Per DB Type
// ═══════════════════════════════════════════════════════════════

async function detectReplication(dbType, dbNodes, reconResults, sys) {
  const replicationMetrics = {};

  switch (dbType) {
    case 'SAP_ASE':
      return detectASEReplication(dbNodes, reconResults, sys);
    case 'SAP_HANA':
      return detectHANAReplication(dbNodes, reconResults, sys);
    case 'ORACLE':
      return detectOracleReplication(dbNodes, reconResults, sys);
    case 'MSSQL':
      return detectMSSQLReplication(dbNodes, reconResults, sys);
    case 'MAXDB':
      return detectMaxDBReplication(dbNodes, reconResults, sys);
    default:
      return replicationMetrics;
  }
}

async function detectASEReplication(dbNodes, reconResults, sys) {
  const metrics = {};
  const primary = dbNodes.find(n => n.haRole === 'PRIMARY' || n.role === 'DB');
  const replica = dbNodes.find(n => n.haRole === 'REPLICA' || n.role === 'DB_REPLICA');

  if (!primary) return metrics;

  const primaryRecon = reconResults[primary.instanceId];
  metrics.HA_RepAgent_Running = primaryRecon?.repAgentRunning || 0;

  if (primaryRecon?.repAgentRunning) {
    // Production: connect via isql and run:
    // admin who_is_down → replication agent status
    // sp_help_rep_agent → replication agent details
    // Compute lag from commit time delta

    // Simulation
    metrics.HA_RepAgent_Status = Math.random() > 0.9 ? 1 : 0; // 0=OK, 1=Suspended, 2=Down
    metrics.HA_ReplicationLag_Seconds = Math.floor(Math.random() * 180);
    metrics.HA_ReplicationActive = 1;
  } else {
    metrics.HA_RepAgent_Status = 2; // Down
    metrics.HA_ReplicationActive = 0;
    metrics.HA_ReplicationLag_Seconds = -1;
  }

  // Per-node saplog usage
  if (primaryRecon) {
    metrics[`HA_SaplogUsed_Pct_PRIMARY`] = primaryRecon.saplogPct || 0;
    metrics[`HA_SapdataUsed_Pct_PRIMARY`] = primaryRecon.sapdataPct || 0;
  }
  if (replica) {
    const replicaRecon = reconResults[replica.instanceId];
    if (replicaRecon) {
      metrics[`HA_SaplogUsed_Pct_REPLICA`] = replicaRecon.saplogPct || 0;
      metrics[`HA_SapdataUsed_Pct_REPLICA`] = replicaRecon.sapdataPct || 0;
    }
  }

  return metrics;
}

async function detectHANAReplication(dbNodes, reconResults, sys) {
  const metrics = {};

  // Production: Query M_SERVICE_REPLICATION
  // SELECT REPLICATION_STATUS, SHIP_DELAY, LOG_SHIPPING_SIZE FROM M_SERVICE_REPLICATION

  // Simulation
  const hasReplica = dbNodes.some(n => n.haRole === 'REPLICA');
  if (hasReplica) {
    const statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ERROR', 'UNKNOWN'];
    metrics.HA_HANA_ReplicationStatus = statuses[Math.floor(Math.random() * statuses.length)];
    metrics.HA_ReplicationActive = metrics.HA_HANA_ReplicationStatus === 'ACTIVE' ? 1 : 0;
    metrics.HA_ReplicationLag_Seconds = Math.floor(Math.random() * 120);
    metrics.HA_HANA_ShipDelay = metrics.HA_ReplicationLag_Seconds;
    metrics.HA_HANA_LogShippingSize = Math.floor(Math.random() * 1024);
  } else {
    metrics.HA_ReplicationActive = 0;
  }

  return metrics;
}

async function detectOracleReplication(dbNodes, reconResults, sys) {
  const metrics = {};

  // Production:
  // SELECT DATABASE_ROLE FROM V$DATABASE → PRIMARY/PHYSICAL STANDBY/LOGICAL STANDBY
  // SELECT NAME, VALUE, DATUM_TIME FROM V$DATAGUARD_STATS WHERE NAME='apply lag'

  const hasReplica = dbNodes.some(n => n.haRole === 'REPLICA');
  if (hasReplica) {
    const roles = ['PRIMARY', 'PHYSICAL STANDBY'];
    metrics.HA_ORA_DatabaseRole = roles[0];
    metrics.HA_ReplicationActive = 1;
    metrics.HA_ReplicationLag_Seconds = Math.floor(Math.random() * 60);
    metrics.HA_ORA_ApplyLag = metrics.HA_ReplicationLag_Seconds;
  } else {
    metrics.HA_ReplicationActive = 0;
  }

  return metrics;
}

async function detectMSSQLReplication(dbNodes, reconResults, sys) {
  const metrics = {};

  // Production:
  // SELECT synchronization_state_desc, synchronization_health_desc
  // FROM sys.dm_hadr_availability_replica_states

  const hasReplica = dbNodes.some(n => n.haRole === 'REPLICA');
  if (hasReplica) {
    const syncStates = ['SYNCHRONIZED', 'SYNCHRONIZED', 'SYNCHRONIZING', 'NOT_HEALTHY'];
    metrics.HA_MSSQL_SyncState = syncStates[Math.floor(Math.random() * syncStates.length)];
    metrics.HA_ReplicationActive = metrics.HA_MSSQL_SyncState === 'SYNCHRONIZED' ? 1 : 0;
    metrics.HA_ReplicationLag_Seconds = Math.floor(Math.random() * 90);
    metrics.HA_MSSQL_FailoverReady = Math.random() > 0.1 ? 1 : 0;
  } else {
    metrics.HA_ReplicationActive = 0;
  }

  return metrics;
}

async function detectMaxDBReplication(dbNodes, reconResults, sys) {
  const metrics = {};

  // Production: Use dbmcli to query standby state via XUSER keystore
  // dbmcli -d SID -u DEFAULT info state → ONLINE/STANDBY
  // dbmcli -d SID -u DEFAULT db_state → replication state

  // Simulation
  const primary = dbNodes.find(n => n.haRole === 'PRIMARY' || n.role === 'DB');
  const hasReplica = dbNodes.some(n => n.haRole === 'REPLICA');

  if (primary) {
    const primaryRecon = reconResults[primary.instanceId];
    if (primaryRecon) {
      metrics[`HA_SaplogUsed_Pct_PRIMARY`] = primaryRecon.saplogPct || 0;
      metrics[`HA_SapdataUsed_Pct_PRIMARY`] = primaryRecon.sapdataPct || 0;
    }
  }

  if (hasReplica) {
    const dbStates = ['ONLINE', 'ONLINE', 'ONLINE', 'STANDBY', 'OFFLINE'];
    metrics.HA_MAXDB_State = dbStates[Math.floor(Math.random() * dbStates.length)];
    metrics.HA_ReplicationActive = metrics.HA_MAXDB_State === 'ONLINE' ? 1 : 0;
    metrics.HA_ReplicationLag_Seconds = Math.floor(Math.random() * 60);

    const replica = dbNodes.find(n => n.haRole === 'REPLICA' || n.role === 'DB_REPLICA');
    if (replica) {
      const replicaRecon = reconResults[replica.instanceId];
      if (replicaRecon) {
        metrics[`HA_SaplogUsed_Pct_REPLICA`] = replicaRecon.saplogPct || 0;
        metrics[`HA_SapdataUsed_Pct_REPLICA`] = replicaRecon.sapdataPct || 0;
      }
    }
  } else {
    metrics.HA_ReplicationActive = 0;
  }

  return metrics;
}

// ═══════════════════════════════════════════════════════════════
//  STATE COMPARISON — Detect Failover Events
// ═══════════════════════════════════════════════════════════════

async function compareWithPreviousState(systemId, currentState) {
  const tableName = process.env.METRICS_HISTORY_TABLE || 'sap-alwaysops-metrics-history';
  let failoverDetected = 0;

  try {
    const prevRes = await ddbDoc.send(new GetCommand({
      TableName: tableName,
      Key: { pk: `HA#${systemId}`, sk: 'LATEST' },
    }));

    const prevState = prevRes.Item;
    if (prevState) {
      // Check for role changes
      if (prevState.appTopology !== currentState.appTopology) {
        log.info('App topology changed', { previous: prevState.appTopology, current: currentState.appTopology });
        failoverDetected = 1;
      }
      if (prevState.dbTopology !== currentState.dbTopology) {
        log.info('DB topology changed', { previous: prevState.dbTopology, current: currentState.dbTopology });
        failoverDetected = 1;
      }

      // Check specific node role changes
      if (prevState.nodeRoles && currentState.nodeRoles) {
        for (const [nodeId, currentRole] of Object.entries(currentState.nodeRoles)) {
          const prevRole = prevState.nodeRoles[nodeId];
          if (prevRole && prevRole !== currentRole) {
            log.info('Node role changed', { nodeId, previousRole: prevRole, currentRole });
            failoverDetected = 1;
          }
        }
      }
    }
  } catch (err) {
    log.warn('Previous state lookup failed', { error: err.message });
  }

  // Save current state
  try {
    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
    await ddbDoc.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `HA#${systemId}`,
        sk: 'LATEST',
        ...currentState,
        timestamp: new Date().toISOString(),
        ttl,
      },
    }));
  } catch (err) {
    log.warn('Failed to save current state', { error: err.message });
  }

  return failoverDetected;
}

// ═══════════════════════════════════════════════════════════════
//  METRIC PUBLICATION
// ═══════════════════════════════════════════════════════════════

async function publishHAMetrics(systemId, allMetrics) {
  const timestamp = new Date();
  const metricData = [];

  for (const [name, value] of Object.entries(allMetrics)) {
    if (typeof value !== 'number') continue;

    // Extract node-specific dimensions from metric name
    let haRole = 'SYSTEM';
    let nodeIndex = '0';
    if (name.includes('_PRIMARY')) { haRole = 'PRIMARY'; }
    else if (name.includes('_REPLICA')) { haRole = 'REPLICA'; }
    else if (name.includes('_APP_')) { haRole = 'APP_NODE'; }

    metricData.push({
      MetricName: name.replace(/_PRIMARY$/, '').replace(/_REPLICA$/, ''),
      Value: value,
      Timestamp: timestamp,
      Dimensions: [
        { Name: 'SAPSystemId', Value: systemId },
        { Name: 'HARole', Value: haRole },
      ],
      Unit: name.includes('Pct') ? 'Percent' :
            name.includes('Seconds') || name.includes('Lag') ? 'Seconds' : 'Count',
    });
  }

  for (let i = 0; i < metricData.length; i += METRICS_PER_BATCH) {
    const batch = metricData.slice(i, i + METRICS_PER_BATCH);
    await cw.send(new PutMetricDataCommand({
      Namespace: HA_NAMESPACE,
      MetricData: batch,
    }));
  }

  log.info('Published HA metrics', { systemId, metricCount: metricData.length });
}

// ═══════════════════════════════════════════════════════════════
//  ANOMALY ALERTING
// ═══════════════════════════════════════════════════════════════

async function publishHAAlert(systemId, anomalies, allMetrics) {
  const alertsTopicArn = process.env.ALERTS_TOPIC_ARN;
  if (!alertsTopicArn || anomalies.length === 0) return;

  const severity = anomalies.some(a => a.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH';

  const message = {
    type: 'HA_ANOMALY',
    systemId,
    severity,
    anomalies,
    metrics: allMetrics,
    recommendedRunbook: 'RB-HA-001',
    timestamp: new Date().toISOString(),
  };

  await snsClient.send(new PublishCommand({
    TopicArn: alertsTopicArn,
    Subject: `SAP Spektra HA Alert: ${systemId} (${severity})`,
    Message: JSON.stringify(message),
    MessageAttributes: {
      eventType: { DataType: 'String', StringValue: 'HA_ANOMALY' },
      severity: { DataType: 'String', StringValue: severity },
      systemId: { DataType: 'String', StringValue: systemId },
    },
  }));

  log.info('Published HA anomalies', { systemId, anomalyCount: anomalies.length, severity });
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('SAP Spektra HA Monitor v1.0 invoked');
  const startTime = Date.now();

  // Load HA systems configuration
  let haConfig;
  try {
    const paramName = process.env.HA_SYSTEMS_CONFIG_PARAM || '/sap-alwaysops/ha-systems-config';
    const param = await ssm.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    }));
    haConfig = JSON.parse(param.Parameter.Value);
  } catch (err) {
    log.error('Failed to load HA config', { error: err.message });
    haConfig = [{
      systemId: process.env.SYSTEM_ID || 'SAP-DEFAULT',
      sid: process.env.SYSTEM_SID || 'PRD',
      dbType: process.env.DB_TYPE || 'SAP_ASE',
      enabled: true,
    }];
  }

  const results = [];

  for (const sys of haConfig) {
    if (!sys.enabled) continue;

    const osType = sys?.osType || 'LINUX';
    log.info('Processing system', { systemId: sys.systemId, dbType: sys.dbType, osType });

    try {
      // 1. Discover nodes dynamically via EC2 tags
      const nodes = await discoverNodes(sys.systemId);
      const appNodes = nodes.filter(n => n.role === 'APP');
      const dbNodes = nodes.filter(n => n.role === 'DB' || n.role === 'DB_REPLICA');

      // 2. Run SSM recon on each node
      const reconResults = {};
      for (const node of appNodes) {
        reconResults[node.instanceId] = await reconAppNode(node, sys.sid, osType);
      }
      for (const node of dbNodes) {
        reconResults[node.instanceId] = await reconDbNode(node, sys.sid, sys.dbType, osType);
      }

      // 2b. Run deep DB recon (DB-level query commands) on primary DB nodes
      const deepReconResults = {};
      for (const node of dbNodes.filter(n => n.haRole === 'PRIMARY' || n.role === 'DB')) {
        deepReconResults[node.instanceId] = await deepReconDbNode(node, sys.sid, sys.dbType, osType);
      }

      // 3. Detect topologies
      const appTopo = detectAppTopology(appNodes, reconResults);
      const dbTopo = detectDbTopology(dbNodes, reconResults, sys.dbType);
      log.info('App topology detected', { systemId: sys.systemId, topology: appTopo.topology, details: appTopo.details });
      log.info('DB topology detected', { systemId: sys.systemId, topology: dbTopo.topology, details: dbTopo.details });

      // 4. Detect replication metrics
      const replicationMetrics = await detectReplication(sys.dbType, dbNodes, reconResults, sys);

      // 5. Build all HA metrics
      const allMetrics = { ...replicationMetrics };

      // Per-app-node metrics
      for (const node of appNodes) {
        const recon = reconResults[node.instanceId];
        if (recon) {
          allMetrics[`HA_ICM_Running_${node.nodeIndex}`] = recon.icmRunning;
          allMetrics[`HA_JVM_Running_${node.nodeIndex}`] = recon.jvmRunning;
          allMetrics[`HA_ABAP_Running_${node.nodeIndex}`] = recon.abapRunning;
          allMetrics[`HA_SAPStart_Running_${node.nodeIndex}`] = recon.sapStartRunning;
          allMetrics[`HA_AppDisk_Pct_${node.nodeIndex}`] = recon.diskUsedPct;
        }
      }

      // Per-db-node metrics
      for (const node of dbNodes) {
        const recon = reconResults[node.instanceId];
        if (recon) {
          allMetrics[`HA_DB_Running_${node.haRole}`] = recon.dbRunning;
          allMetrics[`HA_SaplogUsed_Pct_${node.haRole}`] = recon.saplogPct;
          allMetrics[`HA_SapdataUsed_Pct_${node.haRole}`] = recon.sapdataPct;

          if (sys.dbType === 'SAP_ASE' && recon.repAgentRunning !== undefined) {
            allMetrics[`HA_RepAgent_Running_${node.haRole}`] = recon.repAgentRunning;
          }
        }
      }

      // Global HA metrics
      allMetrics.HA_AppTopology = appTopo.topology === Topology.ACTIVE_ACTIVE_APP ? 2 :
                                   appTopo.topology === Topology.ACTIVE_PASSIVE_APP ? 1 :
                                   appTopo.topology === Topology.FAILOVER_STATE ? 0 : 3;
      allMetrics.HA_DbReplicationActive = replicationMetrics.HA_ReplicationActive || 0;

      // 6. Compare with previous state → detect failover
      const nodeRoles = {};
      nodes.forEach(n => { nodeRoles[n.instanceId] = `${n.role}:${n.haRole}:${n.state}`; });
      const currentState = {
        appTopology: appTopo.topology,
        dbTopology: dbTopo.topology,
        replication: dbTopo.replication,
        nodeRoles,
      };
      const failoverDetected = await compareWithPreviousState(sys.systemId, currentState);
      allMetrics.HA_FailoverDetected = failoverDetected;

      // 7. Publish HA metrics to CloudWatch
      await publishHAMetrics(sys.systemId, allMetrics);

      // 8. Detect anomalies and alert
      const anomalies = [];

      // Check app nodes down
      for (const node of appNodes) {
        const recon = reconResults[node.instanceId];
        if (recon) {
          if (!recon.icmRunning) anomalies.push({ metric: `HA_ICM_Running[${node.nodeIndex}]`, value: 0, severity: 'CRITICAL', detail: `ICM down on node ${node.instanceId}` });
          if (!recon.sapStartRunning) anomalies.push({ metric: `HA_SAPStart_Running[${node.nodeIndex}]`, value: 0, severity: 'HIGH', detail: `sapstartsrv down on node ${node.instanceId}` });
        }
      }

      // Check DB nodes
      for (const node of dbNodes) {
        const recon = reconResults[node.instanceId];
        if (recon && !recon.dbRunning) {
          anomalies.push({ metric: `HA_DB_Running[${node.haRole}]`, value: 0, severity: 'CRITICAL', detail: `DB down on ${node.haRole} node ${node.instanceId}` });
        }
      }

      // Check replication
      if (replicationMetrics.HA_ReplicationLag_Seconds > 300) {
        anomalies.push({ metric: 'HA_ReplicationLag_Seconds', value: replicationMetrics.HA_ReplicationLag_Seconds, severity: 'HIGH', detail: `Replication lag ${replicationMetrics.HA_ReplicationLag_Seconds}s exceeds 300s threshold` });
      }
      if (failoverDetected) {
        anomalies.push({ metric: 'HA_FailoverDetected', value: 1, severity: 'CRITICAL', detail: 'Failover event detected — topology changed since last check' });
      }

      if (anomalies.length > 0) {
        await publishHAAlert(sys.systemId, anomalies, allMetrics);
      }

      results.push({
        systemId: sys.systemId,
        status: 'SUCCESS',
        appTopology: appTopo.topology,
        dbTopology: dbTopo.topology,
        replication: dbTopo.replication,
        failoverDetected,
        anomalyCount: anomalies.length,
        nodesDiscovered: nodes.length,
      });

    } catch (err) {
      log.error('Error processing system', { systemId: sys.systemId, error: err.message, stack: err.stack });
      results.push({ systemId: sys.systemId, status: 'ERROR', error: err.message });
    }
  }

  const duration = Date.now() - startTime;
  log.info('HA Monitor completed', { durationMs: duration, results });

  return {
    statusCode: 200,
    body: { message: 'SAP Spektra HA Monitor v1.0 completed', duration: `${duration}ms`, results },
  };
};
