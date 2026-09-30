import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'manager' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'Manager123!' })
  @IsString()
  @MinLength(6)
  password: string;
}
