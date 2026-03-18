// ══════════════════════════════════════════════════════════════
// SAP Spektra — Capability Engine
// Resolves per-domain capabilities based on operational mode
// and backend reachability.
// ══════════════════════════════════════════════════════════════

import type { OperationalMode, DomainName, DomainCapability } from './types';
import { ALL_DOMAINS } from './types';

/**
 * Resolve capabilities for all domains given the current mode
 * and whether the backend is reachable.
 *
 * Rules:
 * - REAL + backend up     → tier:real, confidence:high, source:api
 * - REAL + backend down   → tier:fallback, degraded:true, confidence:medium
 * - FALLBACK              → tier:fallback, confidence:medium, source:api
 * - MOCK                  → tier:mock, readOnly:true, confidence:low, source:simulation
 */
export function resolveCapabilities(
  mode: OperationalMode,
  backendReachable: boolean,
): Map<DomainName, DomainCapability> {
  const caps = new Map<DomainName, DomainCapability>();

  for (const domain of ALL_DOMAINS) {
    switch (mode) {
      case 'REAL':
        caps.set(domain, {
          domain,
          tier: backendReachable ? 'real' : 'fallback',
          readOnly: false,
          degraded: !backendReachable,
          reason: backendReachable ? undefined : 'Backend unreachable — using cached/mock data',
          confidence: backendReachable ? 'high' : 'medium',
          source: backendReachable ? 'api' : 'cache',
        });
        break;

      case 'FALLBACK':
        caps.set(domain, {
          domain,
          tier: 'fallback',
          readOnly: false,
          degraded: false,
          confidence: 'medium',
          source: 'api',
        });
        break;

      case 'MOCK':
        caps.set(domain, {
          domain,
          tier: 'mock',
          readOnly: true,
          degraded: false,
          confidence: 'low',
          source: 'simulation',
        });
        break;

      case 'RESTRICTED':
        caps.set(domain, {
          domain,
          tier: 'restricted',
          readOnly: true,
          degraded: false,
          confidence: 'low',
          source: 'rules',
        });
        break;
    }
  }

  return caps;
}
