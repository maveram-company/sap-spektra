// ══════════════════════════════════════════════════════════════
// SAP Spektra — Analytics Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockAnalytics } from '../../lib/mockData';
import type { AnalyticsProvider } from './analytics.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class AnalyticsMockProvider implements AnalyticsProvider {
  async getAnalytics() {
    await delay();
    return mockAnalytics;
  }

  async getRunbookAnalytics() {
    await delay();
    return mockAnalytics;
  }
}
