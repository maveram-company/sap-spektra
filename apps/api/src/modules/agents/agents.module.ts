import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AuditModule } from '../audit/audit.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../../common/guards/api-key-auth.guard';
import { HybridAuthGuard } from '../../common/guards/hybrid-auth.guard';

@Module({
  imports: [AuditModule],
  controllers: [AgentsController],
  providers: [AgentsService, JwtAuthGuard, ApiKeyAuthGuard, HybridAuthGuard],
  exports: [AgentsService],
})
export class AgentsModule {}
