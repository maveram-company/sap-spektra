import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateSystemDto {
  @ApiProperty({ example: 'EP1', description: '3-char SAP System ID' })
  @IsString()
  @Length(3, 3)
  sid!: string;

  @ApiProperty({ example: 'ERP Production' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 'S/4HANA' })
  @IsString()
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

  @ApiProperty({ example: 'PRD' })
  @IsString()
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
