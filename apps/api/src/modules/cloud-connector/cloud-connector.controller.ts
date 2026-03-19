import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CloudConnectorService } from './cloud-connector.service';
import { ConfigureCloudConnectorDto } from './dto/cloud-connector.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('Cloud Connector')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('cloud-connector')
export class CloudConnectorController {
  constructor(private readonly cloudConnectorService: CloudConnectorService) {}

  @Post('configure')
  @Roles('admin')
  @ApiOperation({ summary: 'Configure Cloud Connector for a system' })
  configure(
    @TenantId() orgId: string,
    @Body() dto: ConfigureCloudConnectorDto,
  ) {
    return this.cloudConnectorService.configureConnector(orgId, dto);
  }

  @Post(':systemId/test')
  @Roles('operator')
  @ApiOperation({ summary: 'Test Cloud Connector connection' })
  testConnection(
    @TenantId() orgId: string,
    @Param('systemId') systemId: string,
  ) {
    return this.cloudConnectorService.testConnection(orgId, systemId);
  }

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List all Cloud Connector configs' })
  listConfigs(@TenantId() orgId: string) {
    return this.cloudConnectorService.listConfigs(orgId);
  }

  @Get('limitations')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get RISE/Cloud Connector capability limitations' })
  getLimitations() {
    return this.cloudConnectorService.getCapabilityLimitations();
  }

  @Get(':systemId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get Cloud Connector config for a system' })
  getConfig(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.cloudConnectorService.getConfig(orgId, systemId);
  }

  @Delete(':systemId')
  @Roles('admin')
  @ApiOperation({ summary: 'Remove Cloud Connector config' })
  removeConfig(@TenantId() orgId: string, @Param('systemId') systemId: string) {
    return this.cloudConnectorService.removeConfig(orgId, systemId);
  }
}
