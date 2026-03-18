// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { ChatProvider } from './chat.contract';
import { ChatRealProvider } from './chat.real';
import { ChatMockProvider } from './chat.mock';

export function createChatFallbackProvider(): ChatProvider {
  return createFallbackProvider<ChatProvider>(
    new ChatRealProvider(),
    new ChatMockProvider(),
    'Chat',
  );
}
