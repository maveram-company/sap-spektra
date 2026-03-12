// ── Static configuration constants ──
// Extracted from mockData.js — these are NOT mock data, they are
// domain constants / reference config used by UI pages.

// ── HA Strategy metadata (labels, RTO/RPO, visual config) ──
export const HA_STRATEGY_META = {
  HOT_STANDBY:     { label: 'Hot Standby',       rto: '2-5 min',    rpo: '~0',        color: 'success', icon: 'flame' },
  WARM_STANDBY:    { label: 'Warm Standby',       rto: '5-15 min',   rpo: '<1 min',     color: 'primary', icon: 'thermometer' },
  PILOT_LIGHT:     { label: 'Pilot Light',        rto: '30-60 min',  rpo: 'Last backup', color: 'warning', icon: 'lightbulb' },
  BACKUP_RESTORE:  { label: 'Backup & Restore',   rto: '2-4 horas',  rpo: 'Last backup', color: 'danger',  icon: 'archive' },
  CROSS_REGION_DR: { label: 'Cross-Region DR',    rto: '15-45 min',  rpo: '<5 min',     color: 'accent',  icon: 'globe' },
};

// ── Alert resolution categories ──
export const alertResolutionCategories = [
  { value: 'false_positive', label: 'Falso positivo' },
  { value: 'mitigated', label: 'Mitigada' },
  { value: 'accepted_risk', label: 'Riesgo aceptado' },
  { value: 'fixed', label: 'Corregida' },
  { value: 'workaround_applied', label: 'Workaround aplicado' },
];

// ── Dependency remediation tips (per-agent/tool) ──
export const depRemediation = {
  'SSM Agent': 'Verificar en AWS Console > Systems Manager > Fleet Manager. Si offline: 1) Verificar Security Group (puerto 443 outbound), 2) Verificar IAM Instance Profile con AmazonSSMManagedInstanceCore, 3) sudo systemctl restart amazon-ssm-agent',
  'sapcontrol': 'Verificar que el usuario <sid>adm existe y tiene permisos. Ejecutar: su - <sid>adm -c "sapcontrol -nr <inst> -function GetProcessList". Si falla: verificar que SAP está iniciado con startsap.',
  'saposcol': 'El OS Collector no está corriendo. Ejecutar como <sid>adm: saposcol -start. Para inicio automático: agregar a /usr/sap/<SID>/SYS/profile/DEFAULT.PFL: SAPOSCOL_START = true',
  'CloudWatch Agent': 'Instalar: sudo yum install -y amazon-cloudwatch-agent. Configurar: sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard. Asegurar métricas: mem_used_percent, disk_used_percent. Iniciar: sudo systemctl start amazon-cloudwatch-agent',
  'hdbsql': 'Verificar HANA client: which hdbsql. Verificar usuario monitoreo: hdbsql -U MONITORING_KEY "SELECT 1 FROM DUMMY". Si falla: CREATE USER MONITORING PASSWORD ... NO FORCE_FIRST_PASSWORD_CHANGE; GRANT MONITORING TO MONITORING;',
  'dbmcli (MaxDB)': 'Verificar MaxDB tools: which dbmcli. Verificar conexión: dbmcli -d <SID> -u CONTROL,<pwd> db_state. Si no existe: instalar MaxDB Software desde SAP Downloads.',
  'RFC Connectivity': 'Ejecutar RFC_PING desde sapcontrol o PyRFC. Si falla: 1) Verificar gateway (SMGW), 2) Verificar puerto 33<inst> abierto, 3) Verificar usuario RFC con autorización S_RFC.',
  'HSR Tools': 'Verificar como <sid>adm: which hdbnsutil && which HDBSettings.sh. Para systemReplicationStatus.py: python /usr/sap/<SID>/HDB<inst>/exe/python_support/systemReplicationStatus.py',
  'isql (ASE)': 'Verificar ASE client: which isql. Verificar conexión: isql -S<SID> -USAP_MONITOR -P*** -w200 "SELECT 1". Si falla: instalar ASE client tools desde SAP Downloads.',
  'sqlplus (Oracle)': 'Verificar Oracle client: which sqlplus. Verificar conexión: sqlplus MONITORING/***@<SID> "SELECT 1 FROM DUAL". Si falla: configurar ORACLE_HOME y TNS_ADMIN.',
  'sqlcmd (MSSQL)': 'Verificar SQL Server client: which sqlcmd. Verificar conexión: sqlcmd -S <SID> -U SAP_MONITOR -P*** -Q "SELECT 1". Si falla: instalar mssql-tools18.',
  'db2 CLI (DB2)': 'Verificar DB2 client: which db2. Verificar conexión: db2 "CONNECT TO <SID> USER SAP_MONITOR USING ***". Si falla: configurar DB2_HOME y catalogar la BD.',
  'RMAN': 'Verificar Recovery Manager: which rman. Verificar catálogo: rman target / "LIST BACKUP SUMMARY". Si falla: verificar ORACLE_HOME y permisos del usuario ora<sid>.',
};

// ── Backup runbook commands per DB type ──
export const backupRunbooks = {
  'HANA': { rb: 'RB-BACKUP-001', cmd: 'hdbsql -U BACKUP_KEY "BACKUP DATA USING FILE (\'complete_data_backup\')"' },
  'MaxDB': { rb: 'RB-BACKUP-001', cmd: 'dbmcli -d SID backup_start DATA EXTERNAL' },
  'ASE': { rb: 'RB-BACKUP-001', cmd: 'isql -SSID "dump database SID to ..."' },
  'Oracle': { rb: 'RB-BACKUP-001', cmd: 'rman target / "BACKUP DATABASE PLUS ARCHIVELOG"' },
  'MSSQL': { rb: 'RB-BACKUP-001', cmd: 'sqlcmd -Q "BACKUP DATABASE SID TO DISK=..."' },
  'DB2': { rb: 'RB-BACKUP-001', cmd: 'db2 "BACKUP DATABASE SID ONLINE TO ..."' },
};

// ── HA Operation step sequences ──

export const HANA_TAKEOVER_STEPS = [
  { id: 1, label: 'Pre-check: Validar prerequisites HA', command: 'python systemReplicationStatus.py' },
  { id: 2, label: 'Pre-check: Verificar HANA SR status = SOK', command: 'hdbnsutil -sr_state' },
  { id: 3, label: 'Pre-check: Verificar backup reciente (<24h)', command: 'hdbsql "SELECT * FROM M_BACKUP_CATALOG"' },
  { id: 4, label: 'Detener SAP application server (PAS/AAS)', command: 'sapcontrol -nr 00 -function Stop' },
  { id: 5, label: 'Detener SAP ASCS (si aplica)', command: 'sapcontrol -nr 01 -function Stop' },
  { id: 6, label: 'Ejecutar sr_takeover en nodo secundario', command: 'hdbnsutil -sr_takeover' },
  { id: 7, label: 'Mover recursos de red (VIP/EIP/Route53)', command: 'crm_attribute_default / aws ec2 associate-address' },
  { id: 8, label: 'Verificar HANA accesible en nuevo primario', command: 'hdbsql -U MONITORING "SELECT 1 FROM DUMMY"' },
  { id: 9, label: 'Iniciar SAP ASCS en nuevo nodo', command: 'sapcontrol -nr 01 -function Start' },
  { id: 10, label: 'Iniciar SAP application server (PAS)', command: 'sapcontrol -nr 00 -function Start' },
  { id: 11, label: 'Verificar work processes activos', command: 'sapcontrol -nr 00 -function GetProcessList' },
  { id: 12, label: 'Registrar antiguo primario como secundario', command: 'hdbnsutil -sr_register --name=... --remoteHost=...' },
  { id: 13, label: 'Verificar replicación activa en nuevo par', command: 'python systemReplicationStatus.py' },
  { id: 14, label: 'Validación final: SAP + HANA + Red + Replicación', command: 'sapcontrol + hdbnsutil + ping -c1 VIP' },
];

export const HANA_FAILOVER_STEPS = [
  { id: 1, label: 'Detectar falla en nodo primario', command: 'crm_mon -1 / pacemaker detect' },
  { id: 2, label: 'Pacemaker inicia failover automático', command: 'crm resource migrate rsc_SAPHana_...' },
  { id: 3, label: 'Ejecutar sr_takeover (modo emergencia)', command: 'hdbnsutil -sr_takeover --force' },
  { id: 4, label: 'Mover IP virtual al nodo superviviente', command: 'crm_attribute_default / aws ec2 ...' },
  { id: 5, label: 'Verificar HANA operativa en nuevo primario', command: 'hdbsql "SELECT 1 FROM DUMMY"' },
  { id: 6, label: 'Reiniciar SAP application server', command: 'sapcontrol -nr 00 -function StartSystem' },
  { id: 7, label: 'Verificar usuarios pueden conectar', command: 'RFC_PING + sapcontrol GetProcessList' },
  { id: 8, label: 'Generar alerta y evidence de failover', command: 'SNS publish + DynamoDB put' },
];

export const WARM_STANDBY_FAILOVER_STEPS = [
  { id: 1, label: 'Validar estado de réplica ASYNC en secundario', command: 'hdbnsutil -sr_state' },
  { id: 2, label: 'Detener HANA en nodo secundario (para resize)', command: 'sapcontrol -nr 10 -function Stop' },
  { id: 3, label: 'Escalar instancia: r6i.2xlarge → r6i.8xlarge', command: 'aws ec2 modify-instance-attribute --instance-type r6i.8xlarge' },
  { id: 4, label: 'Iniciar instancia escalada', command: 'aws ec2 start-instances + wait instance-status-ok' },
  { id: 5, label: 'Iniciar HANA en nodo escalado', command: 'sapcontrol -nr 10 -function Start' },
  { id: 6, label: 'Esperar catch-up de réplica (aplicar logs pendientes)', command: 'hdbnsutil -sr_state → wait SYNC' },
  { id: 7, label: 'Ejecutar sr_takeover en nodo escalado', command: 'hdbnsutil -sr_takeover' },
  { id: 8, label: 'Mover Elastic IP al nuevo primario', command: 'aws ec2 associate-address --instance-id ...' },
  { id: 9, label: 'Verificar HANA accesible como primario', command: 'hdbsql -U MONITORING "SELECT 1 FROM DUMMY"' },
  { id: 10, label: 'Iniciar SAP application server', command: 'sapcontrol -nr 00 -function Start' },
  { id: 11, label: 'Verificar work processes y conectividad', command: 'sapcontrol GetProcessList + RFC_PING' },
  { id: 12, label: 'Generar evidence de failover', command: 'SNS publish + evidence export' },
];

export const ASCS_FAILOVER_STEPS = [
  { id: 1, label: 'Detectar falla ASCS en nodo primario', command: 'crm_mon -1 -f' },
  { id: 2, label: 'Pacemaker mueve recurso ASCS a ERS node', command: 'crm resource migrate rsc_SAP_ASCS...' },
  { id: 3, label: 'Iniciar ASCS en nodo ERS', command: 'sapcontrol -nr 01 -function Start' },
  { id: 4, label: 'Verificar Enqueue Server activo', command: 'sapcontrol -nr 01 -function EnqGetStatistic' },
  { id: 5, label: 'Restaurar Enqueue Replication en nodo original', command: 'sapcontrol -nr 10 -function Start (ERS)' },
  { id: 6, label: 'Verificar lock table replicada', command: 'sapcontrol -function EnqGetStatistic' },
  { id: 7, label: 'Validar SAP application servers reconectan', command: 'sapcontrol GetProcessList en PAS/AAS' },
];

export const PILOT_LIGHT_ACTIVATION_STEPS = [
  { id: 1, label: 'Validar prerequisites de activación', command: 'check snapshots + AMI + networking' },
  { id: 2, label: 'Encender instancia DR (EC2 start)', command: 'aws ec2 start-instances --instance-ids i-0xyz789dr' },
  { id: 3, label: 'Esperar instancia accesible (boot + health)', command: 'aws ec2 wait instance-status-ok' },
  { id: 4, label: 'Restaurar datos desde snapshot/backup', command: 'aws ec2 attach-volume + hdbnsutil -sr_takeover' },
  { id: 5, label: 'Aplicar log replay (catch-up)', command: 'hdbsql RECOVER DATABASE UNTIL TIMESTAMP ...' },
  { id: 6, label: 'Verificar integridad de datos HANA', command: 'hdbsql "SELECT COUNT(*) FROM M_DATABASE"' },
  { id: 7, label: 'Iniciar SAP application server en DR', command: 'sapcontrol -nr 00 -function Start' },
  { id: 8, label: 'Actualizar DNS (Route53 failover)', command: 'aws route53 change-resource-record-sets' },
  { id: 9, label: 'Verificar conectividad end-to-end', command: 'sapcontrol GetProcessList + RFC_PING' },
  { id: 10, label: 'Notificar activación DR completada', command: 'SNS publish DR-ACTIVATED' },
];

export const CROSS_REGION_DR_STEPS = [
  { id: 1, label: 'Validar estado de replicación cross-region', command: 'dgmgrl show configuration' },
  { id: 2, label: 'Verificar lag de replicación dentro de RPO', command: 'SELECT * FROM V$DATAGUARD_STATS' },
  { id: 3, label: 'Detener SAP en región primaria', command: 'sapcontrol -nr 00 -function Stop' },
  { id: 4, label: 'Ejecutar switchover/failover de base de datos', command: 'dgmgrl switchover to dr_site' },
  { id: 5, label: 'Verificar BD accesible en región DR', command: 'sqlplus / as sysdba SELECT 1 FROM DUAL' },
  { id: 6, label: 'Actualizar conexión SAP a nueva BD', command: 'sapcontrol SetProfileParameter dbs/...' },
  { id: 7, label: 'Iniciar SAP en región DR', command: 'sapcontrol -nr 00 -function Start' },
  { id: 8, label: 'Actualizar DNS/Traffic Manager', command: 'az network traffic-manager endpoint update' },
  { id: 9, label: 'Verificar acceso usuarios finales', command: 'curl https://sap.empresa.com/sap/bc/ping' },
  { id: 10, label: 'Generar evidence y notificar', command: 'az monitor alert + evidence export' },
];

export const BACKUP_RESTORE_STEPS = [
  { id: 1, label: 'Validar último backup disponible', command: 'aws s3 ls s3://sap-backups/SB1/' },
  { id: 2, label: 'Deploy infraestructura desde template', command: 'aws cloudformation create-stack ...' },
  { id: 3, label: 'Esperar infraestructura lista', command: 'aws cloudformation wait stack-create-complete' },
  { id: 4, label: 'Restaurar backup completo de HANA', command: 'hdbsql RECOVER DATA ALL USING FILE ...' },
  { id: 5, label: 'Aplicar log backups (point-in-time recovery)', command: 'hdbsql RECOVER DATABASE UNTIL TIMESTAMP ...' },
  { id: 6, label: 'Verificar integridad de datos', command: 'hdbsql "SELECT * FROM M_DATABASE"' },
  { id: 7, label: 'Configurar e iniciar SAP', command: 'sapcontrol -nr 00 -function Start' },
  { id: 8, label: 'Configurar red y DNS', command: 'aws route53 change-resource-record-sets' },
  { id: 9, label: 'Verificar acceso end-to-end', command: 'RFC_PING + sapcontrol GetProcessList' },
];
