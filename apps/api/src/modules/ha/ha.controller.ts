import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HAService } from './ha.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { UpdateHAStatusDto } from './dto/ha.dto';

@ApiTags('HA/DR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('ha')
export class HAController {
  constructor(private readonly haService: HAService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List all HA configurations' })
  findAll(@TenantId() orgId: string) {
    return this.haService.findAll(orgId);
  }

  @Get(':systemId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get HA config for a system' })
  findBySystem(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.haService.findBySystem(orgId, systemId);
  }

  @Patch(':systemId/failover')
  @Roles('admin')
  @ApiOperation({ summary: 'Trigger failover for a system' })
  triggerFailover(
    @TenantId() orgId: string,
    @Param('systemId') systemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.haService.triggerFailover(orgId, systemId, user.email);
  }

  @Patch(':systemId/status')
  @Roles('operator')
  @ApiOperation({ summary: 'Update HA status' })
  updateStatus(
    @TenantId() orgId: string,
    @Param('systemId') systemId: string,
    @Body() data: UpdateHAStatusDto,
  ) {
    return this.haService.updateStatus(orgId, systemId, data.status);
  }

  @Get(':systemId/prereqs')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get HA prerequisites checklist for a system' })
  getPrereqs(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.haService.getPrereqs(orgId, systemId);
  }

  @Get(':systemId/ops-history')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get HA operations history for a system' })
  getOpsHistory(
    @TenantId() orgId: string,
    @Param('systemId') systemId: string,
  ) {
    return this.haService.getOpsHistory(orgId, systemId);
  }

  @Get(':systemId/drivers')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get HA driver information for a system' })
  getDrivers(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.haService.getDrivers(orgId, systemId);
  }
}
