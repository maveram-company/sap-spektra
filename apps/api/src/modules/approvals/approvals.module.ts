import { Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { RunbooksModule } from '../runbooks/runbooks.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [RunbooksModule, AuditModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
