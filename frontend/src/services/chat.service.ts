// ══════════════════════════════════════════════════════════════
// SAP Spektra — Chat / AI Service
// ══════════════════════════════════════════════════════════════
//
// Data Source Classification:
//   REAL: chat
//   FALLBACK-TO-MOCK: getAIUseCases, getAIResponses
//   DEMO: returns mock data with simulated latency
//
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import { createLogger } from '../lib/logger';
import {
  mockAIUseCases,
  mockAIResponses,
} from '../lib/mockData';

const log = createLogger('ChatService');
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const isDemoMode = () => config.features.demoMode;

// ── Public API ──

export const chat = async (message: string, context: unknown) => {
  if (isDemoMode()) { await delay(800); return mockAIResponses.estado; }
  return api.chat(message, context);
};

export const getAIUseCases = async () => {
  if (isDemoMode()) { await delay(300); return mockAIUseCases; }
  try { return await api.getAIUseCases(); } catch (err: unknown) { log.error('Failed to fetch AI use cases', { error: (err as Error).message }); return mockAIUseCases; }
};

export const getAIResponses = async () => {
  if (isDemoMode()) { await delay(300); return mockAIResponses; }
  try { return await api.getAIResponses(); } catch (err: unknown) { log.error('Failed to fetch AI responses', { error: (err as Error).message }); return mockAIResponses; }
};
