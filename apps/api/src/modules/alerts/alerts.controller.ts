import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ResolveAlertDto, AlertFiltersDto } from './dto/alert.dto';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List alerts with optional filters' })
  findAll(@TenantId() orgId: string, @Query() filters: AlertFiltersDto) {
    return this.alertsService.findAll(orgId, filters);
  }

  @Get('stats')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get alert statistics' })
  stats(@TenantId() orgId: string) {
    return this.alertsService.getStats(orgId);
  }

  @Patch(':id/acknowledge')
  @Roles('operator')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  acknowledge(
    @TenantId() orgId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.alertsService.acknowledge(orgId, id, user.email);
  }

  @Patch(':id/resolve')
  @Roles('operator')
  @ApiOperation({ summary: 'Resolve an alert' })
  resolve(
    @TenantId() orgId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: ResolveAlertDto,
  ) {
    return this.alertsService.resolve(orgId, id, user.email, data);
  }
}
