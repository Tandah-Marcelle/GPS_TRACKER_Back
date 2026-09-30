import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateClientDto {
  @ApiPropertyOptional({ example: 'Transport SARL' })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  name?: string;

  @ApiPropertyOptional({ example: '+33 6 12 34 56 78' })
  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @ApiPropertyOptional({ example: '12 rue de la Paix, 75002 Paris' })
  @IsOptional()
  @IsString()
  @Length(3, 250)
  address?: string;
}
