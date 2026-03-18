import { Module } from '@nestjs/common';
import { SystemsService } from './systems.service';
import { SystemsController } from './systems.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [SystemsController],
  providers: [SystemsService],
  exports: [SystemsService],
})
export class SystemsModule {}
