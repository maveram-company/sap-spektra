// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Provider Contract
// ══════════════════════════════════════════════════════════════

 
type Any = any;

export interface ChatProvider {
  chat(message: string, context: Any): Promise<Any>;
  getAIUseCases(): Promise<Any>;
  getAIResponses(): Promise<Any>;
}
