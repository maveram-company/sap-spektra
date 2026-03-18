// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { EventsProvider } from './events.contract';
import { EventsRealProvider } from './events.real';
import { EventsMockProvider } from './events.mock';

export function createEventsFallbackProvider(): EventsProvider {
  return createFallbackProvider<EventsProvider>(
    new EventsRealProvider(),
    new EventsMockProvider(),
    'Events',
  );
}
