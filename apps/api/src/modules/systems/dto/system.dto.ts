import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';

enum SapEnvironment {
  PRD = 'PRD',
  QAS = 'QAS',
  DEV = 'DEV',
  SBX = 'SBX',
  DR = 'DR',
}

const SAP_PRODUCTS = [
  'S4HANA',
  'ECC',
  'BW4HANA',
  'BW',
  'CRM',
  'SRM',
  'PI',
  'PO',
  'EP',
  'SOLMAN',
  'GRC',
  'IDES',
  'OTHER',
] as const;

export class CreateSystemDto {
  @ApiProperty({ example: 'EP1', description: '3-char SAP System ID' })
  @IsString()
  @Length(3, 3)
  sid!: string;

  @ApiProperty({ example: 'ERP Production' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 'S4HANA', enum: SAP_PRODUCTS })
  @IsIn(SAP_PRODUCTS)
  sapProduct!: string;

  @ApiProperty({ example: 'ABAP_BUSINESS_SUITE' })
  @IsString()
  productFamily!: string;

  @ApiProperty({ example: 'ABAP' })
  @IsString()
  sapStackType!: string;

  @ApiProperty({ example: 'SAP HANA 2.0' })
  @IsString()
  dbType!: string;

  @ApiProperty({ example: 'PRD', enum: SapEnvironment })
  @IsEnum(SapEnvironment)
  environment!: string;

  @ApiPropertyOptional({ example: 'ON_PREMISE' })
  @IsOptional()
  @IsString()
  deploymentModel?: string;

  @ApiPropertyOptional({ example: 'AGENT_FULL' })
  @IsOptional()
  @IsString()
  connectionMode?: string;
}

export class UpdateSystemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deploymentModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  connectionMode?: string;
}
