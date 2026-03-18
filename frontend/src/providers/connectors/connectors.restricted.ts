// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns last known connector status from cache/mock.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { ConnectorsProvider, ConnectorViewModel } from './connectors.contract';
import { ConnectorsMockProvider } from './connectors.mock';

const mockFallback = new ConnectorsMockProvider();

export class ConnectorsRestrictedProvider implements ConnectorsProvider {
  async getConnectors(): Promise<ProviderResult<ConnectorViewModel[]>> {
    const mock = await mockFallback.getConnectors();
    return providerResult(mock.data, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — connector status from last known state',
    });
  }
}
