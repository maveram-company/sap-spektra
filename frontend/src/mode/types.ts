// ══════════════════════════════════════════════════════════════
// SAP Spektra — Canonical Multi-Mode Architecture: Types
// ══════════════════════════════════════════════════════════════

/** The four operational modes of the platform */
export type OperationalMode = 'REAL' | 'FALLBACK' | 'MOCK' | 'RESTRICTED';

/** Which provider implementation is active for a domain */
export type ProviderTier = 'real' | 'mock' | 'fallback' | 'restricted';

/** All functional domains in the platform */
export type DomainName =
  | 'systems'
  | 'alerts'
  | 'events'
  | 'operations'
  | 'runbooks'
  | 'approvals'
  | 'analytics'
  | 'ha'
  | 'admin'
  | 'landscape'
  | 'connectors'
  | 'chat';

/** Capability resolution for a single domain */
export interface DomainCapability {
  domain: DomainName;
  tier: ProviderTier;
  readOnly: boolean;
  degraded: boolean;
  reason?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'api' | 'agent' | 'cache' | 'simulation' | 'rules';
}

/** Full mode state exposed to the application */
export interface ModeState {
  mode: OperationalMode;
  resolvedAt: string;
  capabilities: Map<DomainName, DomainCapability>;
  backendReachable: boolean;
  backendRuntimeMode?: string;
}

/** All domain names as a constant array */
export const ALL_DOMAINS: DomainName[] = [
  'systems', 'alerts', 'events', 'operations', 'runbooks',
  'approvals', 'analytics', 'ha', 'admin', 'landscape',
  'connectors', 'chat',
];
