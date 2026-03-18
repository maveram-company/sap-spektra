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
import type { ApiRecord } from '../../types/api';
import type { OperationsProvider, OperationViewModel } from './operations.contract';
import { providerResult } from '../types';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

export class OperationsMockProvider implements OperationsProvider {
  async getOperations() {
    await delay();
    return providerResult(mockOperations as unknown as OperationViewModel[], 'mock');
  }

  async getBackgroundJobs() {
    await delay();
    return providerResult(mockBackgroundJobs as unknown as ApiRecord[], 'mock');
  }

  async getTransports() {
    await delay();
    return providerResult(mockTransports as unknown as ApiRecord[], 'mock');
  }

  async getCertificates() {
    await delay();
    return providerResult(mockCertificates as unknown as ApiRecord[], 'mock');
  }

  async getLicenses() {
    await delay(300);
    return providerResult(mockLicenses as ApiRecord, 'mock');
  }
}
