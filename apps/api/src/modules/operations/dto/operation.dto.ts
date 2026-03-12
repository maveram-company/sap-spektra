import { IsString, IsNotEmpty, IsOptional, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOperationDto {
  @IsString()
  @IsNotEmpty()
  systemId!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  riskLevel?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledTime?: Date;

  @IsOptional()
  @IsString()
  schedule?: string;
}

export class UpdateOperationStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;
}
