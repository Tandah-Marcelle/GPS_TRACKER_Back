import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'manager',
    description: 'Username or the email address used at registration',
  })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ example: 'Manager123!' })
  @IsString()
  @MinLength(6)
  password: string;
}
