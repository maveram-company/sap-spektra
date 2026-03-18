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
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class SystemsMockProvider implements SystemsProvider {
  async getSystems() {
    await delay();
    return providerResult(mockSystems as unknown as SystemViewModel[], 'mock');
  }

  async getSystemById(id: string) {
    await delay();
    return providerResult((mockSystems.find((s: ApiRecord) => s.id === id) as unknown as SystemViewModel) || null, 'mock');
  }

  async getSystemMetrics(_id: string, _hours = 2) {
    await delay(300);
    return providerResult(mockMetrics(), 'mock');
  }

  async getSystemBreaches(id: string, limit = 50) {
    await delay(300);
    const data = id
      ? mockBreaches.filter((b: ApiRecord) => b.systemId === id).slice(0, limit)
      : mockBreaches.slice(0, limit);
    return providerResult(data, 'mock');
  }

  async getSystemSla(id: string) {
    await delay(300);
    const sys = mockSystems.find((s: ApiRecord) => s.id === id);
    return providerResult(sys ? { mttr: sys.mttr, mtbf: sys.mtbf, availability: sys.availability } as ApiRecord : null as unknown as ApiRecord, 'mock');
  }

  async getServerMetrics(id: string) {
    await delay(300);
    return providerResult((mockServerMetrics as Record<string, ApiRecord>)[id] || null, 'mock');
  }

  async getServerDeps(id: string) {
    await delay(300);
    return providerResult((mockServerDeps as Record<string, ApiRecord[]>)[id] || [], 'mock');
  }

  async getSystemInstances(id: string) {
    await delay(300);
    return providerResult((mockSystemInstances as Record<string, ApiRecord[]>)[id] || [], 'mock');
  }

  async getSystemHosts(id: string) {
    await delay(200);
    return providerResult(getSystemHostsMock(id), 'mock');
  }

  async getSystemMeta(id?: string) {
    await delay(200);
    return providerResult(id ? ((mockSystemMeta as Record<string, ApiRecord>)[id] || null as unknown as ApiRecord) : mockSystemMeta as ApiRecord, 'mock');
  }

  async getSAPMonitoring(id: string) {
    await delay(300);
    return providerResult((mockSAPMonitoring as Record<string, ApiRecord>)[id] || null as unknown as ApiRecord, 'mock');
  }

  async getMetricHistory(hostname: string) {
    await delay(300);
    return providerResult((mockMetricHistory as Record<string, ApiRecord[]>)[hostname] || [], 'mock');
  }
}
