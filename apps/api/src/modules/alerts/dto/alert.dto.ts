import { IsOptional, IsString } from 'class-validator';

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
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  systemId?: string;
}
