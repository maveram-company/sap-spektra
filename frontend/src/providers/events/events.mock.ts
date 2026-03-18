// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockEvents } from '../../lib/mockData';
import type { EventsProvider, EventViewModel } from './events.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class EventsMockProvider implements EventsProvider {
  async getEvents() {
    await delay();
    return providerResult(mockEvents as unknown as EventViewModel[], 'mock');
  }
}
