import { Module } from '@nestjs/common';
import { HAService } from './ha.service';
import { HAController } from './ha.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [HAController],
  providers: [HAService],
  exports: [HAService],
})
export class HAModule {}
