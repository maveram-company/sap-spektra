import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { UpdateSettingsDto, CreateApiKeyDto } from './dto/settings.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Get organization settings' })
  getSettings(@TenantId() orgId: string) {
    return this.settingsService.getSettings(orgId);
  }

  @Patch()
  @Roles('admin')
  @ApiOperation({ summary: 'Update organization settings' })
  updateSettings(
    @TenantId() orgId: string,
    @Body() settings: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(orgId, settings);
  }

  @Get('api-keys')
  @Roles('admin')
  @ApiOperation({ summary: 'List API keys' })
  getApiKeys(@TenantId() orgId: string) {
    return this.settingsService.getApiKeys(orgId);
  }

  @Post('api-keys')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new API key' })
  createApiKey(@TenantId() orgId: string, @Body() data: CreateApiKeyDto) {
    return this.settingsService.createApiKey(orgId, data.name);
  }

  @Patch('api-keys/:id/revoke')
  @Roles('admin')
  @ApiOperation({ summary: 'Revoke an API key' })
  revokeApiKey(@TenantId() orgId: string, @Param('id') id: string) {
    return this.settingsService.revokeApiKey(orgId, id);
  }
}
