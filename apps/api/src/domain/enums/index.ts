// ── Roles & Auth ──
export enum UserRole {
  ADMIN = 'admin',
  ESCALATION = 'escalation',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.ADMIN]: 40,
  [UserRole.ESCALATION]: 30,
  [UserRole.OPERATOR]: 20,
  [UserRole.VIEWER]: 10,
};

// ── Plans ──
export enum PlanTier {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

// ── SAP Domain ──
export enum SapEnvironment {
  PRD = 'PRD',
  QAS = 'QAS',
  DEV = 'DEV',
  SBX = 'SBX',
  DR = 'DR',
}

export enum SapStackType {
  ABAP = 'ABAP',
  JAVA = 'JAVA',
  DUAL_STACK = 'DUAL_STACK',
  EDGE = 'EDGE',
  DB = 'DB',
  MANAGED_CLOUD_RESTRICTED = 'MANAGED_CLOUD_RESTRICTED',
}

export enum DeploymentModel {
  ON_PREMISE = 'ON_PREMISE',
  AWS_HOSTED = 'AWS_HOSTED',
  AZURE_HOSTED = 'AZURE_HOSTED',
  GCP_HOSTED = 'GCP_HOSTED',
  RISE_MANAGED = 'RISE_MANAGED',
  PCE_MANAGED = 'PCE_MANAGED',
}

export enum MonitoringCapabilityProfile {
  FULL_STACK_AGENT = 'FULL_STACK_AGENT',
  SAP_APP_ONLY = 'SAP_APP_ONLY',
  DB_AND_APP_ONLY = 'DB_AND_APP_ONLY',
  RISE_RESTRICTED = 'RISE_RESTRICTED',
  CONNECTOR_LIMITED = 'CONNECTOR_LIMITED',
  LEGACY_PARTIAL = 'LEGACY_PARTIAL',
}

export enum ConnectionMode {
  AGENT_FULL = 'AGENT_FULL',
  CLOUD_CONNECTOR = 'CLOUD_CONNECTOR',
  RFC_BAPI = 'RFC_BAPI',
  API_GATEWAY = 'API_GATEWAY',
  MANAGED_RESTRICTED = 'MANAGED_RESTRICTED',
}

export enum SystemStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  DEGRADED = 'degraded',
  CRITICAL = 'critical',
  UNREACHABLE = 'unreachable',
}

export enum SystemMode {
  PRODUCTION = 'PRODUCTION',
  TRIAL = 'TRIAL',
  MAINTENANCE = 'MAINTENANCE',
}

// ── Alerts ──
export enum AlertLevel {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

// ── Breach Severity ──
export enum BreachSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

// ── Approvals ──
export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  EXECUTED = 'EXECUTED',
}

// ── Operations ──
export enum OperationStatus {
  SCHEDULED = 'SCHEDULED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum OperationType {
  BACKUP = 'BACKUP',
  RESTART = 'RESTART',
  MAINTENANCE = 'MAINTENANCE',
  DR_DRILL = 'DR_DRILL',
  HOUSEKEEPING = 'HOUSEKEEPING',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// ── HA/DR ──
export enum HAStrategy {
  HOT_STANDBY = 'HOT_STANDBY',
  WARM_STANDBY = 'WARM_STANDBY',
  PILOT_LIGHT = 'PILOT_LIGHT',
  CROSS_REGION_DR = 'CROSS_REGION_DR',
  BACKUP_RESTORE = 'BACKUP_RESTORE',
}

// ── Runbook Categories ──
export enum RunbookCategory {
  SAP_HANA = 'SAP_HANA',
  ORACLE = 'ORACLE',
  MSSQL = 'MSSQL',
  IBM_DB2 = 'IBM_DB2',
  SAP_ASE = 'SAP_ASE',
  SAP_MAXDB = 'SAP_MAXDB',
  HANA_HA = 'HANA_HA',
  SAP_ABAP = 'SAP_ABAP',
  SAP_JAVA = 'SAP_JAVA',
  SAP_APPS = 'SAP_APPS',
  CROSS_PLATFORM = 'CROSS_PLATFORM',
  LINUX_OS = 'LINUX_OS',
  WINDOWS_OS = 'WINDOWS_OS',
  AIX_OS = 'AIX_OS',
  SOLARIS_OS = 'SOLARIS_OS',
}

export const RUNBOOK_CATEGORY_LABELS: Record<RunbookCategory, string> = {
  [RunbookCategory.SAP_HANA]: 'SAP HANA',
  [RunbookCategory.ORACLE]: 'Oracle',
  [RunbookCategory.MSSQL]: 'Microsoft SQL Server',
  [RunbookCategory.IBM_DB2]: 'IBM DB2',
  [RunbookCategory.SAP_ASE]: 'SAP ASE / Sybase',
  [RunbookCategory.SAP_MAXDB]: 'SAP MaxDB',
  [RunbookCategory.HANA_HA]: 'HANA HA & Replication',
  [RunbookCategory.SAP_ABAP]: 'SAP ABAP Stack',
  [RunbookCategory.SAP_JAVA]: 'SAP Java / PO Stack',
  [RunbookCategory.SAP_APPS]: 'SAP Applications (BW/PO)',
  [RunbookCategory.CROSS_PLATFORM]: 'Cross-Platform / General',
  [RunbookCategory.LINUX_OS]: 'Linux OS',
  [RunbookCategory.WINDOWS_OS]: 'Windows Server',
  [RunbookCategory.AIX_OS]: 'AIX',
  [RunbookCategory.SOLARIS_OS]: 'Solaris',
};

// ── Connectivity ──
export enum ConnectivityProfile {
  AGENT = 'AGENT',
  CLOUD_CONNECTOR = 'CLOUD_CONNECTOR',
  API_ONLY = 'API_ONLY',
  NONE = 'NONE',
}

export enum CloudConnectorStatus {
  CONFIGURED = 'configured',
  TESTING = 'testing',
  CONNECTED = 'connected',
  FAILED = 'failed',
  DISCONNECTED = 'disconnected',
}

// ── Audit ──
export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}
