import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StripeService } from './stripe.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
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
      .catch((err: Error) =>
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
      .catch((err: Error) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return subscription;
  }

  async cancelSubscription(organizationId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    // If there is an active Stripe subscription, cancel it in Stripe
    if (existing?.stripeSubId && this.stripe.isEnabled()) {
      await this.stripe.cancelSubscription(existing.stripeSubId);
    }

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
      .catch((err: Error) =>
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
    const [systemsCount, usersCount, agentCount] = await Promise.all([
      this.prisma.system.count({ where: { organizationId } }),
      this.prisma.membership.count({ where: { organizationId } }),
      this.prisma.agentRegistration.count({
        where: { organizationId, status: { not: 'revoked' } },
      }),
    ]);

    await Promise.all([
      this.recordUsage(organizationId, 'systems_count', systemsCount),
      this.recordUsage(organizationId, 'users_count', usersCount),
      this.recordUsage(organizationId, 'agents_count', agentCount),
    ]);

    return {
      systems_count: systemsCount,
      users_count: usersCount,
      agents_count: agentCount,
    };
  }

  // ── Phase 5: Stripe-powered subscription management ──

  async subscribe(
    organizationId: string,
    email: string,
    name: string,
    planTier: string,
  ) {
    // Look up the plan to get the Stripe price ID
    const plan = await this.prisma.plan.findUnique({
      where: { tier: planTier },
    });
    if (!plan) {
      throw new BadRequestException(`Unknown plan tier: ${planTier}`);
    }

    // Resolve the Stripe price ID: prefer DB value, fall back to config
    const priceId =
      plan.stripePriceId ||
      this.config.get<string>(`stripe.prices.${planTier}`, '');

    if (!priceId && this.stripe.isEnabled()) {
      throw new BadRequestException(
        `No Stripe price configured for tier: ${planTier}`,
      );
    }

    // Check for existing subscription
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });
    if (existing && existing.status === 'active') {
      throw new BadRequestException(
        'Organization already has an active subscription',
      );
    }

    let stripeCustomerId: string | undefined;
    let stripeSubId: string | undefined;

    if (this.stripe.isEnabled() && priceId) {
      const customer = await this.stripe.createCustomer(
        email,
        name,
        organizationId,
      );
      stripeCustomerId = customer.id;

      const subscription = await this.stripe.createSubscription(
        customer.id,
        priceId,
      );
      stripeSubId = subscription.id;
    }

    // Upsert the subscription record
    const subscription = existing
      ? await this.prisma.subscription.update({
          where: { organizationId },
          data: {
            planTier,
            status: stripeSubId ? 'active' : 'trialing',
            stripeCustomerId: stripeCustomerId ?? null,
            stripeSubId: stripeSubId ?? null,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        })
      : await this.prisma.subscription.create({
          data: {
            organizationId,
            planTier,
            status: stripeSubId ? 'active' : 'trialing',
            stripeCustomerId: stripeCustomerId ?? null,
            stripeSubId: stripeSubId ?? null,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            trialEndsAt: stripeSubId
              ? null
              : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });

    // Update the organization plan tier
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { plan: planTier },
    });

    this.audit
      .log(organizationId, {
        userEmail: email,
        action: 'subscription.created',
        resource: `subscription/${subscription.id}`,
        severity: 'info',
        details: `Subscribed to ${planTier} plan${stripeSubId ? ` (Stripe: ${stripeSubId})` : ' (trial)'}`,
      })
      .catch((err: Error) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return subscription;
  }

  async changePlan(organizationId: string, newTier: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { tier: newTier },
    });
    if (!plan) {
      throw new BadRequestException(`Unknown plan tier: ${newTier}`);
    }

    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });
    if (!existing) {
      throw new BadRequestException('No subscription found for organization');
    }

    // Resolve the Stripe price ID
    const priceId =
      plan.stripePriceId ||
      this.config.get<string>(`stripe.prices.${newTier}`, '');

    // Update in Stripe if applicable
    if (existing.stripeSubId && this.stripe.isEnabled() && priceId) {
      await this.stripe.updateSubscription(existing.stripeSubId, priceId);
    }

    // Update local subscription and organization
    const [subscription] = await Promise.all([
      this.prisma.subscription.update({
        where: { organizationId },
        data: { planTier: newTier },
      }),
      this.prisma.organization.update({
        where: { id: organizationId },
        data: { plan: newTier },
      }),
    ]);

    this.audit
      .log(organizationId, {
        userEmail: 'system',
        action: 'subscription.plan_changed',
        resource: `subscription/${subscription.id}`,
        severity: 'info',
        details: `Plan changed from ${existing.planTier} to ${newTier}`,
      })
      .catch((err: Error) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return subscription;
  }

  async getInvoices(organizationId: string, limit = 10) {
    // Return subscription history as a placeholder for full Stripe invoice listing.
    // In production, this would call Stripe's /invoices endpoint for the customer.
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription) {
      return { invoices: [], total: 0 };
    }

    // Build a synthetic invoice entry from the subscription record
    const invoices = [
      {
        id: `inv_${subscription.id.slice(0, 8)}`,
        subscriptionId: subscription.id,
        planTier: subscription.planTier,
        status: subscription.status,
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        createdAt: subscription.createdAt,
      },
    ].slice(0, limit);

    return { invoices, total: invoices.length };
  }
}
