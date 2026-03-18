// ══════════════════════════════════════════════════════════════
// SAP Spektra — Connectors Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockConnectors } from '../../lib/mockData';
import type { ConnectorsProvider, ConnectorViewModel } from './connectors.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class ConnectorsMockProvider implements ConnectorsProvider {
  async getConnectors() {
    await delay();
    return providerResult(mockConnectors as unknown as ConnectorViewModel[], 'mock');
  }
}
