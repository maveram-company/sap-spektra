import { Module } from '@nestjs/common';
import { RunbooksService } from './runbooks.service';
import { RunbooksController } from './runbooks.controller';
import { RunbookExecutionEngineService } from './runbook-execution-engine.service';

@Module({
  controllers: [RunbooksController],
  providers: [RunbooksService, RunbookExecutionEngineService],
  exports: [RunbooksService, RunbookExecutionEngineService],
})
export class RunbooksModule {}
