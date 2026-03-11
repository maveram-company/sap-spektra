import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List approval requests' })
  findAll(@TenantId() orgId: string, @Query('status') status?: string, @Query('systemId') systemId?: string) {
    return this.approvalsService.findAll(orgId, { status, systemId });
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get approval request by ID' })
  findOne(@TenantId() orgId: string, @Param('id') id: string) {
    return this.approvalsService.findOne(orgId, id);
  }

  @Post()
  @Roles('operator')
  @ApiOperation({ summary: 'Create an approval request' })
  create(@TenantId() orgId: string, @CurrentUser() user: JwtPayload, @Body() data: { systemId: string; description: string; severity: string; runbookId?: string; metric?: string; value?: number }) {
    return this.approvalsService.create(orgId, { ...data, requestedBy: user.email });
  }

  @Patch(':id/approve')
  @Roles('escalation')
  @ApiOperation({ summary: 'Approve a request' })
  approve(@TenantId() orgId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.approvalsService.process(orgId, id, 'APPROVED', user.email);
  }

  @Patch(':id/reject')
  @Roles('escalation')
  @ApiOperation({ summary: 'Reject a request' })
  reject(@TenantId() orgId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.approvalsService.process(orgId, id, 'REJECTED', user.email);
  }
}
