import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateVehicleDto {
  @ApiPropertyOptional({ example: 'cmuo4mbpm0002tvfeczs3o9ep' })
  @IsOptional()
  @IsString()
  @Length(8, 64)
  clientId?: string;

  @ApiPropertyOptional({ example: 'AB-123-CD' })
  @IsOptional()
  @IsString()
  @Length(2, 20)
  plate?: string;

  @ApiPropertyOptional({ example: 'Renault' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  brand?: string;

  @ApiPropertyOptional({ example: 'Kangoo' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  model?: string;
}
