import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateInterventionDto {
  @ApiProperty({ example: 'cmuo5gzq30002z2dwhuf8dyw0', description: 'Existing client id' })
  @IsString()
  @IsNotEmpty()
  @Length(8, 64)
  clientId: string;

  @ApiProperty({ example: 'cmuo5gzq40002z2dwhuf8dyw1', description: 'Existing vehicle id' })
  @IsString()
  @IsNotEmpty()
  @Length(8, 64)
  vehicleId: string;

  @ApiProperty({ example: 'cmuo5gzq50002z2dwhuf8dyw2', description: 'Existing technician user id' })
  @IsString()
  @IsNotEmpty()
  @Length(8, 64)
  technicianId: string;

  @ApiProperty({ example: '2026-10-02T09:00:00.000Z', description: 'Required, ISO 8601' })
  @IsISO8601({}, { message: 'scheduledAt must be a valid ISO 8601 date' })
  @IsNotEmpty()
  scheduledAt: string;

  @ApiProperty({ example: '12 rue de la Paix, 75002 Paris' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 250)
  address: string;
}
