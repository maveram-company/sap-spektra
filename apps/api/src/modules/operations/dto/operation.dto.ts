import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDate,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum OperationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

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

export class OperationFiltersDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  systemId?: string;
}

export class UpdateOperationStatusDto {
  @IsEnum(OperationStatus)
  status!: OperationStatus;
}
