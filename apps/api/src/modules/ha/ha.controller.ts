import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HAService } from './ha.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

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
  triggerFailover(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.haService.triggerFailover(orgId, systemId);
  }

  @Patch(':systemId/status')
  @Roles('operator')
  @ApiOperation({ summary: 'Update HA status' })
  updateStatus(@TenantId() orgId: string, @Param('systemId') systemId: string, @Body() data: { status: string }) {
    return this.haService.updateStatus(orgId, systemId, data.status);
  }
}
