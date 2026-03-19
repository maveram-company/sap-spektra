// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns empty — event log unavailable.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { EventsProvider, EventViewModel } from './events.contract';

export class EventsRestrictedProvider implements EventsProvider {
  async getEvents(): Promise<ProviderResult<EventViewModel[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Event log unavailable in restricted mode',
    });
  }
}
