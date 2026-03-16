/** Shared types for SAP system entities used across services */

export interface ConnectorEntity {
  id: string;
  method: string;
  status: string;
  features?: unknown;
  lastHeartbeat?: Date | null;
  latencyMs?: number | null;
}

export interface SystemWithConnectors {
  id: string;
  sid: string;
  dbType: string;
  status: string;
  healthScore: number;
  connectors?: ConnectorEntity[];
  systemMeta?: SystemMetaEntity | null;
  system?: { sid: string };
}

export interface SystemMetaEntity {
  id: string;
  kernelVersion?: string | null;
  kernelPatch?: string | null;
  osVersion?: string | null;
}

export interface AgentCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunbookEntity {
  id: string;
  name: string;
  description: string;
  steps: unknown;
  parameters?: unknown;
}
