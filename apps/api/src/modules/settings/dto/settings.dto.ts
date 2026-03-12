import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  notifications?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  security?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  general?: Record<string, unknown>;

  // Allow any additional settings keys
  [key: string]: unknown;
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'my-api-key' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
