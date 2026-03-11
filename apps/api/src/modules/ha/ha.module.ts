import { Module } from '@nestjs/common';
import { HAService } from './ha.service';
import { HAController } from './ha.controller';

@Module({
  controllers: [HAController],
  providers: [HAService],
  exports: [HAService],
})
export class HAModule {}
