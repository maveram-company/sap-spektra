// ══════════════════════════════════════════════════════════════
// SAP Spektra — Generic Fallback Provider Factory
// Creates a fallback provider from a real+mock pair.
// Every method tries real first; on failure, falls back to mock.
// All fallback events are logged.
// ══════════════════════════════════════════════════════════════

import { createLogger } from '../lib/logger';

/**
 * Creates a Proxy that wraps `real` provider methods.
 * Each method call tries real; on error, logs and delegates to mock.
 */
export function createFallbackProvider<T extends object>(
  real: T,
  mock: T,
  domainName: string,
): T {
  const log = createLogger(`${domainName}Fallback`);

  return new Proxy(real, {
    get(target: T, prop: string | symbol, receiver: unknown) {
      const realFn = Reflect.get(target, prop, receiver);
      if (typeof realFn !== 'function') return realFn;

      const mockObj = mock as Record<string | symbol, unknown>;
      const mockFn = mockObj[prop];

      return async (...args: unknown[]) => {
        try {
          return await (realFn as (...a: unknown[]) => unknown).apply(target, args);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          log.warn(`${String(prop)} failed, falling back to mock`, { error: message });
          if (typeof mockFn === 'function') {
            return mockFn.apply(mock, args);
          }
          throw err;
        }
      };
    },
  }) as T;
}
