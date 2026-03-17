import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class AuditFiltersDto {
  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
