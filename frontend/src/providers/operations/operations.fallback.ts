// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { OperationsProvider } from './operations.contract';
import { OperationsRealProvider } from './operations.real';
import { OperationsMockProvider } from './operations.mock';

export function createOperationsFallbackProvider(): OperationsProvider {
  return createFallbackProvider<OperationsProvider>(
    new OperationsRealProvider(),
    new OperationsMockProvider(),
    'Operations',
  );
}
