// ══════════════════════════════════════════════════════════════
// SAP Spektra — Systems Mock Provider
// ══════════════════════════════════════════════════════════════

import type { ApiRecord } from '../../types/api';
import {
  mockSystems,
  mockBreaches,
  mockMetrics,
  mockServerMetrics,
  mockServerDeps,
  mockSystemInstances,
  mockMetricHistory,
  getSystemHosts as getSystemHostsMock,
  mockSystemMeta,
  mockSAPMonitoring,
} from '../../lib/mockData';
import type { SystemsProvider, SystemViewModel } from './systems.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class SystemsMockProvider implements SystemsProvider {
  async getSystems(): Promise<SystemViewModel[]> {
    await delay();
    return mockSystems as unknown as SystemViewModel[];
  }

  async getSystemById(id: string): Promise<SystemViewModel | null> {
    await delay();
    return (mockSystems.find((s: ApiRecord) => s.id === id) as unknown as SystemViewModel) || null;
  }

  async getSystemMetrics(_id: string, _hours = 2): Promise<ApiRecord> {
    await delay(300);
    return mockMetrics();
  }

  async getSystemBreaches(id: string, limit = 50): Promise<ApiRecord[]> {
    await delay(300);
    return id
      ? mockBreaches.filter((b: ApiRecord) => b.systemId === id).slice(0, limit)
      : mockBreaches.slice(0, limit);
  }

  async getSystemSla(id: string): Promise<ApiRecord> {
    await delay(300);
    const sys = mockSystems.find((s: ApiRecord) => s.id === id);
    return sys ? { mttr: sys.mttr, mtbf: sys.mtbf, availability: sys.availability } : null as unknown as ApiRecord;
  }

  async getServerMetrics(id: string): Promise<ApiRecord | null> {
    await delay(300);
    return (mockServerMetrics as Record<string, ApiRecord>)[id] || null;
  }

  async getServerDeps(id: string): Promise<ApiRecord[]> {
    await delay(300);
    return (mockServerDeps as Record<string, ApiRecord[]>)[id] || [];
  }

  async getSystemInstances(id: string): Promise<ApiRecord[]> {
    await delay(300);
    return (mockSystemInstances as Record<string, ApiRecord[]>)[id] || [];
  }

  async getSystemHosts(id: string): Promise<ApiRecord[]> {
    await delay(200);
    return getSystemHostsMock(id);
  }

  async getSystemMeta(id?: string): Promise<ApiRecord> {
    await delay(200);
    return id ? ((mockSystemMeta as Record<string, ApiRecord>)[id] || null as unknown as ApiRecord) : mockSystemMeta;
  }

  async getSAPMonitoring(id: string): Promise<ApiRecord> {
    await delay(300);
    return (mockSAPMonitoring as Record<string, ApiRecord>)[id] || null as unknown as ApiRecord;
  }

  async getMetricHistory(hostname: string): Promise<ApiRecord[]> {
    await delay(300);
    return (mockMetricHistory as Record<string, ApiRecord[]>)[hostname] || [];
  }
}
