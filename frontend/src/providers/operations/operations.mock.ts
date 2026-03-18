// ══════════════════════════════════════════════════════════════
// SAP Spektra — Operations Mock Provider
// ══════════════════════════════════════════════════════════════

import {
  mockOperations,
  mockBackgroundJobs,
  mockTransports,
  mockCertificates,
  mockLicenses,
} from '../../lib/mockData';
import type { OperationsProvider } from './operations.contract';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class OperationsMockProvider implements OperationsProvider {
  async getOperations() {
    await delay();
    return mockOperations;
  }

  async getBackgroundJobs() {
    await delay();
    return mockBackgroundJobs;
  }

  async getTransports() {
    await delay();
    return mockTransports;
  }

  async getCertificates() {
    await delay();
    return mockCertificates;
  }

  async getLicenses() {
    await delay(300);
    return mockLicenses;
  }
}
