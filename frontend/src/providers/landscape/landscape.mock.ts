// ══════════════════════════════════════════════════════════════
// SAP Spektra — Landscape Mock Provider
// ══════════════════════════════════════════════════════════════

import {
  mockDiscovery,
  mockSIDLines,
  mockLandscapeValidation,
} from '../../lib/mockData';
import type { LandscapeProvider } from './landscape.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class LandscapeMockProvider implements LandscapeProvider {
  async getDiscovery() {
    await delay();
    return mockDiscovery;
  }

  async getSIDLines() {
    await delay(300);
    return mockSIDLines;
  }

  async getLandscapeValidation() {
    await delay(300);
    return mockLandscapeValidation;
  }
}
