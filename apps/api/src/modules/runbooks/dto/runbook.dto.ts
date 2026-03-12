import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class ExecuteRunbookDto {
  @IsString()
  @IsNotEmpty()
  systemId!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
