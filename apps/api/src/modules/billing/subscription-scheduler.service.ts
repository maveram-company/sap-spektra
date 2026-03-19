import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class SubscriptionSchedulerService {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Run every hour to check for expired trials
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredTrials() {
    const now = new Date();
    const expiredTrials = await this.prisma.subscription.findMany({
      where: {
        status: 'trialing',
        trialEndsAt: { lte: now },
      },
      include: { organization: { select: { id: true, name: true } } },
    });

    for (const sub of expiredTrials) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired' },
      });
      this.logger.warn(
        `Trial expired for org ${sub.organization.name} (${sub.organizationId})`,
      );
    }

    if (expiredTrials.length > 0) {
      this.logger.log(`Processed ${expiredTrials.length} expired trials`);
    }
  }

  // Run every 6 hours to suspend past_due subscriptions older than 7 days
  @Cron('0 */6 * * *')
  async handlePastDueSubscriptions() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pastDue = await this.prisma.subscription.findMany({
      where: {
        status: 'past_due',
        updatedAt: { lte: sevenDaysAgo },
      },
    });

    for (const sub of pastDue) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'suspended' },
      });
      this.logger.warn(
        `Suspended past_due subscription for org ${sub.organizationId}`,
      );
    }
  }
}
