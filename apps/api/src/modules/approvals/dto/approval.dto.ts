import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateApprovalDto {
  @IsString()
  @IsNotEmpty()
  systemId!: string;

  @IsString()
  @IsNotEmpty()
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
