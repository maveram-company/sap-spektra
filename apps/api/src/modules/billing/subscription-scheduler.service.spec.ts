import { Test } from '@nestjs/testing';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('SubscriptionSchedulerService', () => {
  let service: SubscriptionSchedulerService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      subscription: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        SubscriptionSchedulerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SubscriptionSchedulerService);
  });

  describe('handleExpiredTrials', () => {
    it('expires trials past trialEndsAt', async () => {
      const expiredSub = {
        id: 'sub-1',
        organizationId: 'org-1',
        status: 'trialing',
        trialEndsAt: new Date(Date.now() - 1000),
        organization: { id: 'org-1', name: 'Test Org' },
      };
      prisma.subscription.findMany.mockResolvedValue([expiredSub]);
      prisma.subscription.update.mockResolvedValue({
        ...expiredSub,
        status: 'expired',
      });

      await service.handleExpiredTrials();

      expect(prisma.subscription.findMany).toHaveBeenCalledWith({
        where: {
          status: 'trialing',
          trialEndsAt: { lte: expect.any(Date) },
        },
        include: { organization: { select: { id: true, name: true } } },
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'expired' },
      });
    });

    it('does not expire non-trial subscriptions', async () => {
      prisma.subscription.findMany.mockResolvedValue([]);

      await service.handleExpiredTrials();

      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('handlePastDueSubscriptions', () => {
    it('suspends past_due subscriptions older than 7 days', async () => {
      const pastDueSub = {
        id: 'sub-2',
        organizationId: 'org-2',
        status: 'past_due',
        updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      };
      prisma.subscription.findMany.mockResolvedValue([pastDueSub]);
      prisma.subscription.update.mockResolvedValue({
        ...pastDueSub,
        status: 'suspended',
      });

      await service.handlePastDueSubscriptions();

      expect(prisma.subscription.findMany).toHaveBeenCalledWith({
        where: {
          status: 'past_due',
          updatedAt: { lte: expect.any(Date) },
        },
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-2' },
        data: { status: 'suspended' },
      });
    });
  });
});
