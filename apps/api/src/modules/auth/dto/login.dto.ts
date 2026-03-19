import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@acme-corp.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ required: false })
  refreshToken?: string;

  @ApiProperty()
  user!: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId: string;
    organizationName: string;
  };
}

export class RegisterDto {
  @ApiProperty({ example: 'admin@acme-corp.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Password1' })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

  @ApiProperty({ example: 'Admin User' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'ACME Corp' })
  @IsString()
  organizationName!: string;
}
