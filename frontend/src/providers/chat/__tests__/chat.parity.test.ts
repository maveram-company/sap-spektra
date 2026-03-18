import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../hooks/useApi', () => ({
  api: {
    chat: vi.fn().mockResolvedValue({ response: 'Test AI response', confidence: 0.95 }),
    getAIUseCases: vi.fn().mockResolvedValue([
      { id: 'uc-1', name: 'Health Check', description: 'Check system health' },
    ]),
    getAIResponses: vi.fn().mockResolvedValue({
      estado: { response: 'System is healthy', confidence: 0.9 },
    }),
  },
}));

vi.mock('../../../lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../../lib/mockData', () => ({
  mockAIUseCases: [
    { id: 'mock-uc-1', name: 'Health Check', description: 'Check system health' },
  ],
  mockAIResponses: {
    estado: { response: 'Mock response', confidence: 0.9 },
  },
}));

import { ChatRealProvider } from '../chat.real';
import { ChatMockProvider } from '../chat.mock';

describe('ChatProvider parity tests', () => {
  const real = new ChatRealProvider();
  const mock = new ChatMockProvider();

  describe.each([
    ['real', real],
    ['mock', mock],
  ])('%s provider', (_name, provider) => {
    it('chat() returns an object', async () => {
      const result = await provider.chat('Hello', {});
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('getAIUseCases() returns data', async () => {
      const result = await provider.getAIUseCases();
      expect(result).toBeDefined();
    });

    it('getAIResponses() returns data', async () => {
      const result = await provider.getAIResponses();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });
});
