// ══════════════════════════════════════════════════════════════
// SAP Spektra — Analytics Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockAnalytics } from '../../lib/mockData';
import type { ApiRecord } from '../../types/api';
import type { AnalyticsProvider } from './analytics.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class AnalyticsMockProvider implements AnalyticsProvider {
  async getAnalytics() {
    await delay();
    return providerResult(mockAnalytics as ApiRecord, 'mock');
  }

  async getRunbookAnalytics() {
    await delay();
    return providerResult(mockAnalytics as ApiRecord, 'mock');
  }
}
