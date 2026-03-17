import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OperationsService } from './operations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import {
  CreateOperationDto,
  OperationFiltersDto,
  UpdateOperationStatusDto,
} from './dto/operation.dto';

@ApiTags('Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List operations' })
  findAll(@TenantId() orgId: string, @Query() filters: OperationFiltersDto) {
    return this.operationsService.findAll(orgId, filters);
  }

  @Post()
  @Roles('operator')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Schedule a new operation' })
  create(
    @TenantId() orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateOperationDto,
  ) {
    return this.operationsService.create(orgId, {
      ...data,
      requestedBy: user.email,
    });
  }

  @Patch(':id/status')
  @Roles('operator')
  @ApiOperation({ summary: 'Update operation status' })
  updateStatus(
    @TenantId() orgId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateOperationStatusDto,
  ) {
    return this.operationsService.updateStatus(
      orgId,
      id,
      data.status,
      user.email,
    );
  }

  @Get('jobs')
  @Roles('viewer')
  @ApiOperation({ summary: 'List background job records' })
  jobs(@TenantId() orgId: string, @Query('systemId') systemId?: string) {
    return this.operationsService.getJobs(orgId, systemId);
  }

  @Get('transports')
  @Roles('viewer')
  @ApiOperation({ summary: 'List transport records' })
  transports(@TenantId() orgId: string, @Query('systemId') systemId?: string) {
    return this.operationsService.getTransports(orgId, systemId);
  }

  @Get('certificates')
  @Roles('viewer')
  @ApiOperation({ summary: 'List certificate records' })
  certificates(
    @TenantId() orgId: string,
    @Query('systemId') systemId?: string,
  ) {
    return this.operationsService.getCertificates(orgId, systemId);
  }
}
