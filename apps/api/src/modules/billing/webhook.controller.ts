import { Controller, Post, Body, Headers, Logger } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { BillingService } from './billing.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly billing: BillingService) {}

  @Post('stripe')
  @ApiExcludeEndpoint()
  async handleStripeWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('stripe-signature') _signature: string,
  ) {
    const event = body as {
      type: string;
      data: { object: Record<string, unknown> };
    };
    this.logger.log(`Stripe webhook: ${event.type}`);

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
