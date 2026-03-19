import { Controller, Get, Post, Body, Patch, UseGuards } from '@nestjs/common';
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

  @Post('activate')
  @Roles('admin')
  @ApiOperation({ summary: 'Activate subscription with Stripe' })
  activate(
    @TenantId() orgId: string,
    @Body() body: { stripeCustomerId: string; stripeSubId: string },
  ) {
    return this.billing.activateSubscription(
      orgId,
      body.stripeCustomerId,
      body.stripeSubId,
    );
  }

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
}
