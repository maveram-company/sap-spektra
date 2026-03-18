// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA Mock Provider
// ══════════════════════════════════════════════════════════════

import {
  mockHASystems,
  mockHAPrereqs,
  mockHAOpsHistory,
  mockHADrivers,
} from '../../lib/mockData';
import type { HAProvider } from './ha.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class HAMockProvider implements HAProvider {
  async getHASystems() {
    await delay();
    return mockHASystems;
  }

  async getHAPrereqs(_systemId?: string) {
    await delay(300);
    return mockHAPrereqs;
  }

  async getHAOpsHistory(_systemId?: string) {
    await delay(300);
    return mockHAOpsHistory;
  }

  async getHADrivers(_systemId?: string) {
    await delay(300);
    return mockHADrivers;
  }
}
