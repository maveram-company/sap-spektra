// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Provider Contract
// ══════════════════════════════════════════════════════════════

export interface ChatProvider {
  chat(message: string, context: unknown): Promise<unknown>;
  getAIUseCases(): Promise<unknown>;
  getAIResponses(): Promise<unknown>;
}
