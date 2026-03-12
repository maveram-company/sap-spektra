import { Test, TestingModule } from '@nestjs/testing';
import { LicensesService } from './licenses.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-test-1';

function mockSystem(overrides = {}) {
  return {
    id: 'sys-1',
    sid: 'PRD',
    sapProduct: 'SAP S/4HANA',
    mode: 'PRODUCTION',
    environment: 'production',
    ...overrides,
  };
}

describe('LicensesService', () => {
  let service: LicensesService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      system: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicensesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LicensesService>(LicensesService);
  });

  // ── getLicenses ──

  describe('getLicenses', () => {
    it('returns license info for all systems in the organization', async () => {
      prisma.system.findMany.mockResolvedValue([mockSystem()]);

      const result = await service.getLicenses(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0].systemId).toBe('sys-1');
      expect(result[0].sid).toBe('PRD');
      expect(result[0].product).toBe('SAP S/4HANA');
    });

    it('enforces tenant isolation via organizationId', async () => {
      prisma.system.findMany.mockResolvedValue([]);

      await service.getLicenses('org-other');

      expect(prisma.system.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-other' },
        select: {
          id: true,
          sid: true,
          sapProduct: true,
          mode: true,
          environment: true,
        },
      });
    });

    it('returns empty array when organization has no systems', async () => {
      prisma.system.findMany.mockResolvedValue([]);

      const result = await service.getLicenses(ORG_ID);

      expect(result).toEqual([]);
    });

    // ── Production mode ──

    it('returns Production licenseType for non-TRIAL mode', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ mode: 'PRODUCTION' }),
      ]);

      const result = await service.getLicenses(ORG_ID);

      expect(result[0].licenseType).toBe('Production');
    });

    it('returns active status for non-TRIAL mode', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ mode: 'PRODUCTION' }),
      ]);

      const result = await service.getLicenses(ORG_ID);

      expect(result[0].status).toBe('active');
    });

    it('returns null expiresAt for non-TRIAL mode', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ mode: 'PRODUCTION' }),
      ]);

      const result = await service.getLicenses(ORG_ID);

      expect(result[0].expiresAt).toBeNull();
    });

    // ── Trial mode ──

    it('returns Trial licenseType for TRIAL mode', async () => {
      prisma.system.findMany.mockResolvedValue([mockSystem({ mode: 'TRIAL' })]);

      const result = await service.getLicenses(ORG_ID);

      expect(result[0].licenseType).toBe('Trial');
    });

    it('returns trial status for TRIAL mode', async () => {
      prisma.system.findMany.mockResolvedValue([mockSystem({ mode: 'TRIAL' })]);

      const result = await service.getLicenses(ORG_ID);

      expect(result[0].status).toBe('trial');
    });

    it('returns expiresAt ~30 days from now for TRIAL mode', async () => {
      prisma.system.findMany.mockResolvedValue([mockSystem({ mode: 'TRIAL' })]);

      const before = Date.now();
      const result = await service.getLicenses(ORG_ID);
      const after = Date.now();

      expect(result[0].expiresAt).not.toBeNull();
      const expiresAt = new Date(result[0].expiresAt as string).getTime();
      const expected30Days = 30 * 86400000;

      expect(expiresAt).toBeGreaterThanOrEqual(before + expected30Days - 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + expected30Days + 1000);
    });

    it('returns expiresAt as an ISO string for TRIAL mode', async () => {
      prisma.system.findMany.mockResolvedValue([mockSystem({ mode: 'TRIAL' })]);

      const result = await service.getLicenses(ORG_ID);

      expect(typeof result[0].expiresAt).toBe('string');
      // Verify it is a valid ISO date string
      expect(new Date(result[0].expiresAt as string).toISOString()).toBe(
        result[0].expiresAt,
      );
    });

    // ── Multiple systems with mixed modes ──

    it('handles mixed TRIAL and PRODUCTION systems', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ id: 'sys-1', sid: 'PRD', mode: 'PRODUCTION' }),
        mockSystem({ id: 'sys-2', sid: 'DEV', mode: 'TRIAL' }),
        mockSystem({ id: 'sys-3', sid: 'QAS', mode: 'STAGING' }),
      ]);

      const result = await service.getLicenses(ORG_ID);

      expect(result).toHaveLength(3);

      // Production system
      expect(result[0].licenseType).toBe('Production');
      expect(result[0].status).toBe('active');
      expect(result[0].expiresAt).toBeNull();

      // Trial system
      expect(result[1].licenseType).toBe('Trial');
      expect(result[1].status).toBe('trial');
      expect(result[1].expiresAt).not.toBeNull();

      // Non-standard mode maps to Production
      expect(result[2].licenseType).toBe('Production');
      expect(result[2].status).toBe('active');
      expect(result[2].expiresAt).toBeNull();
    });

    it('maps environment field correctly', async () => {
      prisma.system.findMany.mockResolvedValue([
        mockSystem({ environment: 'staging' }),
      ]);

      const result = await service.getLicenses(ORG_ID);

      expect(result[0].environment).toBe('staging');
    });

    it('selects only the needed fields from prisma', async () => {
      prisma.system.findMany.mockResolvedValue([]);

      await service.getLicenses(ORG_ID);

      expect(prisma.system.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            sid: true,
            sapProduct: true,
            mode: true,
            environment: true,
          },
        }),
      );
    });
  });
});
