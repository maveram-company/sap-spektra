import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Stripe types (without requiring stripe package — use fetch-based integration)
interface StripeCustomer {
  id: string;
  email: string;
  name: string;
  metadata: Record<string, string>;
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  items: { data: Array<{ id: string; price: { id: string } }> };
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.stripe.com/v1';
  private readonly enabled: boolean;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('stripe.secretKey', '');
    this.enabled = !!this.apiKey && this.apiKey !== '';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async stripeRequest<T>(
    method: string,
    path: string,
    body?: Record<string, string>,
  ): Promise<T> {
    if (!this.enabled) {
      this.logger.warn('Stripe not configured — returning mock response');
      return {} as T;
    }

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const options: RequestInit = { method, headers };
    if (body) {
      options.body = new URLSearchParams(body).toString();
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      this.logger.error(`Stripe API error: ${res.status}`, err);
      const errObj = err as { error?: { message?: string } };
      throw new Error(
        `Stripe error: ${errObj.error?.message || res.statusText}`,
      );
    }

    return res.json() as Promise<T>;
  }

  async createCustomer(
    email: string,
    name: string,
    organizationId: string,
  ): Promise<StripeCustomer> {
    return this.stripeRequest<StripeCustomer>('POST', '/customers', {
      email,
      name,
      'metadata[organizationId]': organizationId,
      'metadata[platform]': 'spektra',
    });
  }

  async createSubscription(
    customerId: string,
    priceId: string,
  ): Promise<StripeSubscription> {
    return this.stripeRequest<StripeSubscription>('POST', '/subscriptions', {
      customer: customerId,
      'items[0][price]': priceId,
      payment_behavior: 'default_incomplete',
    });
  }

  async cancelSubscription(
    subscriptionId: string,
  ): Promise<StripeSubscription> {
    return this.stripeRequest<StripeSubscription>(
      'DELETE',
      `/subscriptions/${subscriptionId}`,
    );
  }

  async getSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.stripeRequest<StripeSubscription>(
      'GET',
      `/subscriptions/${subscriptionId}`,
    );
  }

  async updateSubscription(
    subscriptionId: string,
    priceId: string,
  ): Promise<StripeSubscription> {
    return this.stripeRequest<StripeSubscription>(
      'POST',
      `/subscriptions/${subscriptionId}`,
      {
        'items[0][price]': priceId,
        proration_behavior: 'create_prorations',
      },
    );
  }
}
