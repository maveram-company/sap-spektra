// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ProviderResult } from '../types';

export interface ConnectorViewModel {
  id: string;
  method: string;
  status: string;
  systemId: string;
  sid: string;
  lastHeartbeat: string;
  [key: string]: unknown;
}

export interface ConnectorsProvider {
  getConnectors(): Promise<ProviderResult<ConnectorViewModel[]>>;
}
