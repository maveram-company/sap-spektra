// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA Mock Provider
// ══════════════════════════════════════════════════════════════

import {
  mockHASystems,
  mockHAPrereqs,
  mockHAOpsHistory,
  mockHADrivers,
} from '../../lib/mockData';
import type { ApiRecord } from '../../types/api';
import type { HAProvider, HAConfigViewModel } from './ha.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class HAMockProvider implements HAProvider {
  async getHASystems() {
    await delay();
    return providerResult(mockHASystems as unknown as HAConfigViewModel[], 'mock');
  }

  async getHAPrereqs(_systemId?: string) {
    await delay(300);
    return providerResult(mockHAPrereqs as ApiRecord, 'mock');
  }

  async getHAOpsHistory(_systemId?: string) {
    await delay(300);
    return providerResult(mockHAOpsHistory as ApiRecord, 'mock');
  }

  async getHADrivers(_systemId?: string) {
    await delay(300);
    return providerResult(mockHADrivers as ApiRecord, 'mock');
  }
}
