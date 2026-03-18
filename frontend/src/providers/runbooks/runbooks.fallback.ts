// ══════════════════════════════════════════════════════════════
// SAP Spektra — Runbooks Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { RunbooksProvider } from './runbooks.contract';
import { RunbooksRealProvider } from './runbooks.real';
import { RunbooksMockProvider } from './runbooks.mock';

export function createRunbooksFallbackProvider(): RunbooksProvider {
  return createFallbackProvider<RunbooksProvider>(
    new RunbooksRealProvider(),
    new RunbooksMockProvider(),
    'Runbooks',
  );
}
