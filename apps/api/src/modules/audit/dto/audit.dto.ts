import { IsOptional, IsString } from 'class-validator';

export class AuditFiltersDto {
  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
