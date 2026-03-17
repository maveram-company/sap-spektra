import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class MetricsHoursQueryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  hours?: number;
}

export class BreachesQueryDto {
  @IsOptional()
  @IsString()
  systemId?: string;

  @IsOptional()
  @IsString()
  resolved?: string;
}

export class SystemMetaQueryDto {
  @IsOptional()
  @IsString()
  systemId?: string;
}
