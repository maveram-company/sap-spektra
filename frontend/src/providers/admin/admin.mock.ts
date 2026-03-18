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
import type { ApiRecord } from '../../types/api';
import type { AdminProvider, AuditEntryViewModel, UserViewModel } from './admin.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class AdminMockProvider implements AdminProvider {
  async getUsers() {
    await delay();
    return providerResult(mockUsers as unknown as UserViewModel[], 'mock');
  }

  async getAuditLog() {
    await delay();
    return providerResult(mockAuditLog as unknown as AuditEntryViewModel[], 'mock');
  }

  async getPlans() {
    await delay(300);
    return providerResult([] as ApiRecord, 'mock');
  }

  async getApiKeys() {
    await delay(300);
    return providerResult(mockApiKeys as ApiRecord, 'mock');
  }

  async getThresholds() {
    await delay(300);
    return providerResult(mockThresholds as ApiRecord, 'mock');
  }

  async getEscalationPolicy() {
    await delay(300);
    return providerResult(mockEscalationPolicy as ApiRecord, 'mock');
  }

  async getMaintenanceWindows() {
    await delay(300);
    return providerResult(mockMaintenanceWindows as ApiRecord, 'mock');
  }
}
