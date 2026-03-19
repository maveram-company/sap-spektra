import {
  IsString,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class ConfigureCloudConnectorDto {
  @IsUUID()
  systemId!: string;

  @IsString()
  locationId!: string;

  @IsString()
  virtualHost!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  virtualPort!: number;

  @IsOptional()
  @IsIn(['RFC', 'HTTP', 'HTTPS'])
  protocol?: string;
}
