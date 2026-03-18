// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ApiEvent } from '../../types/api';
import type { EventsProvider, EventViewModel } from './events.contract';
import { providerResult } from '../types';

export function transformEvent(e: ApiEvent): EventViewModel {
  return {
    ...e,
    sid: e.system?.sid || (e as Record<string, unknown>).sid as string || '',
    time: e.createdAt
      ? new Date(e.createdAt).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })
      : '',
  };
}

export class EventsRealProvider implements EventsProvider {
  async getEvents() {
    const events = await api.getEvents() as ApiEvent[];
    return providerResult(events.map(transformEvent), 'real');
  }
}
