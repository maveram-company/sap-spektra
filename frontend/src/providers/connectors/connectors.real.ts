// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiConnector } from '../../types/api';
import type { ConnectorsProvider, ConnectorViewModel } from './connectors.contract';
import { providerResult } from '../types';

export function transformConnector(c: ApiConnector): ConnectorViewModel {
  return {
    ...c,
    sid: c.system?.sid || (c as Record<string, unknown>).sid as string || '',
    systemName: c.system?.description || '',
    lastHeartbeat: c.lastHeartbeat ?? '',
  };
}

export class ConnectorsRealProvider implements ConnectorsProvider {
  async getConnectors() {
    const connectors = await api.getConnectors() as ApiConnector[];
    return providerResult(connectors.map(transformConnector), 'real');
  }
}
