import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SystemsService } from './systems.service';
import { CreateSystemDto, UpdateSystemDto } from './dto/system.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { QuotaGuard, Quota } from '../../common/guards/quota.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('Systems')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('systems')
export class SystemsController {
  constructor(private readonly systemsService: SystemsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List all SAP systems' })
  findAll(@TenantId() orgId: string) {
    return this.systemsService.findAll(orgId);
  }

  @Get('health-summary')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get health summary for all systems' })
  healthSummary(@TenantId() orgId: string) {
    return this.systemsService.getHealthSummary(orgId);
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get system by ID with full details' })
  findOne(@TenantId() orgId: string, @Param('id') id: string) {
    return this.systemsService.findOne(orgId, id);
  }

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles('admin')
  @UseGuards(QuotaGuard)
  @Quota('systems')
  @ApiOperation({ summary: 'Register a new SAP system' })
  create(@TenantId() orgId: string, @Body() dto: CreateSystemDto) {
    return this.systemsService.create(orgId, dto);
  }

  @Patch(':id')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles('operator')
  @ApiOperation({ summary: 'Update system configuration' })
  update(
    @TenantId() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSystemDto,
  ) {
    return this.systemsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles('admin')
  @ApiOperation({ summary: 'Deregister a system' })
  remove(@TenantId() orgId: string, @Param('id') id: string) {
    return this.systemsService.remove(orgId, id);
  }
}
