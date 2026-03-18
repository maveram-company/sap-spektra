// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import { createLogger } from '../../lib/logger';
import { mockAIUseCases, mockAIResponses } from '../../lib/mockData';
import type { ChatProvider } from './chat.contract';

const log = createLogger('ChatRealProvider');

export class ChatRealProvider implements ChatProvider {
  async chat(message: string, context: unknown) {
    return api.chat(message, context);
  }

  async getAIUseCases() {
    try { return await api.getAIUseCases(); } catch (err: unknown) { log.error('Failed to fetch AI use cases', { error: (err as Error).message }); return mockAIUseCases; }
  }

  async getAIResponses() {
    try { return await api.getAIResponses(); } catch (err: unknown) { log.error('Failed to fetch AI responses', { error: (err as Error).message }); return mockAIResponses; }
  }
}
