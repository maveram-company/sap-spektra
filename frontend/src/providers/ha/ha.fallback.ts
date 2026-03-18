// ══════════════════════════════════════════════════════════════
// SAP Spektra — HA Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { HAProvider } from './ha.contract';
import { HARealProvider } from './ha.real';
import { HAMockProvider } from './ha.mock';

export function createHAFallbackProvider(): HAProvider {
  return createFallbackProvider<HAProvider>(
    new HARealProvider(),
    new HAMockProvider(),
    'HA',
  );
}
