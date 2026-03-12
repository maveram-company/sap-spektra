import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import {
  MetricsHoursQueryDto,
  BreachesQueryDto,
  SystemMetaQueryDto,
} from './dto/metrics.dto';

@ApiTags('Metrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('hosts/:hostId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get host metrics time-series' })
  hostMetrics(
    @Param('hostId') hostId: string,
    @Query() query: MetricsHoursQueryDto,
  ) {
    return this.metricsService.getHostMetrics(
      hostId,
      query.hours ? parseInt(query.hours, 10) : 24,
    );
  }

  @Get('systems/:systemId/hosts')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get all host metrics for a system' })
  systemHostMetrics(
    @TenantId() orgId: string,
    @Param('systemId') systemId: string,
    @Query() query: MetricsHoursQueryDto,
  ) {
    return this.metricsService.getHostMetricsBySystem(
      orgId,
      systemId,
      query.hours ? parseInt(query.hours, 10) : 24,
    );
  }

  @Get('systems/:systemId/health')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get health snapshots for a system' })
  healthSnapshots(
    @TenantId() orgId: string,
    @Param('systemId') systemId: string,
    @Query() query: MetricsHoursQueryDto,
  ) {
    return this.metricsService.getHealthSnapshots(
      orgId,
      systemId,
      query.hours ? parseInt(query.hours, 10) : 24,
    );
  }

  @Get('breaches')
  @Roles('viewer')
  @ApiOperation({ summary: 'List threshold breaches' })
  breaches(@TenantId() orgId: string, @Query() query: BreachesQueryDto) {
    return this.metricsService.getBreaches(
      orgId,
      query.systemId,
      query.resolved !== undefined ? query.resolved === 'true' : undefined,
    );
  }

  @Get('systems/:systemId/dependencies')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get system dependencies' })
  dependencies(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.metricsService.getDependencies(orgId, systemId);
  }

  @Get('systems/:systemId/hosts-detail')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get hosts with instances for a system' })
  hosts(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.metricsService.getHosts(orgId, systemId);
  }

  @Get('systems/:systemId/components')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get components with instances for a system' })
  components(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.metricsService.getComponents(orgId, systemId);
  }

  @Get('system-meta')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get system meta (all or by systemId)' })
  systemMeta(@TenantId() orgId: string, @Query() query: SystemMetaQueryDto) {
    return this.metricsService.getSystemMeta(orgId, query.systemId);
  }
}
