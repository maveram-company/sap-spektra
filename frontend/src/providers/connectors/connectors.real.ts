// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiConnector } from '../../types/api';
import type { ConnectorsProvider } from './connectors.contract';

export function transformConnector(c: ApiConnector) {
  return {
    ...c,
    sid: c.system?.sid || c.sid || '',
    systemName: c.system?.description || '',
  };
}

export class ConnectorsRealProvider implements ConnectorsProvider {
  async getConnectors() {
    const connectors = await api.getConnectors() as ApiConnector[];
    return connectors.map(transformConnector);
  }
}
