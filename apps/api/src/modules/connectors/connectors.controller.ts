import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConnectorsService } from './connectors.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('Connectors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List all connectors' })
  findAll(@TenantId() orgId: string) {
    return this.connectorsService.findAll(orgId);
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get connector by ID' })
  findOne(@TenantId() orgId: string, @Param('id') id: string) {
    return this.connectorsService.findOne(orgId, id);
  }

  @Patch(':id/heartbeat')
  @Roles('operator')
  @ApiOperation({ summary: 'Update connector heartbeat' })
  heartbeat(@TenantId() orgId: string, @Param('id') id: string) {
    return this.connectorsService.heartbeat(orgId, id);
  }
}
