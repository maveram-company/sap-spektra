import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CloudConnectorService } from './cloud-connector.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ORG_ID = 'org-test-1';
const SYSTEM_ID = 'sys-1';

function mockConfig(overrides = {}) {
  return {
    id: 'cc-1',
    organizationId: ORG_ID,
    systemId: SYSTEM_ID,
    locationId: 'loc-eu10',
    virtualHost: 'sap-erp.internal',
    virtualPort: 3300,
    protocol: 'RFC',
    status: 'configured',
    lastTestAt: null,
    lastTestResult: null,
    latencyMs: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockSystem(overrides = {}) {
  return {
    id: SYSTEM_ID,
    organizationId: ORG_ID,
    sid: 'EP1',
    description: 'ERP Production',
    environment: 'PRD',
    connectivityProfile: 'NONE',
    ...overrides,
  };
}

describe('CloudConnectorService', () => {
  let service: CloudConnectorService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      system: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      cloudConnectorConfig: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudConnectorService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<CloudConnectorService>(CloudConnectorService);
  });

  // ── configureConnector ──

  describe('configureConnector', () => {
    it('creates a cloud connector config and updates system profile', async () => {
      const system = mockSystem();
      const config = mockConfig();

      prisma.system.findFirst.mockResolvedValue(system);
      prisma.cloudConnectorConfig.upsert.mockResolvedValue(config);
      prisma.system.update.mockResolvedValue({
        ...system,
        connectivityProfile: 'CLOUD_CONNECTOR',
      });

      const result = await service.configureConnector(ORG_ID, {
        systemId: SYSTEM_ID,
        locationId: 'loc-eu10',
        virtualHost: 'sap-erp.internal',
        virtualPort: 3300,
      });

      expect(result).toEqual(config);
      expect(prisma.system.findFirst).toHaveBeenCalledWith({
        where: { id: SYSTEM_ID, organizationId: ORG_ID },
      });
      expect(prisma.cloudConnectorConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { systemId: SYSTEM_ID },
        }),
      );
      expect(prisma.system.update).toHaveBeenCalledWith({
        where: { id: SYSTEM_ID },
        data: { connectivityProfile: 'CLOUD_CONNECTOR' },
      });
    });

    it('throws NotFoundException when system does not belong to org', async () => {
      prisma.system.findFirst.mockResolvedValue(null);

      await expect(
        service.configureConnector(ORG_ID, {
          systemId: 'nonexistent',
          locationId: 'loc-eu10',
          virtualHost: 'sap-erp.internal',
          virtualPort: 3300,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── testConnection ──

  describe('testConnection', () => {
    it('returns honest test result with connectivityVerified=false for complete config', async () => {
      const config = mockConfig();
      prisma.cloudConnectorConfig.findFirst.mockResolvedValue(config);
      prisma.cloudConnectorConfig.update.mockResolvedValue({
        ...config,
        status: 'configured',
      });

      const result = await service.testConnection(ORG_ID, SYSTEM_ID);

      expect(result.connectivityVerified).toBe(false);
      expect(result.configurationValid).toBe(true);
      expect(result.verificationMethod).toBe('configuration_check_only');
      expect(result.message).toContain('connectivity cannot be verified');
      expect(result.capabilities).toBeDefined();
      expect(result.capabilities.osMetrics).toBe(false);
      expect(result.capabilities.hostAccess).toBe(false);
      expect(result.limitations).toBeInstanceOf(Array);
      expect(result.limitations.length).toBeGreaterThan(0);
      expect(prisma.cloudConnectorConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: config.id },
          data: expect.objectContaining({
            status: 'configured',
            latencyMs: null,
          }),
        }),
      );
    });

    it('returns configurationValid=false when config is incomplete', async () => {
      const incompleteConfig = mockConfig({
        locationId: '',
        virtualHost: '',
        virtualPort: 0,
      });
      prisma.cloudConnectorConfig.findFirst.mockResolvedValue(incompleteConfig);
      prisma.cloudConnectorConfig.update.mockResolvedValue({
        ...incompleteConfig,
        status: 'failed',
      });

      const result = await service.testConnection(ORG_ID, SYSTEM_ID);

      expect(result.configurationValid).toBe(false);
      expect(result.connectivityVerified).toBe(false);
      expect(result.message).toContain('incomplete');
      expect(prisma.cloudConnectorConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            lastTestResult: 'config_incomplete',
          }),
        }),
      );
    });

    it('throws NotFoundException when config does not exist', async () => {
      prisma.cloudConnectorConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.testConnection(ORG_ID, 'no-config-sys'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getConfig ──

  describe('getConfig', () => {
    it('returns config for a system', async () => {
      const config = mockConfig();
      prisma.cloudConnectorConfig.findFirst.mockResolvedValue(config);

      const result = await service.getConfig(ORG_ID, SYSTEM_ID);
      expect(result).toEqual(config);
      expect(prisma.cloudConnectorConfig.findFirst).toHaveBeenCalledWith({
        where: { systemId: SYSTEM_ID, organizationId: ORG_ID },
      });
    });

    it('returns null when no config exists', async () => {
      prisma.cloudConnectorConfig.findFirst.mockResolvedValue(null);

      const result = await service.getConfig(ORG_ID, 'no-config');
      expect(result).toBeNull();
    });
  });

  // ── listConfigs ──

  describe('listConfigs', () => {
    it('returns all configs for the organization', async () => {
      const configs = [
        mockConfig(),
        mockConfig({ id: 'cc-2', systemId: 'sys-2' }),
      ];
      prisma.cloudConnectorConfig.findMany.mockResolvedValue(configs);

      const result = await service.listConfigs(ORG_ID);
      expect(result).toHaveLength(2);
      expect(prisma.cloudConnectorConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_ID },
        }),
      );
    });

    it('enforces tenant isolation', async () => {
      prisma.cloudConnectorConfig.findMany.mockResolvedValue([]);
      await service.listConfigs('org-other');

      expect(prisma.cloudConnectorConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-other' },
        }),
      );
    });
  });

  // ── removeConfig ──

  describe('removeConfig', () => {
    it('deletes config and resets system connectivity profile', async () => {
      const config = mockConfig();
      prisma.cloudConnectorConfig.findFirst.mockResolvedValue(config);
      prisma.cloudConnectorConfig.delete.mockResolvedValue(config);
      prisma.system.update.mockResolvedValue(
        mockSystem({ connectivityProfile: 'NONE' }),
      );

      const result = await service.removeConfig(ORG_ID, SYSTEM_ID);
      expect(result).toEqual({ removed: true });
      expect(prisma.cloudConnectorConfig.delete).toHaveBeenCalledWith({
        where: { id: config.id },
      });
      expect(prisma.system.update).toHaveBeenCalledWith({
        where: { id: SYSTEM_ID },
        data: { connectivityProfile: 'NONE' },
      });
    });

    it('throws NotFoundException when config does not exist', async () => {
      prisma.cloudConnectorConfig.findFirst.mockResolvedValue(null);

      await expect(service.removeConfig(ORG_ID, 'no-config')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getCapabilityLimitations ──

  describe('getCapabilityLimitations', () => {
    it('returns available and unavailable capabilities', () => {
      const result = service.getCapabilityLimitations();

      expect(result.available).toBeInstanceOf(Array);
      expect(result.unavailable).toBeInstanceOf(Array);
      expect(result.reason).toBeDefined();
      expect(result.available.length).toBeGreaterThan(0);
      expect(result.unavailable.length).toBeGreaterThan(0);
      expect(result.unavailable).toContain(
        'OS-level metrics (CPU, RAM, disk, IOPS, network)',
      );
      expect(result.reason).toContain('RISE');
    });
  });
});
