import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getSubscription(organizationId: string) {
    return this.prisma.subscription.findUnique({
      where: { organizationId },
    });
  }

  async createTrialSubscription(organizationId: string, planTier: string) {
    const trialDays = 14;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const subscription = await this.prisma.subscription.create({
      data: {
        organizationId,
        planTier,
        status: 'trialing',
        trialEndsAt,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEndsAt,
      },
    });

    this.audit
      .log(organizationId, {
        userEmail: 'system',
        action: 'subscription.trial_started',
        resource: `subscription/${subscription.id}`,
        severity: 'info',
        details: `Trial started: planTier=${planTier}, trialEndsAt=${trialEndsAt.toISOString()}`,
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return subscription;
  }

  async activateSubscription(
    organizationId: string,
    stripeCustomerId: string,
    stripeSubId: string,
  ) {
    const subscription = await this.prisma.subscription.update({
      where: { organizationId },
      data: {
        status: 'active',
        stripeCustomerId,
        stripeSubId,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    this.audit
      .log(organizationId, {
        userEmail: 'system',
        action: 'subscription.activated',
        resource: `subscription/${subscription.id}`,
        severity: 'info',
        details: `Subscription activated: stripeCustomerId=${stripeCustomerId}`,
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return subscription;
  }

  async cancelSubscription(organizationId: string) {
    const subscription = await this.prisma.subscription.update({
      where: { organizationId },
      data: { status: 'canceled', canceledAt: new Date() },
    });

    this.audit
      .log(organizationId, {
        userEmail: 'system',
        action: 'subscription.canceled',
        resource: `subscription/${subscription.id}`,
        severity: 'warning',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return subscription;
  }

  async suspendSubscription(organizationId: string) {
    return this.prisma.subscription.update({
      where: { organizationId },
      data: { status: 'suspended' },
    });
  }

  async getUsage(organizationId: string, period?: string) {
    const currentPeriod = period || new Date().toISOString().slice(0, 7);
    return this.prisma.usageRecord.findMany({
      where: { organizationId, period: currentPeriod },
    });
  }

  async recordUsage(organizationId: string, metric: string, value: number) {
    const period = new Date().toISOString().slice(0, 7);
    return this.prisma.usageRecord.upsert({
      where: {
        organizationId_metric_period: { organizationId, metric, period },
      },
      update: { value, recordedAt: new Date() },
      create: { organizationId, metric, value, period },
    });
  }

  async refreshUsageSnapshot(organizationId: string) {
    const [systemsCount, usersCount] = await Promise.all([
      this.prisma.system.count({ where: { organizationId } }),
      this.prisma.membership.count({ where: { organizationId } }),
    ]);

    await Promise.all([
      this.recordUsage(organizationId, 'systems_count', systemsCount),
      this.recordUsage(organizationId, 'users_count', usersCount),
    ]);

    return { systems_count: systemsCount, users_count: usersCount };
  }
}
