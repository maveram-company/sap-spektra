import { Module } from '@nestjs/common';
import { CloudConnectorService } from './cloud-connector.service';
import { CloudConnectorController } from './cloud-connector.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CloudConnectorController],
  providers: [CloudConnectorService],
  exports: [CloudConnectorService],
})
export class CloudConnectorModule {}
