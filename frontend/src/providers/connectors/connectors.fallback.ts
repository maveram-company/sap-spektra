// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { ConnectorsProvider } from './connectors.contract';
import { ConnectorsRealProvider } from './connectors.real';
import { ConnectorsMockProvider } from './connectors.mock';

export function createConnectorsFallbackProvider(): ConnectorsProvider {
  return createFallbackProvider<ConnectorsProvider>(
    new ConnectorsRealProvider(),
    new ConnectorsMockProvider(),
    'Connectors',
  );
}
