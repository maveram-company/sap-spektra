import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HybridAuthGuard } from '../../common/guards/hybrid-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RegisterAgentDto, AgentHeartbeatDto } from './dto/agents.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post('register')
  @UseGuards(HybridAuthGuard, TenantGuard, RolesGuard)
  @Roles('operator')
  @ApiOperation({ summary: 'Register a new agent for a host' })
  register(@TenantId() orgId: string, @Body() data: RegisterAgentDto) {
    return this.agents.registerAgent(orgId, data);
  }

  @Post('heartbeat')
  @UseGuards(HybridAuthGuard, TenantGuard, RolesGuard)
  @Roles('operator')
  @ApiOperation({ summary: 'Record agent heartbeat' })
  heartbeat(@TenantId() orgId: string, @Body() data: AgentHeartbeatDto) {
    return this.agents.recordHeartbeat(orgId, data.hostId, data);
  }

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List all agents for organization' })
  list(@TenantId() orgId: string) {
    return this.agents.listAgents(orgId);
  }

  @Get('summary')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get agent health summary' })
  summary(@TenantId() orgId: string) {
    return this.agents.getAgentSummary(orgId);
  }

  @Get('version/check')
  @Roles('viewer')
  @ApiOperation({ summary: 'Check agent version compatibility' })
  checkVersion(@Query('version') version: string) {
    return this.agents.checkVersionCompatibility(version);
  }

  @Get(':hostId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get agent by host ID' })
  getByHost(@TenantId() orgId: string, @Param('hostId') hostId: string) {
    return this.agents.getAgentByHost(orgId, hostId);
  }

  @Patch(':id/revoke')
  @Roles('admin')
  @ApiOperation({ summary: 'Revoke agent registration' })
  revoke(@TenantId() orgId: string, @Param('id') id: string) {
    return this.agents.revokeAgent(orgId, id);
  }
}
