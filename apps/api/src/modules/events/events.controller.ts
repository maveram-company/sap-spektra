import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { EventFiltersDto } from './dto/event.dto';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List events with optional filters' })
  findAll(@TenantId() orgId: string, @Query() filters: EventFiltersDto) {
    return this.eventsService.findAll(orgId, {
      level: filters.level,
      source: filters.source,
      systemId: filters.systemId,
      limit: filters.limit,
    });
  }
}
