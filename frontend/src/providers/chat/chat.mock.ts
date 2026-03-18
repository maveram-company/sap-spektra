// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Mock Provider
// ══════════════════════════════════════════════════════════════

import { mockAIUseCases, mockAIResponses } from '../../lib/mockData';
import type { ChatProvider } from './chat.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class ChatMockProvider implements ChatProvider {
  async chat(_message: string, _context: unknown) {
    await delay(800);
    return mockAIResponses.estado;
  }

  async getAIUseCases() {
    await delay(300);
    return mockAIUseCases;
  }

  async getAIResponses() {
    await delay(300);
    return mockAIResponses;
  }
}
