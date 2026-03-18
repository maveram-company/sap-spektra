// ══════════════════════════════════════════════════════════════
// SAP Spektra — Landscape Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { LandscapeProvider } from './landscape.contract';
import { LandscapeRealProvider } from './landscape.real';
import { LandscapeMockProvider } from './landscape.mock';

export function createLandscapeFallbackProvider(): LandscapeProvider {
  return createFallbackProvider<LandscapeProvider>(
    new LandscapeRealProvider(),
    new LandscapeMockProvider(),
    'Landscape',
  );
}
