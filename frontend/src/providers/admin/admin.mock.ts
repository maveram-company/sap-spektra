// ══════════════════════════════════════════════════════════════
// SAP Spektra — Admin Mock Provider
// ══════════════════════════════════════════════════════════════

import {
  mockUsers,
  mockAuditLog,
  mockThresholds,
  mockEscalationPolicy,
  mockMaintenanceWindows,
  mockApiKeys,
} from '../../lib/mockData';
import type { AdminProvider } from './admin.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class AdminMockProvider implements AdminProvider {
  async getUsers() {
    await delay();
    return mockUsers;
  }

  async getAuditLog() {
    await delay();
    return mockAuditLog;
  }

  async getPlans() {
    await delay(300);
    return [];
  }

  async getApiKeys() {
    await delay(300);
    return mockApiKeys;
  }

  async getThresholds() {
    await delay(300);
    return mockThresholds;
  }

  async getEscalationPolicy() {
    await delay(300);
    return mockEscalationPolicy;
  }

  async getMaintenanceWindows() {
    await delay(300);
    return mockMaintenanceWindows;
  }
}
