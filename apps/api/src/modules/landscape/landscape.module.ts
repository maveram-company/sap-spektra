import { Module } from '@nestjs/common';
import { LandscapeService } from './landscape.service';
import { LandscapeController } from './landscape.controller';

@Module({
  controllers: [LandscapeController],
  providers: [LandscapeService],
  exports: [LandscapeService],
})
export class LandscapeModule {}
