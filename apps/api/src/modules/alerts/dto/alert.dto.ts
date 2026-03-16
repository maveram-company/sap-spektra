import { IsOptional, IsString, IsIn } from 'class-validator';

export class ResolveAlertDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AlertFiltersDto {
  @IsOptional()
  @IsIn(['active', 'acknowledged', 'resolved'])
  status?: string;

  @IsOptional()
  @IsIn(['info', 'warning', 'critical'])
  level?: string;

  @IsOptional()
  @IsString()
  systemId?: string;
}
