// ══════════════════════════════════════════════════════════════
// SAP Spektra — Landscape Mock Provider
// ══════════════════════════════════════════════════════════════

import {
  mockDiscovery,
  mockSIDLines,
  mockLandscapeValidation,
} from '../../lib/mockData';
import type { ApiRecord } from '../../types/api';
import type { LandscapeProvider } from './landscape.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class LandscapeMockProvider implements LandscapeProvider {
  async getDiscovery() {
    await delay();
    return providerResult(mockDiscovery as unknown as ApiRecord[], 'mock');
  }

  async getSIDLines() {
    await delay(300);
    return providerResult(mockSIDLines as unknown as ApiRecord[], 'mock');
  }

  async getLandscapeValidation() {
    await delay(300);
    return providerResult(mockLandscapeValidation as ApiRecord, 'mock');
  }
}
