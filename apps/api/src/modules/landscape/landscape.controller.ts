import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LandscapeService } from './landscape.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('Landscape')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('landscape')
export class LandscapeController {
  constructor(private readonly landscapeService: LandscapeService) {}

  @Get('validation')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get landscape validation checks for all systems' })
  validation(@TenantId() orgId: string) {
    return this.landscapeService.getValidation(orgId);
  }
}
