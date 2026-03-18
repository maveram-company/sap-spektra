// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiEvent } from '../../types/api';
import type { EventsProvider } from './events.contract';

export function transformEvent(e: ApiEvent) {
  return {
    ...e,
    sid: e.system?.sid || e.sid || '',
  };
}

export class EventsRealProvider implements EventsProvider {
  async getEvents() {
    const events = await api.getEvents() as ApiEvent[];
    return events.map(transformEvent);
  }
}
