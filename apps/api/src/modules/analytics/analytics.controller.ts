import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { SystemTrendsQueryDto } from './dto/analytics.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get analytics overview' })
  overview(@TenantId() orgId: string) {
    return this.analyticsService.getOverview(orgId);
  }

  @Get('runbooks')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get runbook execution analytics' })
  runbooks(@TenantId() orgId: string) {
    return this.analyticsService.getRunbookAnalytics(orgId);
  }

  @Get('systems/:systemId/trends')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get system health trends' })
  systemTrends(
    @TenantId() orgId: string,
    @Param('systemId') systemId: string,
    @Query() query: SystemTrendsQueryDto,
  ) {
    return this.analyticsService.getSystemTrends(
      orgId,
      systemId,
      query.days || 7,
    );
  }
}
