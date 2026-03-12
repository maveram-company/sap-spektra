import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { UpdateTenantDto } from './dto/tenant.dto';

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('tenant')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'Get current organization details' })
  findOne(@TenantId() orgId: string) {
    return this.tenantsService.findOne(orgId);
  }

  @Patch()
  @Roles('admin')
  @ApiOperation({ summary: 'Update organization settings' })
  update(@TenantId() orgId: string, @Body() data: UpdateTenantDto) {
    return this.tenantsService.update(orgId, data);
  }

  @Get('stats')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get organization statistics' })
  stats(@TenantId() orgId: string) {
    return this.tenantsService.getStats(orgId);
  }
}
