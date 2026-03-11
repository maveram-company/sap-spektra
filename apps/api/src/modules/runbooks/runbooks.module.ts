import { Module } from '@nestjs/common';
import { RunbooksService } from './runbooks.service';
import { RunbooksController } from './runbooks.controller';

@Module({
  controllers: [RunbooksController],
  providers: [RunbooksService],
  exports: [RunbooksService],
})
export class RunbooksModule {}
