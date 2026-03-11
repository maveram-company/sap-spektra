import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PlansService } from './plans.service';

@ApiTags('Plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'List all available plans' })
  findAll() {
    return this.plansService.findAll();
  }

  @Get(':tier')
  @ApiOperation({ summary: 'Get plan by tier' })
  findByTier(@Param('tier') tier: string) {
    return this.plansService.findByTier(tier);
  }
}
