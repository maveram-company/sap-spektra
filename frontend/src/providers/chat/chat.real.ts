// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Real Provider
// ══════════════════════════════════════════════════════════════

import { api } from '../../hooks/useApi';
import { createLogger } from '../../lib/logger';
import type { ApiRecord } from '../../types/api';
import { mockAIUseCases, mockAIResponses } from '../../lib/mockData';
import type { ChatProvider } from './chat.contract';
import { providerResult } from '../types';

const log = createLogger('ChatRealProvider');

export class ChatRealProvider implements ChatProvider {
  async chat(message: string, context: unknown) {
    const data = await api.chat(message, context);
    return providerResult(data as ApiRecord, 'real');
  }

  async getAIUseCases() {
    try {
      const data = await api.getAIUseCases();
      return providerResult(data as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch AI use cases', { error: (err as Error).message });
      return providerResult(mockAIUseCases as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }

  async getAIResponses() {
    try {
      const data = await api.getAIResponses();
      return providerResult(data as ApiRecord, 'real');
    } catch (err: unknown) {
      log.error('Failed to fetch AI responses', { error: (err as Error).message });
      return providerResult(mockAIResponses as ApiRecord, 'real', { degraded: true, reason: (err as Error).message });
    }
  }
}
