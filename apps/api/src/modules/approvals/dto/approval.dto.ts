import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
} from 'class-validator';

export class CreateApprovalDto {
  @IsString()
  @IsNotEmpty()
  systemId!: string;

  @IsIn(['low', 'medium', 'high', 'critical'])
  severity!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  runbookId?: string;

  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @IsNumber()
  value?: number;
}
