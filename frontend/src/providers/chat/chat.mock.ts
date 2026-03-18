// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockAIUseCases, mockAIResponses } from '../../lib/mockData';
import type { ApiRecord } from '../../types/api';
import type { ChatProvider } from './chat.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class ChatMockProvider implements ChatProvider {
  async chat(_message: string, _context: unknown) {
    await delay(800);
    return providerResult((mockAIResponses as ApiRecord).estado as ApiRecord, 'mock');
  }

  async getAIUseCases() {
    await delay(300);
    return providerResult(mockAIUseCases as ApiRecord, 'mock');
  }

  async getAIResponses() {
    await delay(300);
    return providerResult(mockAIResponses as ApiRecord, 'mock');
  }
}
