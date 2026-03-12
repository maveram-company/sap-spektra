import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class EventFiltersDto {
  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  systemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
