import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ example: 'Transport SARL' })
  @IsString()
  @Length(2, 150)
  name: string;

  @ApiProperty({ example: '+33 6 12 34 56 78' })
  @IsString()
  @Length(5, 40)
  phone: string;

  @ApiProperty({ example: '12 rue de la Paix, 75002 Paris' })
  @IsString()
  @Length(3, 250)
  address: string;
}
