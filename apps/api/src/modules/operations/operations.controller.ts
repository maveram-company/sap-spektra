import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OperationsService } from './operations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List operations' })
  findAll(@TenantId() orgId: string, @Query('status') status?: string, @Query('type') type?: string, @Query('systemId') systemId?: string) {
    return this.operationsService.findAll(orgId, { status, type, systemId });
  }

  @Post()
  @Roles('operator')
  @ApiOperation({ summary: 'Schedule a new operation' })
  create(@TenantId() orgId: string, @CurrentUser() user: JwtPayload, @Body() data: { systemId: string; type: string; description: string; riskLevel?: string; scheduledTime?: Date; schedule?: string }) {
    return this.operationsService.create(orgId, { ...data, requestedBy: user.email });
  }

  @Patch(':id/status')
  @Roles('operator')
  @ApiOperation({ summary: 'Update operation status' })
  updateStatus(@TenantId() orgId: string, @Param('id') id: string, @Body() data: { status: string }) {
    return this.operationsService.updateStatus(orgId, id, data.status);
  }

  @Get('jobs')
  @Roles('viewer')
  @ApiOperation({ summary: 'List background job records' })
  jobs(@Query('systemId') systemId?: string) {
    return this.operationsService.getJobs(systemId);
  }

  @Get('transports')
  @Roles('viewer')
  @ApiOperation({ summary: 'List transport records' })
  transports(@Query('systemId') systemId?: string) {
    return this.operationsService.getTransports(systemId);
  }

  @Get('certificates')
  @Roles('viewer')
  @ApiOperation({ summary: 'List certificate records' })
  certificates(@Query('systemId') systemId?: string) {
    return this.operationsService.getCertificates(systemId);
  }
}
