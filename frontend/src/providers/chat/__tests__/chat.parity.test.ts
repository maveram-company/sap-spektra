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
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });

    it('getAIUseCases() returns data', async () => {
      const result = await provider.getAIUseCases();
      expect(result.data).toBeDefined();
    });

    it('getAIResponses() returns data', async () => {
      const result = await provider.getAIResponses();
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });
  });

  // ── ProviderResult metadata ──

  describe('ProviderResult metadata', () => {
    it('real provider returns ProviderResult with source=real and confidence=high', async () => {
      const result = await real.chat('Hello', {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'real');
      expect(result).toHaveProperty('confidence', 'high');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
    });

    it('mock provider returns ProviderResult with source=mock and confidence=low', async () => {
      const result = await mock.chat('Hello', {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('source', 'mock');
      expect(result).toHaveProperty('confidence', 'low');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('degraded', false);
    });
  });
});
