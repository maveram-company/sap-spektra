// ══════════════════════════════════════════════════════════════
// SAP Spektra — Alerts Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { AlertsProvider } from './alerts.contract';
import { AlertsRealProvider } from './alerts.real';
import { AlertsMockProvider } from './alerts.mock';

export function createAlertsFallbackProvider(): AlertsProvider {
  return createFallbackProvider<AlertsProvider>(
    new AlertsRealProvider(),
    new AlertsMockProvider(),
    'Alerts',
  );
}
