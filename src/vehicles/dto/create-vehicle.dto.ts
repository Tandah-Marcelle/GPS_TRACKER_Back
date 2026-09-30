import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty({ example: 'cmuo4mbpm0002tvfeczs3o9ep', description: 'Existing client id' })
  @IsString()
  @Length(8, 64)
  clientId: string;

  @ApiProperty({ example: 'AB-123-CD', description: 'Unique plate' })
  @IsString()
  @Length(2, 20)
  plate: string;

  @ApiProperty({ example: 'Renault' })
  @IsString()
  @Length(2, 80)
  brand: string;

  @ApiProperty({ example: 'Kangoo' })
  @IsString()
  @Length(1, 80)
  model: string;
}
