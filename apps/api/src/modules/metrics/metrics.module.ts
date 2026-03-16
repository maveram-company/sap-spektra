import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsPipelineService } from './metrics-pipeline.service';
import { MetricsController } from './metrics.controller';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsPipelineService],
  exports: [MetricsService, MetricsPipelineService],
})
export class MetricsModule {}
