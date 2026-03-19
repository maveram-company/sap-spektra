import {
  Controller,
  Post,
  Headers,
  RawBodyRequest,
  Req,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { BillingService } from './billing.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {
    this.webhookSecret = this.config.get<string>('stripe.webhookSecret', '');
  }

  @Post('stripe')
  @ApiExcludeEndpoint()
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    // Verify signature
    if (!this.webhookSecret) {
      this.logger.warn(
        'Stripe webhook secret not configured — rejecting all webhooks',
      );
      throw new ForbiddenException('Webhook verification not configured');
    }

    if (!signature) {
      throw new ForbiddenException('Missing stripe-signature header');
    }

    // Parse Stripe signature header: t=timestamp,v1=signature
    const elements = signature.split(',').reduce(
      (acc, part) => {
        const [key, value] = part.split('=');
        acc[key] = value;
        return acc;
      },
      {} as Record<string, string>,
    );

    const timestamp = elements['t'];
    const receivedSig = elements['v1'];

    if (!timestamp || !receivedSig) {
      throw new ForbiddenException('Invalid stripe-signature format');
    }

    // Prevent replay attacks: reject if timestamp is older than 5 minutes
    const tolerance = 300; // 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp, 10)) > tolerance) {
      throw new ForbiddenException(
        'Webhook timestamp too old — possible replay attack',
      );
    }

    // Compute expected signature
    const payload =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSig = createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    // Timing-safe comparison
    try {
      const sigBuffer = Buffer.from(receivedSig, 'hex');
      const expectedBuffer = Buffer.from(expectedSig, 'hex');
      if (
        sigBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        throw new ForbiddenException('Invalid webhook signature');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid webhook signature');
    }

    // Signature verified — process event
    const event = req.body as {
      type: string;
      data: { object: Record<string, unknown> };
    };
    this.logger.log(`Verified Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const orgId = (sub.metadata as Record<string, string>)?.organizationId;
        if (orgId && sub.status === 'active') {
          await this.billing.activateSubscription(
            orgId,
            sub.customer as string,
            sub.id as string,
          );
        }
        if (orgId && sub.status === 'past_due') {
          // Mark subscription as past_due — dunning starts
          this.logger.warn(`Subscription past_due for org ${orgId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const orgId = (sub.metadata as Record<string, string>)?.organizationId;
        if (orgId) {
          await this.billing.cancelSubscription(orgId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        this.logger.warn(
          `Payment failed for customer ${String(invoice.customer)}`,
        );
        break;
      }

      case 'invoice.paid': {
        const paidInvoice = event.data.object;
        this.logger.log(`Invoice paid: ${String(paidInvoice.id)}`);
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }
}
