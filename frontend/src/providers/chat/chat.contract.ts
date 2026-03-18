// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Provider Contract
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import type { ProviderResult } from '../types';

export interface ChatProvider {
  chat(message: string, context: unknown): Promise<ProviderResult<ApiRecord>>;
  getAIUseCases(): Promise<ProviderResult<ApiRecord>>;
  getAIResponses(): Promise<ProviderResult<ApiRecord>>;
}
