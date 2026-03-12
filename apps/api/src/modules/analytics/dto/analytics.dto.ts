import { IsOptional, IsString } from 'class-validator';

export class SystemTrendsQueryDto {
  @IsOptional()
  @IsString()
  days?: string;
}
