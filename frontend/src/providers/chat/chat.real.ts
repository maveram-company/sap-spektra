// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import type { ChatProvider } from './chat.contract';

export class ChatRealProvider implements ChatProvider {
  async chat(message: string, context: unknown) {
    return api.chat(message, context);
  }

  async getAIUseCases() {
    return api.getAIUseCases();
  }

  async getAIResponses() {
    return api.getAIResponses();
  }
}
