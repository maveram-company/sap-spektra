import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RunbooksService } from './runbooks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ExecuteRunbookDto } from './dto/runbook.dto';

@ApiTags('Runbooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('runbooks')
export class RunbooksController {
  constructor(private readonly runbooksService: RunbooksService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List all runbooks' })
  findAll(@TenantId() orgId: string) {
    return this.runbooksService.findAll(orgId);
  }

  @Get('executions')
  @Roles('viewer')
  @ApiOperation({ summary: 'List all runbook executions' })
  executions(@TenantId() orgId: string) {
    return this.runbooksService.getExecutions(orgId);
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get runbook by ID' })
  findOne(@TenantId() orgId: string, @Param('id') id: string) {
    return this.runbooksService.findOne(orgId, id);
  }

  @Post(':id/execute')
  @Roles('operator')
  @ApiOperation({ summary: 'Execute a runbook on a system' })
  execute(
    @TenantId() orgId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: ExecuteRunbookDto,
  ) {
    return this.runbooksService.execute(
      orgId,
      id,
      data.systemId,
      user.email,
      data.dryRun,
    );
  }
}
