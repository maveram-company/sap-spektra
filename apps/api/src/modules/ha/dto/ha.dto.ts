import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateHAStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;
}
