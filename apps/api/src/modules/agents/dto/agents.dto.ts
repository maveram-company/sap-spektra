import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RegisterAgentDto {
  @IsString() @IsNotEmpty() systemId!: string;
  @IsString() @IsNotEmpty() hostId!: string;
  @IsString() @IsNotEmpty() agentVersion!: string;
  @IsString() @IsNotEmpty() osType!: string;
  @IsString() @IsNotEmpty() architecture!: string;
}

export class AgentHeartbeatDto {
  @IsString() @IsNotEmpty() hostId!: string;
  @IsString() @IsNotEmpty() agentVersion!: string;
  @IsString() @IsOptional() status?: string;
}
