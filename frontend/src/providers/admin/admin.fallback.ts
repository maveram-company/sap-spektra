// ══════════════════════════════════════════════════════════════
// SAP Spektra — Admin Fallback Provider
// ══════════════════════════════════════════════════════════════

import { createFallbackProvider } from '../create-fallback';
import type { AdminProvider } from './admin.contract';
import { AdminRealProvider } from './admin.real';
import { AdminMockProvider } from './admin.mock';

export function createAdminFallbackProvider(): AdminProvider {
  return createFallbackProvider<AdminProvider>(
    new AdminRealProvider(),
    new AdminMockProvider(),
    'Admin',
  );
}
