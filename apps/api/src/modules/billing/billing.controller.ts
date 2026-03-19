import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('subscription')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get current subscription' })
  getSubscription(@TenantId() orgId: string) {
    return this.billing.getSubscription(orgId);
  }

  @Get('usage')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get usage for current period' })
  getUsage(@TenantId() orgId: string) {
    return this.billing.getUsage(orgId);
  }

  // NOTE: POST /billing/activate removed — subscription activation now happens
  // exclusively via verified Stripe webhook (see webhook.controller.ts)

  @Patch('cancel')
  @Roles('admin')
  @ApiOperation({ summary: 'Cancel subscription' })
  cancel(@TenantId() orgId: string) {
    return this.billing.cancelSubscription(orgId);
  }

  @Get('usage/refresh')
  @Roles('admin')
  @ApiOperation({ summary: 'Refresh usage snapshot' })
  refreshUsage(@TenantId() orgId: string) {
    return this.billing.refreshUsageSnapshot(orgId);
  }

  @Post('subscribe')
  @Roles('admin')
  @ApiOperation({ summary: 'Create Stripe customer and start subscription' })
  subscribe(
    @TenantId() orgId: string,
    @Body() body: { email: string; name: string; planTier: string },
  ) {
    return this.billing.subscribe(orgId, body.email, body.name, body.planTier);
  }

  @Patch('upgrade')
  @Roles('admin')
  @ApiOperation({ summary: 'Change plan tier (upgrade or downgrade)' })
  upgrade(@TenantId() orgId: string, @Body() body: { newTier: string }) {
    return this.billing.changePlan(orgId, body.newTier);
  }

  @Get('invoices')
  @Roles('viewer')
  @ApiOperation({ summary: 'List invoices / subscription history' })
  invoices(@TenantId() orgId: string, @Query('limit') limit?: string) {
    return this.billing.getInvoices(orgId, limit ? parseInt(limit, 10) : 10);
  }
}
