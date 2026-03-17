import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SystemTrendsQueryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  days?: number;
}
