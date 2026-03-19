// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns empty — operations data unavailable.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { OperationsProvider, OperationViewModel } from './operations.contract';
import type { ApiRecord } from '../../types/api';

export class OperationsRestrictedProvider implements OperationsProvider {
  async getOperations(): Promise<ProviderResult<OperationViewModel[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — operations data unavailable',
    });
  }

  async getBackgroundJobs(): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — background jobs unavailable',
    });
  }

  async getTransports(): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — transports unavailable',
    });
  }

  async getCertificates(): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — certificates unavailable',
    });
  }

  async getLicenses(): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — license data unavailable',
    });
  }
}
