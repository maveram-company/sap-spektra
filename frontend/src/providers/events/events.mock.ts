// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockEvents } from '../../lib/mockData';
import type { EventsProvider } from './events.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class EventsMockProvider implements EventsProvider {
  async getEvents() {
    await delay();
    return mockEvents;
  }
}
