// ══════════════════════════════════════════════════════════════
// SAP Spektra — Systems Restricted Provider
// Intentional restriction behavior for RESTRICTED mode.
// READ: returns cached mock data. No write operations.
// ══════════════════════════════════════════════════════════════

import { providerResult } from '../types';
import type { ProviderResult } from '../types';
import type { SystemsProvider, SystemViewModel } from './systems.contract';
import type { ApiRecord } from '../../types/api';
import { SystemsMockProvider } from './systems.mock';

const mockFallback = new SystemsMockProvider();

export class SystemsRestrictedProvider implements SystemsProvider {
  async getSystems(): Promise<ProviderResult<SystemViewModel[]>> {
    const mock = await mockFallback.getSystems();
    return providerResult(mock.data, 'restricted', {
      confidence: 'low',
      reason: 'System catalog from cache — modifications disabled',
    });
  }

  async getSystemById(id: string): Promise<ProviderResult<SystemViewModel | null>> {
    const mock = await mockFallback.getSystemById(id);
    return providerResult(mock.data, 'restricted', {
      confidence: 'low',
      reason: 'System detail from cache — modifications disabled',
    });
  }

  async getSystemMetrics(_id: string, _hours?: number): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — system metrics unavailable',
    });
  }

  async getSystemBreaches(_id: string, _limit?: number): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — breach history unavailable',
    });
  }

  async getSystemSla(_id: string): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — SLA data unavailable',
    });
  }

  async getServerMetrics(_id: string): Promise<ProviderResult<ApiRecord | null>> {
    return providerResult(null, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — server metrics unavailable',
    });
  }

  async getServerDeps(_id: string): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — server dependencies unavailable',
    });
  }

  async getSystemInstances(_id: string): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — instance data unavailable',
    });
  }

  async getSystemHosts(_id: string): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — host data unavailable',
    });
  }

  async getSystemMeta(_id?: string): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — system metadata unavailable',
    });
  }

  async getSAPMonitoring(_id: string): Promise<ProviderResult<ApiRecord>> {
    return providerResult({} as ApiRecord, 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — SAP monitoring unavailable',
    });
  }

  async getMetricHistory(_hostname: string): Promise<ProviderResult<ApiRecord[]>> {
    return providerResult([], 'restricted', {
      confidence: 'low',
      reason: 'Restricted mode — metric history unavailable',
    });
  }
}
