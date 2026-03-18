import { Module } from '@nestjs/common';
import { RunbooksService } from './runbooks.service';
import { RunbooksController } from './runbooks.controller';
import { RunbookExecutionEngineService } from './runbook-execution-engine.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [RunbooksController],
  providers: [RunbooksService, RunbookExecutionEngineService],
  exports: [RunbooksService, RunbookExecutionEngineService],
})
export class RunbooksModule {}
