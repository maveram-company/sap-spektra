import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-key-value'),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('abcdef1234567890abcdef1234567890abcdef1234567890'),
  }),
}));

const ORG_ID = 'org-test-1';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      apiKey: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    jest.clearAllMocks();
  });

  // ── getSettings ──

  describe('getSettings', () => {
    it('returns organization settings', async () => {
      const orgData = {
        settings: { theme: 'dark' },
        limits: { maxSystems: 10 },
        plan: 'pro',
        timezone: 'America/Bogota',
        language: 'es',
      };
      prisma.organization.findUnique.mockResolvedValue(orgData);

      const result = await service.getSettings(ORG_ID);

      expect(result).toEqual(orgData);
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        select: { settings: true, limits: true, plan: true, timezone: true, language: true },
      });
    });

    it('throws NotFoundException when organization not found', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getSettings(ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateSettings ──

  describe('updateSettings', () => {
    it('calls prisma update with settings', async () => {
      const settings = { theme: 'light', notifications: true };
      const updated = { id: ORG_ID, settings };
      prisma.organization.update.mockResolvedValue(updated);

      const result = await service.updateSettings(ORG_ID, settings);

      expect(result).toEqual(updated);
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { settings },
      });
    });
  });

  // ── getApiKeys ──

  describe('getApiKeys', () => {
    it('returns API keys for organization', async () => {
      const keys = [
        { id: 'key-1', name: 'Production', prefix: 'sk-spektra-', status: 'active', createdAt: new Date(), lastUsedAt: null },
        { id: 'key-2', name: 'Staging', prefix: 'sk-spektra-', status: 'active', createdAt: new Date(), lastUsedAt: null },
      ];
      prisma.apiKey.findMany.mockResolvedValue(keys);

      const result = await service.getApiKeys(ORG_ID);

      expect(result).toHaveLength(2);
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        select: { id: true, name: true, prefix: true, status: true, createdAt: true, lastUsedAt: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ── createApiKey ──

  describe('createApiKey', () => {
    it('returns key with raw key value', async () => {
      const now = new Date();
      prisma.apiKey.create.mockResolvedValue({
        id: 'key-new',
        name: 'My Key',
        createdAt: now,
      });

      const result = await service.createApiKey(ORG_ID, 'My Key');

      expect(result).toEqual({
        id: 'key-new',
        name: 'My Key',
        prefix: expect.any(String),
        key: expect.stringContaining('sk-spektra-'),
        createdAt: now,
      });
      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          name: 'My Key',
          keyHash: expect.any(String),
          prefix: expect.any(String),
          status: 'active',
        }),
      });
    });
  });

  // ── revokeApiKey ──

  describe('revokeApiKey', () => {
    it('revokes an existing API key', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: 'key-1', organizationId: ORG_ID });
      prisma.apiKey.update.mockResolvedValue({ id: 'key-1', status: 'inactive' });

      const result = await service.revokeApiKey(ORG_ID, 'key-1');

      expect(result.status).toBe('inactive');
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { status: 'inactive' },
      });
    });

    it('throws NotFoundException when key not found', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.revokeApiKey(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
