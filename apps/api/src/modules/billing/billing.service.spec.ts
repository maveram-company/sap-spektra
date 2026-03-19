import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StripeService } from './stripe.service';

const ORG_ID = 'org-billing-1';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: Record<string, any>;
  let mockStripe: Record<string, jest.Mock>;

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
      agentRegistration: {
        count: jest.fn(),
      },
      plan: {
        findUnique: jest.fn(),
      },
      organization: {
        update: jest.fn(),
      },
    };

    const mockAudit = { log: jest.fn().mockResolvedValue({}) };
    mockStripe = {
      isEnabled: jest.fn().mockReturnValue(false),
      createCustomer: jest.fn(),
      createSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
      updateSubscription: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: StripeService, useValue: mockStripe },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
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
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: ORG_ID,
        stripeSubId: null,
      });
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

    it('cancels Stripe subscription if enabled and stripeSubId exists', async () => {
      mockStripe.isEnabled.mockReturnValue(true);
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: ORG_ID,
        stripeSubId: 'sub_stripe_123',
      });
      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        status: 'canceled',
        canceledAt: new Date(),
      });

      await service.cancelSubscription(ORG_ID);

      expect(mockStripe.cancelSubscription).toHaveBeenCalledWith(
        'sub_stripe_123',
      );
    });
  });

  // ── markPastDue ──

  describe('markPastDue', () => {
    it('updates subscription status to past_due', async () => {
      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        organizationId: ORG_ID,
        status: 'past_due',
      });

      const result = await service.markPastDue(ORG_ID);

      expect(result.status).toBe('past_due');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        data: { status: 'past_due' },
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
    it('counts systems, users, and agents and records usage', async () => {
      prisma.system.count.mockResolvedValue(3);
      prisma.membership.count.mockResolvedValue(7);
      prisma.agentRegistration.count.mockResolvedValue(2);
      prisma.usageRecord.upsert.mockResolvedValue({});

      const result = await service.refreshUsageSnapshot(ORG_ID);

      expect(result).toEqual({
        systems_count: 3,
        users_count: 7,
        agents_count: 2,
      });
      expect(prisma.system.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
      expect(prisma.membership.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
      expect(prisma.agentRegistration.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, status: { not: 'revoked' } },
      });
      expect(prisma.usageRecord.upsert).toHaveBeenCalledTimes(3);
    });
  });

  // ── subscribe ──

  describe('subscribe', () => {
    it('creates a trial subscription when Stripe is disabled', async () => {
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-1',
        tier: 'starter',
        name: 'Starter',
        price: 0,
        stripePriceId: null,
      });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({
        id: 'sub-new',
        organizationId: ORG_ID,
        planTier: 'starter',
        status: 'trialing',
      });
      prisma.organization.update.mockResolvedValue({});

      const result = await service.subscribe(
        ORG_ID,
        'user@example.com',
        'Test User',
        'starter',
      );

      expect(result.status).toBe('trialing');
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          planTier: 'starter',
          status: 'trialing',
        }),
      });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { plan: 'starter' },
      });
    });

    it('throws if plan tier is unknown', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(
        service.subscribe(ORG_ID, 'user@example.com', 'Test', 'nonexistent'),
      ).rejects.toThrow('Unknown plan tier: nonexistent');
    });

    it('throws if organization already has an active subscription', async () => {
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-1',
        tier: 'starter',
        price: 0,
        stripePriceId: null,
      });
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-existing',
        organizationId: ORG_ID,
        status: 'active',
      });

      await expect(
        service.subscribe(ORG_ID, 'user@example.com', 'Test', 'starter'),
      ).rejects.toThrow('already has an active subscription');
    });

    it('creates Stripe customer and subscription when Stripe is enabled', async () => {
      mockStripe.isEnabled.mockReturnValue(true);
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-1',
        tier: 'professional',
        price: 29900,
        stripePriceId: 'price_pro_123',
      });
      prisma.subscription.findUnique.mockResolvedValue(null);
      mockStripe.createCustomer.mockResolvedValue({ id: 'cus_stripe_1' });
      mockStripe.createSubscription.mockResolvedValue({ id: 'sub_stripe_1' });
      prisma.subscription.create.mockResolvedValue({
        id: 'sub-new',
        organizationId: ORG_ID,
        planTier: 'professional',
        status: 'active',
        stripeCustomerId: 'cus_stripe_1',
        stripeSubId: 'sub_stripe_1',
      });
      prisma.organization.update.mockResolvedValue({});

      const result = await service.subscribe(
        ORG_ID,
        'user@example.com',
        'Test',
        'professional',
      );

      expect(result.status).toBe('active');
      expect(mockStripe.createCustomer).toHaveBeenCalledWith(
        'user@example.com',
        'Test',
        ORG_ID,
      );
      expect(mockStripe.createSubscription).toHaveBeenCalledWith(
        'cus_stripe_1',
        'price_pro_123',
      );
    });
  });

  // ── changePlan ──

  describe('changePlan', () => {
    it('changes plan tier locally when Stripe is disabled', async () => {
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-2',
        tier: 'enterprise',
        price: 99900,
        stripePriceId: null,
      });
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: ORG_ID,
        planTier: 'professional',
        stripeSubId: null,
      });
      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        organizationId: ORG_ID,
        planTier: 'enterprise',
      });
      prisma.organization.update.mockResolvedValue({});

      const result = await service.changePlan(ORG_ID, 'enterprise');

      expect(result.planTier).toBe('enterprise');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        data: { planTier: 'enterprise' },
      });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { plan: 'enterprise' },
      });
    });

    it('throws if plan tier is unknown', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(service.changePlan(ORG_ID, 'mega')).rejects.toThrow(
        'Unknown plan tier: mega',
      );
    });

    it('throws if no subscription exists', async () => {
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-1',
        tier: 'starter',
        price: 0,
      });
      prisma.subscription.findUnique.mockResolvedValue(null);

      await expect(service.changePlan(ORG_ID, 'starter')).rejects.toThrow(
        'No subscription found',
      );
    });

    it('updates Stripe subscription when Stripe is enabled', async () => {
      mockStripe.isEnabled.mockReturnValue(true);
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-3',
        tier: 'enterprise',
        price: 99900,
        stripePriceId: 'price_ent_123',
      });
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: ORG_ID,
        planTier: 'professional',
        stripeSubId: 'sub_stripe_1',
      });
      mockStripe.updateSubscription.mockResolvedValue({});
      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        planTier: 'enterprise',
      });
      prisma.organization.update.mockResolvedValue({});

      await service.changePlan(ORG_ID, 'enterprise');

      expect(mockStripe.updateSubscription).toHaveBeenCalledWith(
        'sub_stripe_1',
        'price_ent_123',
      );
    });
  });

  // ── getInvoices ──

  describe('getInvoices', () => {
    it('returns empty list when no subscription exists', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);

      const result = await service.getInvoices(ORG_ID);

      expect(result).toEqual({ invoices: [], total: 0 });
    });

    it('returns synthetic invoice from subscription record', async () => {
      const now = new Date();
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: ORG_ID,
        planTier: 'professional',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: now,
        createdAt: now,
      });

      const result = await service.getInvoices(ORG_ID);

      expect(result.total).toBe(1);
      expect(result.invoices[0]).toEqual(
        expect.objectContaining({
          subscriptionId: 'sub-1',
          planTier: 'professional',
          status: 'active',
        }),
      );
    });

    it('respects limit parameter', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: ORG_ID,
        planTier: 'starter',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        createdAt: new Date(),
      });

      const result = await service.getInvoices(ORG_ID, 1);

      expect(result.invoices.length).toBeLessThanOrEqual(1);
    });
  });
});
