import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
