// ══════════════════════════════════════════════════════════════
// SAP Spektra — Systems Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { SystemsProvider } from './systems.contract';
import { SystemsRealProvider } from './systems.real';
import { SystemsMockProvider } from './systems.mock';

export function createSystemsFallbackProvider(): SystemsProvider {
  return createFallbackProvider<SystemsProvider>(
    new SystemsRealProvider(),
    new SystemsMockProvider(),
    'Systems',
  );
}
