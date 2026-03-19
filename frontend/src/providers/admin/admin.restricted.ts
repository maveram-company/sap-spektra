// ══════════════════════════════════════════════════════════════
// SAP Spektra — Admin Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns empty — admin data unavailable.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { AdminProvider, UserViewModel, AuditEntryViewModel } from './admin.contract';
import type { ApiRecord } from '../../types/api';

export class AdminRestrictedProvider implements AdminProvider {
  async getUsers(): Promise<ProviderResult<UserViewModel[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'User directory unavailable in restricted mode',
    });
  }

  async getAuditLog(): Promise<ProviderResult<AuditEntryViewModel[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Audit log unavailable in restricted mode',
    });
  }

  async getPlans(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — plan data unavailable',
    });
  }

  async getApiKeys(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — API keys unavailable',
    });
  }

  async getThresholds(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — thresholds unavailable',
    });
  }

  async getEscalationPolicy(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — escalation policy unavailable',
    });
  }

  async getMaintenanceWindows(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — maintenance windows unavailable',
    });
  }
}
