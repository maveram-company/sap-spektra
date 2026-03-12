import { IsOptional, IsString } from 'class-validator';

export class MetricsHoursQueryDto {
  @IsOptional()
  @IsString()
  hours?: string;
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
