// ══════════════════════════════════════════════════════════════
// SAP Spektra — API Response Type Definitions
// ══════════════════════════════════════════════════════════════
//
// These interfaces match the shapes returned by the NestJS backend
// (Prisma models + includes). Used to replace `as any` casts in
// dataService.ts and page components.

export interface ApiSystem {
  id: string;
  sid: string;
  description: string;
  sapProduct: string;
  environment: string;
  healthScore: number;
  status: string;
  deploymentModel?: string;
  connectionMode?: string;
  monitoringCapabilityProfile?: string;
  supportsOsMetrics?: boolean;
  hosts?: ApiHost[];
  components?: unknown[];
  instances?: unknown[];
  connectors?: unknown[];
  haConfig?: unknown;
  systemMeta?: unknown;
  [key: string]: unknown;
}

export interface ApiHost {
  id: string;
  hostname: string;
  ip?: string;
  os?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  [key: string]: unknown;
}

export interface ApiAlert {
  id: string;
  title: string;
  message?: string;
  level: string;
  status: string;
  systemId?: string;
  system?: { sid: string };
  acknowledgedBy?: string;
  resolvedBy?: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface ApiEvent {
  id: string;
  type: string;
  message: string;
  level: string;
  source: string;
  systemId?: string;
  system?: { sid: string };
  createdAt: string;
  [key: string]: unknown;
}

export interface ApiApproval {
  id: string;
  type: string;
  status: string;
  reason: string;
  requestedBy: string;
  systemId?: string;
  system?: { sid: string };
  createdAt: string;
  [key: string]: unknown;
}

export interface ApiOperation {
  id: string;
  type: string;
  status: string;
  description: string;
  riskLevel?: string;
  systemId?: string;
  system?: { sid: string };
  createdAt: string;
  [key: string]: unknown;
}

export interface ApiRunbook {
  id: string;
  name: string;
  description?: string;
  category?: string;
  dbType?: string;
  steps?: unknown;
  parameters?: unknown;
  prerequisites?: unknown;
  costSafe?: boolean;
  autoExecute?: boolean;
  executions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  [key: string]: unknown;
}

export interface ApiAuditEntry {
  id: string;
  action: string;
  resource: string;
  severity: string;
  userId?: string;
  userEmail?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  [key: string]: unknown;
}

export interface ApiConnector {
  id: string;
  method: string;
  status: string;
  systemId: string;
  system?: { sid: string; description?: string };
  lastHeartbeat?: string;
  latencyMs?: number;
  [key: string]: unknown;
}
