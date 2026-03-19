import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ORG_ID = 'org-billing-1';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      subscription: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      usageRecord: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      system: {
        count: jest.fn(),
      },
      membership: {
        count: jest.fn(),
      },
    };

    const mockAudit = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    jest.clearAllMocks();
  });

  // ── createTrialSubscription ──

  describe('createTrialSubscription', () => {
    it('creates a trial subscription with 14-day expiry', async () => {
      const mockSub = {
        id: 'sub-1',
        organizationId: ORG_ID,
        planTier: 'starter',
        status: 'trialing',
        trialEndsAt: new Date(),
      };
      prisma.subscription.create.mockResolvedValue(mockSub);

      const result = await service.createTrialSubscription(ORG_ID, 'starter');

      expect(result).toEqual(mockSub);
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          planTier: 'starter',
          status: 'trialing',
          trialEndsAt: expect.any(Date),
          currentPeriodStart: expect.any(Date),
          currentPeriodEnd: expect.any(Date),
        }),
      });
    });
  });

  // ── activateSubscription ──

  describe('activateSubscription', () => {
    it('activates subscription with Stripe details', async () => {
      const mockSub = {
        id: 'sub-1',
        organizationId: ORG_ID,
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubId: 'sub_456',
      };
      prisma.subscription.update.mockResolvedValue(mockSub);

      const result = await service.activateSubscription(
        ORG_ID,
        'cus_123',
        'sub_456',
      );

      expect(result.status).toBe('active');
      expect(result.stripeCustomerId).toBe('cus_123');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        data: expect.objectContaining({
          status: 'active',
          stripeCustomerId: 'cus_123',
          stripeSubId: 'sub_456',
        }),
      });
    });
  });

  // ── cancelSubscription ──

  describe('cancelSubscription', () => {
    it('cancels subscription and sets canceledAt', async () => {
      const mockSub = {
        id: 'sub-1',
        organizationId: ORG_ID,
        status: 'canceled',
        canceledAt: new Date(),
      };
      prisma.subscription.update.mockResolvedValue(mockSub);

      const result = await service.cancelSubscription(ORG_ID);

      expect(result.status).toBe('canceled');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        data: { status: 'canceled', canceledAt: expect.any(Date) },
      });
    });
  });

  // ── suspendSubscription ──

  describe('suspendSubscription', () => {
    it('suspends subscription', async () => {
      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        status: 'suspended',
      });

      const result = await service.suspendSubscription(ORG_ID);

      expect(result.status).toBe('suspended');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        data: { status: 'suspended' },
      });
    });
  });

  // ── getUsage ──

  describe('getUsage', () => {
    it('returns usage records for current period', async () => {
      const records = [
        { metric: 'systems_count', value: 5, period: '2026-03' },
      ];
      prisma.usageRecord.findMany.mockResolvedValue(records);

      const result = await service.getUsage(ORG_ID);

      expect(result).toEqual(records);
      expect(prisma.usageRecord.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          period: expect.stringMatching(/^\d{4}-\d{2}$/),
        },
      });
    });
  });

  // ── recordUsage ──

  describe('recordUsage', () => {
    it('upserts a usage record', async () => {
      const record = {
        id: 'ur-1',
        organizationId: ORG_ID,
        metric: 'systems_count',
        value: 10,
      };
      prisma.usageRecord.upsert.mockResolvedValue(record);

      const result = await service.recordUsage(ORG_ID, 'systems_count', 10);

      expect(result).toEqual(record);
      expect(prisma.usageRecord.upsert).toHaveBeenCalledWith({
        where: {
          organizationId_metric_period: {
            organizationId: ORG_ID,
            metric: 'systems_count',
            period: expect.stringMatching(/^\d{4}-\d{2}$/),
          },
        },
        update: { value: 10, recordedAt: expect.any(Date) },
        create: {
          organizationId: ORG_ID,
          metric: 'systems_count',
          value: 10,
          period: expect.stringMatching(/^\d{4}-\d{2}$/),
        },
      });
    });
  });

  // ── refreshUsageSnapshot ──

  describe('refreshUsageSnapshot', () => {
    it('counts systems and users and records usage', async () => {
      prisma.system.count.mockResolvedValue(3);
      prisma.membership.count.mockResolvedValue(7);
      prisma.usageRecord.upsert.mockResolvedValue({});

      const result = await service.refreshUsageSnapshot(ORG_ID);

      expect(result).toEqual({ systems_count: 3, users_count: 7 });
      expect(prisma.system.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
      expect(prisma.membership.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
      expect(prisma.usageRecord.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
