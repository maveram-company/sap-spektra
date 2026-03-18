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
import type { SystemsProvider } from './systems.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class SystemsMockProvider implements SystemsProvider {
  async getSystems() {
    await delay();
    return mockSystems;
  }

  async getSystemById(id: string) {
    await delay();
    return mockSystems.find((s: ApiRecord) => s.id === id) || null;
  }

  async getSystemMetrics(_id: string, _hours = 2) {
    await delay(300);
    return mockMetrics();
  }

  async getSystemBreaches(id: string, limit = 50) {
    await delay(300);
    return id
      ? mockBreaches.filter((b: ApiRecord) => b.systemId === id).slice(0, limit)
      : mockBreaches.slice(0, limit);
  }

  async getSystemSla(id: string) {
    await delay(300);
    const sys = mockSystems.find((s: ApiRecord) => s.id === id);
    return sys ? { mttr: sys.mttr, mtbf: sys.mtbf, availability: sys.availability } : null;
  }

  async getServerMetrics(id: string) {
    await delay(300);
    return (mockServerMetrics as Record<string, ApiRecord>)[id] || null;
  }

  async getServerDeps(id: string) {
    await delay(300);
    return (mockServerDeps as Record<string, ApiRecord[]>)[id] || null;
  }

  async getSystemInstances(id: string) {
    await delay(300);
    return (mockSystemInstances as Record<string, ApiRecord[]>)[id] || [];
  }

  async getSystemHosts(id: string) {
    await delay(200);
    return getSystemHostsMock(id);
  }

  async getSystemMeta(id?: string) {
    await delay(200);
    return id ? ((mockSystemMeta as Record<string, ApiRecord>)[id] || null) : mockSystemMeta;
  }

  async getSAPMonitoring(id: string) {
    await delay(300);
    return (mockSAPMonitoring as Record<string, ApiRecord>)[id] || null;
  }

  async getMetricHistory(hostname: string) {
    await delay(300);
    return (mockMetricHistory as Record<string, ApiRecord[]>)[hostname] || [];
  }
}
