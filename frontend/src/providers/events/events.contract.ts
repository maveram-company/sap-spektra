// ══════════════════════════════════════════════════════════════
// SAP Spektra — Events Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ProviderResult } from '../types';

export interface EventViewModel {
  id: string;
  type: string;
  message: string;
  level: string;
  source: string;
  sid: string;
  time: string;
  [key: string]: unknown;
}

export interface EventsProvider {
  getEvents(): Promise<ProviderResult<EventViewModel[]>>;
}
