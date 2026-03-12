import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('use-cases')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get available AI use cases' })
  useCases() {
    return this.aiService.getUseCases();
  }

  @Get('responses')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get recent AI-generated responses and insights' })
  responses(@TenantId() orgId: string) {
    return this.aiService.getResponses(orgId);
  }
}
