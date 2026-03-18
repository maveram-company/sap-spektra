// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockConnectors } from '../../lib/mockData';
import type { ConnectorsProvider } from './connectors.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class ConnectorsMockProvider implements ConnectorsProvider {
  async getConnectors() {
    await delay();
    return mockConnectors;
  }
}
