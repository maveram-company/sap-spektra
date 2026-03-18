// ══════════════════════════════════════════════════════════════
// SAP Spektra — Analytics Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { AnalyticsProvider } from './analytics.contract';
import { AnalyticsRealProvider } from './analytics.real';
import { AnalyticsMockProvider } from './analytics.mock';

export function createAnalyticsFallbackProvider(): AnalyticsProvider {
  return createFallbackProvider<AnalyticsProvider>(
    new AnalyticsRealProvider(),
    new AnalyticsMockProvider(),
    'Analytics',
  );
}
