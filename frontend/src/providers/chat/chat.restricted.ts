// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// Chat: blocked. READ: returns empty.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { ChatProvider } from './chat.contract';
import type { ApiRecord } from '../../types/api';

export class ChatRestrictedProvider implements ChatProvider {
  async chat(_message: string, _context: unknown): Promise<ProviderResult<ApiRecord>> {
    return providerResult(
      { blocked: true, reason: 'Chat disabled in restricted mode' } as ApiRecord,
      'restricted',
      { confidence: 'low', reason: 'Chat disabled in restricted mode' },
    );
  }

  async getAIUseCases(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — AI use cases unavailable',
    });
  }

  async getAIResponses(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — AI responses unavailable',
    });
  }
}
