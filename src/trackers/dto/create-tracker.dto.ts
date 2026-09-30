import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class CreateTrackerDto {
  @ApiProperty({ example: '352099001761481', description: '15 digits, unique' })
  @IsString()
  @Matches(/^\d{15}$/, { message: 'IMEI must be exactly 15 digits' })
  imei: string;

  @ApiProperty({ example: 'Teltonika FMB640' })
  @IsString()
  @Length(2, 120)
  model: string;

  @ApiProperty({ example: '89310412106063919234', description: 'Unique SIM number' })
  @IsString()
  @Length(5, 40)
  simNumber: string;
}
