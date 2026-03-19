import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { WebhookController } from './webhook.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule, ConfigModule],
  controllers: [BillingController, WebhookController],
  providers: [BillingService, StripeService],
  exports: [BillingService],
})
export class BillingModule {}
