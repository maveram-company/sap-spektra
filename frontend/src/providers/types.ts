// ══════════════════════════════════════════════════════════════
// SAP Spektra — Provider Base Types
// Shared types for all domain providers.
// ══════════════════════════════════════════════════════════════

import type { ProviderTier } from '../mode/types';

/** Wraps any provider result with metadata about its source */
export interface ProviderResult<T> {
  data: T;
  source: ProviderTier;
  confidence: 'high' | 'medium' | 'low';
  timestamp: string;
  degraded: boolean;
  reason?: string;
}

/** Helper to create a ProviderResult */
export function providerResult<T>(
  data: T,
  source: ProviderTier,
  opts?: { degraded?: boolean; reason?: string; confidence?: 'high' | 'medium' | 'low' },
): ProviderResult<T> {
  return {
    data,
    source,
    confidence: opts?.confidence ?? (source === 'real' ? 'high' : source === 'fallback' ? 'medium' : 'low'),
    timestamp: new Date().toISOString(),
    degraded: opts?.degraded ?? false,
    reason: opts?.reason,
  };
}
